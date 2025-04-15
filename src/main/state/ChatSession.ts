import { ChatMessage, ChatState, MessageUpdate, ChatSessionOptions } from '../../shared/ChatSession';
import { LLMType } from '../../shared/llm';
import { ILLM } from '../../shared/llm';
import log from 'electron-log';
import { WorkspaceManager } from './WorkspaceManager';

export class ChatSession {
  messages: ChatMessage[] = [];
  lastSyncId: number = 0;
  currentProvider?: LLMType;
  currentModelId?: string;
  llm?: ILLM;
  workspace: WorkspaceManager;
  rules: string[] = [];
  references: string[] = [];

  constructor(workspace: WorkspaceManager, options: ChatSessionOptions = {}) {
    this.workspace = workspace;
    if (options.modelProvider && options.modelId) {
      this.currentProvider = options.modelProvider;
      this.currentModelId = options.modelId;
    } else {
      this.currentProvider = undefined;
      this.currentModelId = undefined;
    }
    
    let modelDescription = '';

    // Create the LLM instance
    if (this.currentProvider && this.currentModelId) {
      const llm = this.workspace.llmFactory.create(this.currentProvider, this.currentModelId);
      if (!llm) {
        throw new Error(`Failed to create LLM instance for model ${this.currentProvider}`);
      }
      this.llm = llm;
      modelDescription = `You are using the ${this.currentProvider} model${this.currentModelId ? ` (${this.currentModelId})` : ''}`;
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
  async handleMessage(message: string): Promise<MessageUpdate> {
    if (!this.llm) {
      throw new Error('No LLM instance available');
    }

    // Get system prompt from config
    const systemPrompt = await this.workspace.getSystemPrompt();
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.messages.filter(m => m.role !== 'system')
    ];

    // Search user message for each instance of @ref:[referenceName] and @rule:[ruleName] and inject found references and rules
    const referenceRegex = /@ref:([\w-]+)/g;
    const ruleRegex = /@rule:([\w-]+)/g;
    const referenceMatches = message.match(referenceRegex);
    const ruleMatches = message.match(ruleRegex);

    // Clean up the message by removing @mentions
    let cleanMessage = message;
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

    // Add the references and rules to the messages array
    for (const referenceName of this.references) {
      const reference = this.workspace.referencesManager.getReference(referenceName);
      if (reference) {
        messages.push({
          role: 'user',
          content: `Reference: ${reference.text}`
        }); 
      }
    }
    
    for (const ruleName of this.rules) {
      const rule = this.workspace.rulesManager.getRule(ruleName);
      if (rule) {
        messages.push({
          role: 'user',
          content: `Rule: ${rule.text}`
        });
      }
    }

    // Add the user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: cleanMessage
    };
    messages.push(userMessage);

    try {
      // Log the model being used for this request
      log.info(`Generating response using model ${this.currentProvider}${this.currentModelId ? ` with ID: ${this.currentModelId}` : ''}`);      
      const response = await this.llm.generateResponse(messages);
      if (!response) {
        throw new Error(`Failed to generate response from ${this.currentProvider}`);
      }

      log.info('All turns', JSON.stringify(response.turns, null, 2));

      const updates: ChatMessage[] = [
        {
          role: 'user',
          content: message
        },
        { 
          role: 'assistant' as const, 
          modelReply: response
        }
      ];
      
      this.messages.push(...updates);
      this.lastSyncId++;
      
      return {
        updates,
        lastSyncId: this.lastSyncId,
        references: [...this.references],
        rules: [...this.rules]
      };
    } catch (error) {
      log.error(`Error handling message in session:`, error);
      throw error;
    }
  }

  switchModel(modelType: LLMType, modelId?: string): MessageUpdate {
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
        content: `Switched to ${modelType} model${modelId ? ` (${displayName})` : ''}`
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
      rules: [...this.rules]
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
} 