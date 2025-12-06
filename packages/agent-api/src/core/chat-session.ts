import { ChatMessage, ChatState, MessageUpdate, ChatSessionOptions, ChatSession, ChatSessionOptionsWithRequiredSettings } from '../types/chat.js';
import { Provider, ProviderId } from '../providers/types.js';
import { Agent, populateModelFromSettings } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { SessionToolPermission } from '../types/agent.js';
import { isToolPermissionRequired, getToolEffectiveIncludeMode, getToolIncludeServerDefault } from '../mcp/types.js';
import { ProviderHelper } from '../providers/provider-helper.js';
import { SupervisionManager } from '../types/supervision.js';
import { SessionContextItem, RequestContextItem, RequestContext } from '../types/context.js';

export class ChatSessionImpl implements ChatSession {
  private _id: string;
  private _autonomous: boolean;
  messages: ChatMessage[] = [];
  lastSyncId: number = 0;
  currentProvider?: ProviderId;
  currentModelId?: string;
  provider?: Provider;
  agent: Agent;
  contextItems: SessionContextItem[] = [];  // Tracked context items with include modes
  maxChatTurns: number;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  toolPermission: SessionToolPermission;
  contextTopK: number;
  contextTopN: number;
  contextIncludeScore: number;
  private approvedTools: Map<string, Set<string>> = new Map();
  private supervisionManager?: SupervisionManager;
  // Request context for the current prompt being processed. This persists across multiple
  // turns (e.g., when yielding to user for tool approval and then continuing), but is
  // reset when a new user message is received (new prompt). Contains semantically selected
  // items (rules, references, tools) that were chosen for the current prompt.
  private promptRequestContext?: RequestContext;

  constructor(agent: Agent, id: string, options: ChatSessionOptionsWithRequiredSettings, private logger: Logger) {
    this._id = id;
    this.agent = agent;

    populateModelFromSettings(agent, options);

    if (options.modelProvider && options.modelId) {
      this.currentProvider = options.modelProvider;
      this.currentModelId = options.modelId;
    } else {
      this.currentProvider = undefined;
      this.currentModelId = undefined;
    }

    // Determine autonomous state with validation
    if (agent.autonomous) {
      // Agent is autonomous, session must be autonomous
      if (options.autonomous === false) {
        const errorMsg = `Cannot create non-autonomous session ${id}: agent is autonomous and requires all sessions to be autonomous`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }
      this._autonomous = true;
      logger.debug(`Session ${id} created as autonomous (agent is autonomous)`);
    } else {
      // Agent is not autonomous, session can be autonomous or not (default to false)
      this._autonomous = options.autonomous ?? false;
      logger.debug(`Session ${id} created as ${this._autonomous ? 'autonomous' : 'interactive'} (agent is not autonomous)`);
    }

    this.maxChatTurns = options.maxChatTurns;
    this.maxOutputTokens = options.maxOutputTokens;
    this.temperature = options.temperature;
    this.topP = options.topP;
    this.toolPermission = options.toolPermission ?? 'tool';
    this.contextTopK = options.contextTopK;
    this.contextTopN = options.contextTopN;
    this.contextIncludeScore = options.contextIncludeScore;
    let modelDescription = '';

    // Provider will be created lazily when first needed
    if (this.currentProvider && this.currentModelId) {
      modelDescription = `You are using the ${this.currentProvider} provider${this.currentModelId ? ` and the ${this.currentModelId} model` : ''}`;
    } else {
      modelDescription = 'No model selected';
    }

    // Initialize messages
    this.messages = [
      ...(options.initialMessages || []),
      {
        role: 'system',
        content: `Welcome to TsAgent! ${modelDescription}`
      }
    ];

    // Add "always" include references to the session
    for (const reference of this.agent.getAllReferences()) {
      if (reference.include === 'always') {
        this.addReference(reference.name, 'always');
      }
    }

    // Add "always" include rules to the session
    for (const rule of this.agent.getAllRules()) {
      if (rule.include === 'always') {
        this.addRule(rule.name, 'always');
      }
    } 

    // Add "always" include tools to the session
    this.initializeAlwaysIncludeTools();

    this.logger.info(`Created new chat session with name ${this.agent.name} at path ${this.agent.path}`);    
    this.logger.info(`Created new chat session with model ${this.currentProvider}${this.currentModelId ? ` (${this.currentModelId})` : ''}`);
  }

  get id(): string {
    return this._id;
  }

  get autonomous(): boolean {
    return this._autonomous;
  }

  setSupervisionManager(supervisionManager: SupervisionManager): void {
    this.supervisionManager = supervisionManager;
  }

  setAutonomous(autonomous: boolean): boolean {
    if (this.agent.autonomous && !autonomous) {
      const errorMsg = `Cannot set session ${this._id} to non-autonomous: agent is autonomous and requires all sessions to be autonomous`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
    this._autonomous = autonomous;
    this.logger.info(`Session ${this._id} autonomous state changed from ${!autonomous} to ${autonomous}`);
    return true;
  }

  /**
   * Ensure provider is created (lazy initialization)
   */
  private async ensureProvider(): Promise<void> {
    if (this.provider) {
      return;
    }

    if (!this.currentProvider || !this.currentModelId) {
      throw new Error('No provider configured for this session');
    }

    const llm = await this.agent.createProvider(this.currentProvider, this.currentModelId);
    if (!llm) {
      throw new Error(`Failed to create LLM instance for model ${this.currentProvider}`);
    }
    this.provider = llm;
  }

  getState(): ChatState {
    // Normalize inference parameters: when temperature is 0, topP must be >= 0.01
    // This prevents validation errors from providers that require topP > 0
    const normalizedTopP = this.temperature === 0 ? Math.max(this.topP, 0.01) : this.topP;
    
    return {
      messages: [...this.messages],
      lastSyncId: this.lastSyncId,
      currentModelProvider: this.currentProvider,
      currentModelId: this.currentModelId,
      contextItems: [...this.contextItems],  // Include tracked context items
      autonomous: this._autonomous,
      maxChatTurns: this.maxChatTurns,
      maxOutputTokens: this.maxOutputTokens,
      temperature: this.temperature,
      topP: normalizedTopP,
      toolPermission: this.toolPermission,
      contextTopK: this.contextTopK,
      contextTopN: this.contextTopN,
      contextIncludeScore: this.contextIncludeScore,
    };
  }

  getLastRequestContext(): RequestContext | undefined {
    return this.promptRequestContext;
  }

  /**
   * Build request context from session context + agent items
   * Includes session context items (always + manual) plus agent-selected items via semantic search
   */
  private async buildRequestContext(
    userMessage: string
  ): Promise<RequestContext> {
    const requestItems: RequestContextItem[] = [];
    
    // Step 1: Add all session context items (always + manual)
    for (const sessionItem of this.contextItems) {
      // Convert SessionContextItem to RequestContextItem
      if (sessionItem.type === 'tool') {
        requestItems.push({
          type: 'tool',
          name: sessionItem.name,
          serverName: sessionItem.serverName,
          includeMode: sessionItem.includeMode,
        });
      } else {
        requestItems.push({
          type: sessionItem.type,
          name: sessionItem.name,
          includeMode: sessionItem.includeMode,
        });
      }
    }
    
    // Step 2: Add agent mode items via semantic search (if available)
    const agentModeItems = this.getAgentModeItems();
    if (agentModeItems.length > 0) {
      try {
        // Convert RequestContextItem[] to SessionContextItem[] for search
        // Note: includeMode is required by SessionContextItem type but not used by search
        // We use 'always' as a placeholder since these are agent mode items being searched
        const sessionItemsForSearch: SessionContextItem[] = agentModeItems.map(item => {
          if (item.type === 'tool') {
            return {
              type: 'tool',
              name: item.name,
              serverName: item.serverName,
              includeMode: 'always' as const,  // Placeholder - search doesn't use includeMode
            };
          } else {
            return {
              type: item.type,
              name: item.name,
              includeMode: 'always' as const,  // Placeholder - search doesn't use includeMode
            };
          }
        });

        // Use semantic search to select relevant agent mode items
        const searchResults = await this.agent.searchContextItems(
          userMessage,
          sessionItemsForSearch,
          {
            topK: this.contextTopK,
            topN: this.contextTopN,
            includeScore: this.contextIncludeScore,
          }
        );
        
        // Add agent-selected items to request context
        // searchResults are already RequestContextItem[] with includeMode: 'agent' and similarityScore
        requestItems.push(...searchResults);
      } catch (error) {
        // Semantic search is optional - if it fails, continue without agent items
        this.logger?.warn('Semantic search failed, continuing without agent mode items', error);
      }
    }
    
    return {
      items: requestItems,
    };
  }

  /**
   * Helper function to get agent mode items (items with include: 'agent' that are NOT in session context)
   * Returns RequestContextItem[] for use in semantic search.
   * 
   * For tools, filters based on autonomous state and permissions to ensure semantic search only
   * considers tools that will actually be available (prevents selecting tools that will be filtered out later).
   */
  private getAgentModeItems(): RequestContextItem[] {
    const items: RequestContextItem[] = [];
    
    // Get rules with include: 'agent'
    for (const rule of this.agent.getAllRules()) {
      if (rule.include === 'agent') {
        // Check if not already in session
        const inSession = this.contextItems.some(
          item => item.type === 'rule' && item.name === rule.name
        );
        if (!inSession) {
          items.push({
            name: rule.name,
            type: 'rule',
            includeMode: 'agent',  // Will be included via semantic search
          });
        }
      }
    }
    
    // Get references with include: 'agent'
    for (const reference of this.agent.getAllReferences()) {
      if (reference.include === 'agent') {
        // Check if not already in session
        const inSession = this.contextItems.some(
          item => item.type === 'reference' && item.name === reference.name
        );
        if (!inSession) {
          items.push({
            name: reference.name,
            type: 'reference',
            includeMode: 'agent',  // Will be included via semantic search
          });
        }
      }
    }
    
    // Get tools with include: 'agent'
    // Filter based on autonomous state and permissions so semantic search only considers
    // tools that will actually be available (prevents wasting topN slots on filtered tools)
    const mcpClients = this.agent.getAllMcpClientsSync();
    for (const [serverName, client] of Object.entries(mcpClients)) {
      const serverConfig = this.agent.getMcpServer(serverName)?.config;
      if (!serverConfig) continue;
      
      for (const tool of client.serverTools) {
        const effectiveMode = getToolEffectiveIncludeMode(serverConfig, tool.name);
        if (effectiveMode === 'agent') {
          // Check if not already in session
          const inSession = this.contextItems.some(
            item => item.type === 'tool' && 
                    item.name === tool.name && 
                    item.serverName === serverName
          );
          if (!inSession) {
            // Check if tool would be available after autonomous/permission filtering
            // This ensures semantic search only considers tools that will actually be included
            if (ProviderHelper.isToolAvailableForSession(this, serverConfig, tool.name)) {
              items.push({
                name: tool.name,
                type: 'tool',
                serverName: serverName,
                includeMode: 'agent',
              });
            }
          }
        }
      }
    }
    
    return items;
  }

  //  We're going to construct and pass a bag of messages to the LLM (context)
  //     - System prompt
  //     - Historical messages (set)
  //       - User message
  //       - Server reply (set)
  //         - Text reply (when no tool call, final message, when tool call, explanatory text related to tool call)
  //         - Tool call
  //         - Tool call result (coorrelated to call)
  //     - References (set)
  //     - Rules (set)
  //     - User message
  //
  // ModelReply type gives us metadata and turn results - including message, tool calls (possibly multiple), and an error if applicable
  // - Sometimes we get multiple tool calls in one turn
  // - Sometimes we get explanatory text with a tool call (or multiple tool calls)
  //
  async handleMessage(message: string | ChatMessage): Promise<MessageUpdate> {
    await this.ensureProvider();
    if (!this.provider) {
      throw new Error('No LLM instance available');
    }

    if (typeof message === 'string') {
      message = {
        role: 'user',
        content: message
      };
    }

    // Handle user message text processing
    if (message.role === 'user') {
      // Search user message for each instance of @ref:[referenceName] and @rule:[ruleName] and inject found references and rules
      const referenceRegex = /@ref:([\w-]+)/g;
      const ruleRegex = /@rule:([\w-]+)/g;
      const referenceMatches = message.content.match(referenceRegex);
      const ruleMatches = message.content.match(ruleRegex);

      // Clean up the message by removing @mentions
      let cleanMessage = message.content;
      if (referenceMatches) {
        cleanMessage = cleanMessage.replace(referenceRegex, '');
        for (const match of referenceMatches) {
          const referenceName = match.replace('@ref:', '');
          // Use addReference method which handles contextItems tracking
          this.addReference(referenceName, 'manual');
        }
      }
      
      if (ruleMatches) {
        cleanMessage = cleanMessage.replace(ruleRegex, '');
        for (const match of ruleMatches) {
          const ruleName = match.replace('@rule:', '');
          // Use addRule method which handles contextItems tracking
          this.addRule(ruleName, 'manual');
        }
      }
      
      // Clean up any extra whitespace that might have been left
      cleanMessage = cleanMessage.replace(/\s+/g, ' ').trim();

      message.content = cleanMessage;
    }

    // Build request context (for this request/response pair)
    // 
    // Request context contains:
    //   - All session context items (always + manual)
    //   - Semantically selected items (rules, references, tools with include: 'agent')
    //
    // For approval messages, reuse the prompt request context from the initial user message
    // to maintain consistent context across all turns of a multi-turn conversation (even when
    // yielding to user for tool approval and continuing with generateResponse calls).
    // For new user messages, build a fresh request context (semantic search runs again).
    let requestContext: RequestContext;
    if (message.role === 'approval' && this.promptRequestContext) {
      // Reuse the prompt request context for approval messages (continuation of same prompt)
      // This ensures semantically selected tools/items persist across multiple turns
      requestContext = this.promptRequestContext;
    } else {
      // Build new request context for user messages (new prompt)
      // This triggers fresh semantic search and resets semantically selected items
      const userMessageContent = message.role === 'user' ? message.content : '';
      requestContext = await this.buildRequestContext(userMessageContent);
      this.promptRequestContext = requestContext;
    }

    // Build messages array, starting with system prompt and existing non-system messages
    const systemPrompt = await this.agent.getSystemPrompt();
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.messages.filter(m => m.role !== 'system')
    ];
    
    // Add the references to the messages array (from request context)
    for (const item of requestContext.items) {
      if (item.type === 'reference') {
        const reference = this.agent.getReference(item.name);
      if (reference) {
        messages.push({
          role: 'user',
          content: `Reference: ${reference.text}`
        }); 
        }
      }
    }
    
    // Add the rules to the messages array (from request context)
    for (const item of requestContext.items) {
      if (item.type === 'rule') {
        const rule = this.agent.getRule(item.name);
      if (rule) {
        messages.push({
          role: 'user',
          content: `Rule: ${rule.text}`
        });
        }
      }
    }

    // Add the user message to the messages array
    this.messages.push(message);
    messages.push(message);

    // Apply supervision with full context right before model call
    if (this.supervisionManager) {
      try {
        const result = await this.supervisionManager.processRequest(
          this, 
          messages  // Pass the full context that will be sent to the model
        );
        
        // Handle the supervision result
        if (result.action === 'block') {
          const reason = result.reasons?.join('; ') || 'No reason provided';
          this.logger.warn(`Message blocked by supervisor: ${reason}`);
          return {
            updates: [{
              role: 'error',
              content: `Message blocked: ${reason}`
            }],
            lastSyncId: this.lastSyncId,
          };
        }
        
        // Use the final message (modified or original)
        if (result.action === 'modify' && result.finalMessage) {
          message = result.finalMessage;
          // Update the messages array with the modified message
          messages[messages.length - 1] = result.finalMessage;
          this.logger.info(`Message modified by supervisor: ${result.reasons?.join('; ') || 'No reason provided'}`);
        } else if (result.action === 'allow' && result.finalMessage) {
          message = result.finalMessage;
          messages[messages.length - 1] = result.finalMessage;
        }
      } catch (error) {
        this.logger.error('Error in supervision system:', error);
        // Continue with original message if supervision fails
      }
    }

    try {
      // Log the model being used for this request
      this.logger.info(`[ChatSession] Generating response using model ${this.currentProvider}${this.currentModelId ? ` with ID: ${this.currentModelId}` : ''}`);      
      await this.ensureProvider();
      if (!this.provider) {
        throw new Error('Provider not initialized');
      }
      const modelResponse = await this.provider.generateResponse(this, messages);
      if (!modelResponse) {
        throw new Error(`Failed to generate response from ${this.currentProvider}`);
      }

      this.logger.debug('All turns', JSON.stringify(modelResponse.turns, null, 2));

      const replyMessage: ChatMessage = {
        role: 'assistant' as const,
        modelReply: modelResponse,
        requestContext: requestContext  // Attach the context used for this request/response pair
      };
      
      this.messages.push(replyMessage);
      this.lastSyncId++;
      
      let response: MessageUpdate = {
        updates: [message, replyMessage],
        lastSyncId: this.lastSyncId,
      };

      // Apply supervision to response if available
      if (this.supervisionManager) {
        try {
          const result = await this.supervisionManager.processResponse(
            this,
            response
          );
          
          if (result.action === 'block') {
            // If response is blocked, return error
            const reason = result.reasons?.join('; ') || 'Response blocked by supervisor';
            this.logger.warn(`Response blocked by supervisor: ${reason}`);
            return {
              updates: [{
                role: 'error',
                content: `Response blocked: ${reason}`
              }],
              lastSyncId: this.lastSyncId,
            };
          }
          
          // Use the final response (modified or original)
          if (result.action === 'modify' && result.finalResponse) {
            response = result.finalResponse;
            this.logger.info(`Response modified by supervisor: ${result.reasons?.join('; ') || 'No reason provided'}`);
          } else if (result.action === 'allow' && result.finalResponse) {
            response = result.finalResponse;
          }
        } catch (error) {
          this.logger.error('Error in supervision response processing:', error);
          // Continue with original response if supervision fails
        }
      }
      
      return response;
    } catch (error) {
      this.logger.error(`Error handling message in session:`, error);
      throw error;
    }
  }

  clearModel(): MessageUpdate {
    this.currentProvider = undefined;
    this.currentModelId = undefined;
    this.provider = undefined;

    const systemMessage: ChatMessage = {
      role: 'system',
      content: 'Cleared model, no model currently active'
    };
    this.messages.push(systemMessage);
    this.lastSyncId++;

    return {
      updates: [systemMessage],
      lastSyncId: this.lastSyncId,
    };
  }

  switchModel(modelType: ProviderId, modelId: string): MessageUpdate {
    try {
      // Create new LLM instance
      const llm = this.agent.createProvider(modelType, modelId);
      if (!llm) {
        throw new Error(`Failed to create LLM instance for model ${modelType}`);
      }

      // Update session with new model and LLM
      this.currentProvider = modelType;
      this.currentModelId = modelId;
      // Provider will be created lazily on next use
      this.provider = undefined;

      // Generate a display model name - either the model ID or a descriptive name for the model type
      let displayName = modelId || modelType;

      // Add a system message about the model switch
      const systemMessage: ChatMessage = {
        role: 'system',
        content: `Switched to the ${modelType} provider${modelId ? ` and the ${displayName} model` : ''}`
      };
      this.messages.push(systemMessage);
      this.lastSyncId++;
      
      this.logger.info(`Switched model to ${modelType}${modelId ? ` (${modelId})` : ''}`);
      return {
        updates: [systemMessage],
        lastSyncId: this.lastSyncId,
      };
    } catch (error) {
      this.logger.error(`Error switching model:`, error);
      const systemMessage: ChatMessage = {
        role: 'system',
        content: `Failed to create LLM instance for model ${modelType}${modelId ? ` (${modelId})` : ''}, error: ${error}`
      };
      this.lastSyncId++;
      return {
        updates: [systemMessage],
        lastSyncId: this.lastSyncId,
      };
    }
  }

  addReference(referenceName: string, method: 'always' | 'manual' = 'manual'): boolean {
    // Check if already in contextItems
    if (this.contextItems.some(item => item.type === 'reference' && item.name === referenceName)) {
      return false; // Already exists
    }
    
    // Validate reference exists
    const reference = this.agent.getReference(referenceName);
    if (!reference) {
      this.logger.warn(`Attempted to add non-existent reference: ${referenceName}`);
      return false;
    }
    
    this.contextItems.push({
      type: 'reference',
      name: referenceName,
      includeMode: method,
    });
    this.lastSyncId++;
    this.logger.info(`Added reference '${referenceName}' to chat session (${method})`);
    return true;
  }

  removeReference(referenceName: string): boolean {
    const index = this.contextItems.findIndex(
      item => item.type === 'reference' && item.name === referenceName
    );
    if (index === -1) {
      return false; // Doesn't exist
    }
    
    this.contextItems.splice(index, 1);
    this.lastSyncId++;
    this.logger.info(`Removed reference '${referenceName}' from chat session`);
    return true;
  }

  addRule(ruleName: string, method: 'always' | 'manual' = 'manual'): boolean {
    // Check if already in contextItems
    if (this.contextItems.some(item => item.type === 'rule' && item.name === ruleName)) {
      return false; // Already exists
    }
    
    // Validate rule exists
    const rule = this.agent.getRule(ruleName);
    if (!rule) {
      this.logger.warn(`Attempted to add non-existent rule: ${ruleName}`);
      return false;
    }
    
    this.contextItems.push({
      type: 'rule',
      name: ruleName,
      includeMode: method,
    });
    this.lastSyncId++;
    this.logger.info(`Added rule '${ruleName}' to chat session (${method})`);
    return true;
  }

  removeRule(ruleName: string): boolean {
    const index = this.contextItems.findIndex(
      item => item.type === 'rule' && item.name === ruleName
    );
    if (index === -1) {
      return false; // Doesn't exist
    }
    
    this.contextItems.splice(index, 1);
    this.lastSyncId++;
    this.logger.info(`Removed rule '${ruleName}' from chat session`);
    return true;
  }

  async addTool(serverName: string, toolName: string, method: 'always' | 'manual' = 'manual'): Promise<boolean> {
    // Check if tool is already in contextItems
    if (this.contextItems.some(
      item => item.type === 'tool' && 
              item.name === toolName && 
              item.serverName === serverName
    )) {
      return false; // Already exists
    }
    
    // Validate tool exists in the server
    try {
      const mcpClients = await this.agent.getAllMcpClients();
      const client = mcpClients[serverName];
      if (!client) {
        this.logger.warn(`Attempted to add tool from non-existent server: ${serverName}`);
        return false;
      }
      
      const tool = client.serverTools.find((t: any) => t.name === toolName);
      if (!tool) {
        this.logger.warn(`Attempted to add non-existent tool: ${serverName}:${toolName}`);
        return false;
      }
      
      this.contextItems.push({
        type: 'tool',
        name: toolName,
        serverName: serverName,
        includeMode: method,
      });
      this.lastSyncId++;
      this.logger.info(`Added tool '${serverName}:${toolName}' to chat session (${method})`);
      return true;
    } catch (error) {
      this.logger.error(`Error adding tool '${serverName}:${toolName}' to chat session:`, error);
      return false;
    }
  }

  removeTool(serverName: string, toolName: string): boolean {
    const index = this.contextItems.findIndex(
      item => item.type === 'tool' && 
              item.name === toolName && 
              item.serverName === serverName
    );
    if (index === -1) {
      return false; // Doesn't exist
    }
    
    this.contextItems.splice(index, 1);
    this.lastSyncId++;
    this.logger.info(`Removed tool '${serverName}:${toolName}' from chat session`);
    return true;
  }

  getIncludedTools(): Array<{serverName: string, toolName: string}> {
    return this.contextItems
      .filter(item => item.type === 'tool')
      .map(item => ({ serverName: item.serverName!, toolName: item.name }));
  }

  private initializeAlwaysIncludeTools(): void {
    try {
      const mcpServers = this.agent.getAgentMcpServers();
      if (!mcpServers) return;

      const mcpClients = this.agent.getAllMcpClientsSync();

      for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
        const client = mcpClients[serverName];
        if (!client?.serverTools?.length) continue;

        for (const tool of client.serverTools) {
          if (getToolEffectiveIncludeMode(serverConfig, tool.name) === 'always') {
            const alreadyIncluded = this.contextItems.some(
              item =>
                item.type === 'tool' &&
                item.name === tool.name &&
                item.serverName === serverName
            );
            if (alreadyIncluded) continue;

            this.contextItems.push({
              type: 'tool',
              name: tool.name,
              serverName: serverName,
              includeMode: 'always',
            });
            this.logger.info(`Added always-include tool '${serverName}:${tool.name}' to session`);
          }
        }
      }
    } catch (error) {
      this.logger.warn('Error initializing always-include tools:', error);
    }
  }



  toolIsApprovedForSession(serverId: string, toolId: string) {
    let serverApprovedTools = this.approvedTools.get(serverId);
    if (!serverApprovedTools) {
      serverApprovedTools = new Set();
      this.approvedTools.set(serverId, serverApprovedTools);
    }
    serverApprovedTools.add(toolId);
  }

  public async isToolApprovalRequired(serverId: string, toolId: string): Promise<boolean> {
    // Safety check: In autonomous sessions, tool approval should never be required
    // (filtering in ProviderHelper.getIncludedTools should prevent this, but add safety check)
    if (this._autonomous) {
      const serverConfig = this.agent.getMcpServer(serverId)?.config;
      if (serverConfig) {
        const requiresPermission = isToolPermissionRequired(serverConfig, toolId);
        if (requiresPermission) {
          this.logger.error(
            `SAFETY CHECK FAILED: Tool ${serverId}:${toolId} requires permission but session is autonomous. ` +
            `This should have been filtered out. Tool will be denied.`
          );
          // Return true to deny the tool as a safety measure
          return true;
        }
      }
    }

    // First check if the tool has already been approved for this session
    const serverApprovedTools = this.approvedTools.get(serverId);
    if (serverApprovedTools?.has(toolId)) {
      this.logger.info(`Tool ${toolId} - already approved for this session, returning false`);
      return false;
    }

    // If the tool is not approved for this session, then we need to check the tool permission
    if (this.toolPermission === 'always') {
      this.logger.info(`Tool ${toolId} - permission always required for all tools, returning true`);
      return true;
    } else if (this.toolPermission === 'never') {
      this.logger.info(`Tool ${toolId} - permission never required for all tools, returning false`);
      return false;
    } else { // 'tool'
      this.logger.info(`Tool ${toolId} - permission tool required, checking server config`);
      // Check the permission required for the tool
      const serverConfig = this.agent.getMcpServer(serverId)?.config;
      if (!serverConfig) {
        throw new Error(`Attempted to check permission for non-existent server: ${serverId}`);
      }

      const required = isToolPermissionRequired(serverConfig, toolId);
      this.logger.info(`Tool ${toolId} - permission ${required ? 'required' : 'not required'}, returning ${required}`);
      return required;
    }

    // If the above logic fails to deliver a defintive result, then we default to always requiring tool approval
    this.logger.warn(`Tool ${toolId} - no definitive permission result, defaulting to true`);
    return true;
  }

  updateSettings(settings: {
    maxChatTurns: number;
    maxOutputTokens: number;
    temperature: number;
    topP: number;
    toolPermission: SessionToolPermission;
    contextTopK: number;
    contextTopN: number;
    contextIncludeScore: number;
  }): boolean {
    this.maxChatTurns = settings.maxChatTurns;
    this.maxOutputTokens = settings.maxOutputTokens;
    this.temperature = settings.temperature;
    this.topP = settings.topP;
    this.toolPermission = settings.toolPermission;
    this.contextTopK = settings.contextTopK;
    this.contextTopN = settings.contextTopN;
    this.contextIncludeScore = settings.contextIncludeScore;
    
    // Use debug level to avoid log spam when sliders are dragged
    this.logger.debug(`Updated chat session settings:`, settings);
    return true;
  }
} 