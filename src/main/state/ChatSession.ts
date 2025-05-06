import { ChatMessage, ChatState, MessageUpdate, ChatSessionOptions } from '../../shared/ChatSession';
import { LLMType } from '../../shared/llm';
import { ILLM } from '../../shared/llm';
import log from 'electron-log';
import { WorkspaceManager } from './WorkspaceManager';
import { SessionToolPermission, SESSION_TOOL_PERMISSION_TOOL, SESSION_TOOL_PERMISSION_ALWAYS, SESSION_TOOL_PERMISSION_NEVER } from '../../shared/workspace';
import { TOOL_PERMISSION_NOT_REQUIRED, TOOL_PERMISSION_REQUIRED } from '../mcp/types';

type RequiredSettings = Required<Pick<ChatSessionOptions, 'maxChatTurns' | 'maxOutputTokens' | 'temperature' | 'topP' | 'toolPermission'>>;
export type ChatSessionOptionsWithRequiredSettings = Omit<ChatSessionOptions, keyof RequiredSettings> & RequiredSettings;

export class ChatSession {
  messages: ChatMessage[] = [];
  lastSyncId: number = 0;
  currentProvider?: LLMType;
  currentModelId?: string;
  llm?: ILLM;
  workspace: WorkspaceManager;
  rules: string[] = [];
  references: string[] = [];
  maxChatTurns: number;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  toolPermission: SessionToolPermission;
  private approvedTools: Map<string, Set<string>> = new Map();

  constructor(workspace: WorkspaceManager, options: ChatSessionOptionsWithRequiredSettings) {
    this.workspace = workspace;
    if (options.modelProvider && options.modelId) {
      this.currentProvider = options.modelProvider;
      this.currentModelId = options.modelId;
    } else {
      this.currentProvider = undefined;
      this.currentModelId = undefined;
    }

    this.maxChatTurns = options.maxChatTurns;
    this.maxOutputTokens = options.maxOutputTokens;
    this.temperature = options.temperature;
    this.topP = options.topP;
    this.toolPermission = (options.toolPermission === SESSION_TOOL_PERMISSION_TOOL || options.toolPermission === SESSION_TOOL_PERMISSION_ALWAYS || options.toolPermission === SESSION_TOOL_PERMISSION_NEVER)
      ? options.toolPermission
      : SESSION_TOOL_PERMISSION_TOOL;
    let modelDescription = '';

    // Create the LLM instance
    if (this.currentProvider && this.currentModelId) {
      const llm = this.workspace.llmFactory.create(this.currentProvider, this.currentModelId);
      if (!llm) {
        throw new Error(`Failed to create LLM instance for model ${this.currentProvider}`);
      }
      this.llm = llm;
      modelDescription = `You are using the ${this.currentProvider} provider${this.currentModelId ? ` and the ${this.currentModelId} model` : ''}`;
    } else {
      modelDescription = 'No model selected';
    }

    // Initialize messages
    this.messages = [
      ...(options.initialMessages || []),
      {
        role: 'system',
        content: `Welcome to TeamSpark AI Workbench! ${modelDescription}`
      }
    ];

    // Add "always" include references to the session
    for (const reference of this.workspace.referencesManager.getReferences()) {
      if (reference.include === 'always') {
        this.addReference(reference.name);
      }
    }

    // Add "always" include rules to the session
    for (const rule of this.workspace.rulesManager.getRules()) {
      if (rule.include === 'always') {
        this.addRule(rule.name);
      }
    } 
    
    log.info(`Created new chat session with model ${this.currentProvider}${this.currentModelId ? ` (${this.currentModelId})` : ''}`);
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
    if (!this.llm) {
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
          if (!this.references.includes(referenceName)) {
            this.references.push(referenceName);
          }
        }
      }
      
      if (ruleMatches) {
        cleanMessage = cleanMessage.replace(ruleRegex, '');
        for (const match of ruleMatches) {
          const ruleName = match.replace('@rule:', '');
          if (!this.rules.includes(ruleName)) {
            this.rules.push(ruleName);
          }
        }
      }
      
      // Clean up any extra whitespace that might have been left
      cleanMessage = cleanMessage.replace(/\s+/g, ' ').trim();

      message.content = cleanMessage;
    }

    // Build messages array, starting with system prompt and existing non-system messages
    const systemPrompt = await this.workspace.getSystemPrompt();
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.messages.filter(m => m.role !== 'system')
    ];
    
    // Add the references to the messages array
    for (const referenceName of this.references) {
      const reference = this.workspace.referencesManager.getReference(referenceName);
      if (reference) {
        messages.push({
          role: 'user',
          content: `Reference: ${reference.text}`
        }); 
      }
    }
    
    // Add the rules to the messages array
    for (const ruleName of this.rules) {
      const rule = this.workspace.rulesManager.getRule(ruleName);
      if (rule) {
        messages.push({
          role: 'user',
          content: `Rule: ${rule.text}`
        });
      }
    }

    // Add the user message to the messages array
    this.messages.push(message);
    messages.push(message);

    try {
      // Log the model being used for this request
      log.info(`Generating response using model ${this.currentProvider}${this.currentModelId ? ` with ID: ${this.currentModelId}` : ''}`);      
      const response = await this.llm.generateResponse(this, messages);
      if (!response) {
        throw new Error(`Failed to generate response from ${this.currentProvider}`);
      }

      log.debug('All turns', JSON.stringify(response.turns, null, 2));

      const replyMessage = {
        role: 'assistant' as const,
        modelReply: response
      };
      
      this.messages.push(replyMessage);
      this.lastSyncId++;
      
      return {
        updates: [message, replyMessage],
        lastSyncId: this.lastSyncId,
        references: [...this.references],
        rules: [...this.rules]
      };
    } catch (error) {
      log.error(`Error handling message in session:`, error);
      throw error;
    }
  }

  clearModel(): MessageUpdate {
    this.currentProvider = undefined;
    this.currentModelId = undefined;
    this.llm = undefined;

    const systemMessage: ChatMessage = {
      role: 'system',
      content: 'Cleared model, no model currently active'
    };
    this.messages.push(systemMessage);
    this.lastSyncId++;

    return {
      updates: [systemMessage],
      lastSyncId: this.lastSyncId,
      references: [...this.references],
      rules: [...this.rules]
    };
  }

  switchModel(modelType: LLMType, modelId: string): MessageUpdate {
    try {
      // Create new LLM instance
      const llm = this.workspace.llmFactory.create(modelType, modelId);
      if (!llm) {
        throw new Error(`Failed to create LLM instance for model ${modelType}`);
      }

      // Update session with new model and LLM
      this.currentProvider = modelType;
      this.currentModelId = modelId;
      this.llm = llm;

      // Generate a display model name - either the model ID or a descriptive name for the model type
      let displayName = modelId || modelType;

      // Add a system message about the model switch
      const systemMessage: ChatMessage = {
        role: 'system',
        content: `Switched to the ${modelType} provider${modelId ? ` and the ${displayName} model` : ''}`
      };
      this.messages.push(systemMessage);
      this.lastSyncId++;
      
      log.info(`Switched model to ${modelType}${modelId ? ` (${modelId})` : ''}`);
      return {
        updates: [systemMessage],
        lastSyncId: this.lastSyncId,
        references: [...this.references],
        rules: [...this.rules]
      };
    } catch (error) {
      log.error(`Error switching model:`, error);
      const systemMessage: ChatMessage = {
        role: 'system',
        content: `Failed to create LLM instance for model ${modelType}${modelId ? ` (${modelId})` : ''}, error: ${error}`
      };
      this.lastSyncId++;
      return {
        updates: [systemMessage],
        lastSyncId: this.lastSyncId,
        references: [...this.references],
        rules: [...this.rules]
      };
    }
  }

  getState(): ChatState {
    return {
      messages: [...this.messages],
      lastSyncId: this.lastSyncId,
      currentModelProvider: this.currentProvider,
      currentModelId: this.currentModelId,
      references: [...this.references],
      rules: [...this.rules],
      maxChatTurns: this.maxChatTurns,
      maxOutputTokens: this.maxOutputTokens,
      temperature: this.temperature,
      topP: this.topP,
      toolPermission: this.toolPermission,
    };
  }

  addReference(referenceName: string): boolean {
    if (this.references.includes(referenceName)) {
      return false; // Already exists
    }
    
    // Validate reference exists
    const reference = this.workspace.referencesManager.getReference(referenceName);
    if (!reference) {
      log.warn(`Attempted to add non-existent reference: ${referenceName}`);
      return false;
    }
    
    this.references.push(referenceName);
    this.lastSyncId++;
    log.info(`Added reference '${referenceName}' to chat session`);
    return true;
  }

  removeReference(referenceName: string): boolean {
    const index = this.references.indexOf(referenceName);
    if (index === -1) {
      return false; // Doesn't exist
    }
    
    this.references.splice(index, 1);
    this.lastSyncId++;
    log.info(`Removed reference '${referenceName}' from chat session`);
    return true;
  }

  addRule(ruleName: string): boolean {
    if (this.rules.includes(ruleName)) {
      return false; // Already exists
    }
    
    // Validate rule exists
    const rule = this.workspace.rulesManager.getRule(ruleName);
    if (!rule) {
      log.warn(`Attempted to add non-existent rule: ${ruleName}`);
      return false;
    }
    
    this.rules.push(ruleName);
    this.lastSyncId++;
    log.info(`Added rule '${ruleName}' to chat session`);
    return true;
  }

  removeRule(ruleName: string): boolean {
    const index = this.rules.indexOf(ruleName);
    if (index === -1) {
      return false; // Doesn't exist
    }
    
    this.rules.splice(index, 1);
    this.lastSyncId++;
    log.info(`Removed rule '${ruleName}' from chat session`);
    return true;
  }

  public toolIsApprovedForSession(serverId: string, toolId: string) {
    let serverApprovedTools = this.approvedTools.get(serverId);
    if (!serverApprovedTools) {
      serverApprovedTools = new Set();
      this.approvedTools.set(serverId, serverApprovedTools);
    }
    serverApprovedTools.add(toolId);
  }

  public async isToolApprovalRequired(serverId: string, toolId: string): Promise<boolean> {
    // First check if the tool has already been approved for this session
    const serverApprovedTools = this.approvedTools.get(serverId);
    if (serverApprovedTools?.has(toolId)) {
      log.info(`Tool ${toolId} - already approved for this session, returning false`);
      return false;
    }

    // If the tool is not approved for this session, then we need to check the tool permission
    if (this.toolPermission === SESSION_TOOL_PERMISSION_ALWAYS) {
      log.info(`Tool ${toolId} - permission always required for all tools, returning true`);
      return true;
    } else if (this.toolPermission === SESSION_TOOL_PERMISSION_NEVER) {
      log.info(`Tool ${toolId} - permission never required for all tools, returning false`);
      return false;
    } else { // SESSION_TOOL_PERMISSION_TOOL
      log.info(`Tool ${toolId} - permission tool required, checking server config`);
      // Check the permission required for the tool
      const serverConfig = (await this.workspace.getMcpConfig())[serverId];
      if (!serverConfig) {
        throw new Error(`Attempted to check permission for non-existent server: ${serverId}`);
      }

      if (serverConfig.config.permissions?.toolPermissions) {
        const toolConfig = serverConfig.config.permissions.toolPermissions[toolId];
        if (toolConfig) {
          if (toolConfig.permission === TOOL_PERMISSION_REQUIRED) {
            log.info(`Tool ${toolId} - specific tool permission required, returning true`);
            return true;
          } else if (toolConfig.permission === TOOL_PERMISSION_NOT_REQUIRED) {
            log.info(`Tool ${toolId} - specific tool permission not required, returning false`);
            return false;
          }
        }

        // If tool config either didn't exist, or was not one of the non-default values, we fall through to here and get the server default
        if (serverConfig.config.permissions.defaultPermission === TOOL_PERMISSION_REQUIRED) {
          log.info(`Tool ${toolId} - server default permission required, returning true`);
          return true;
        } else {
          log.info(`Tool ${toolId} - server default permission not required, returning false`);
          return false;
        }
      }
    }

    // If the above logic fails to deliver a defintive result, then we default to always requiring tool approval
    log.info(`Tool ${toolId} - no definitive permission result, defaulting to true`);
    return true;
  }

  updateSettings(settings: {
    maxChatTurns: number;
    maxOutputTokens: number;
    temperature: number;
    topP: number;
    toolPermission: SessionToolPermission;
  }): boolean {
    this.maxChatTurns = settings.maxChatTurns;
    this.maxOutputTokens = settings.maxOutputTokens;
    this.temperature = settings.temperature;
    this.topP = settings.topP;
    this.toolPermission = settings.toolPermission;
    
    log.info(`Updated chat session settings:`, settings);
    return true;
  }
} 