import { ChatMessage, ChatState, MessageUpdate, ChatSessionOptions } from '../types/ChatSession';
import { LLMType } from '../llm/types';
import { ILLM } from '../llm/types';
import { AppState } from './AppState';
import log from 'electron-log';

export class ChatSession {
  messages: ChatMessage[] = [];
  lastSyncId: number = 0;
  currentModel: LLMType;
  llm: ILLM;
  appState: AppState;
  rules: string[] = [];
  references: string[] = [];

  constructor(appState: AppState, options: ChatSessionOptions = {}) {
    this.appState = appState;
    this.currentModel = options.modelType || LLMType.Test;
    
    // Create the LLM instance
    const llm = this.appState.llmFactory.create(this.currentModel);
    if (!llm) {
      throw new Error(`Failed to create LLM instance for model ${this.currentModel}`);
    }
    this.llm = llm;

    // Initialize messages
    this.messages = [
      ...(options.initialMessages || []),
      {
        role: 'system',
        content: `Welcome to TeamSpark AI Workbench! You are using the ${this.currentModel} model.`
      }
    ];
    
    log.info(`Created new chat session with model ${this.currentModel}`);
  }

  // !!! Notes:
  //
  //  Based on the user message, we will determine references and rules to include with the request
  //  UserMessage:
  //    - Message (text)
  //    - References (set)
  //      - reference id
  //    - Rules (set)
  //      - rule id
  //
  //  We're going to construct and pass a bag of messages to the LLM
  //     - System prompt
  //     - Historical messages (set)
  //       - User prompt (references and rules?)
  //       - Server reply (set)
  //         - Text reply (when no tool call, final message, when tool call, explanatory text related to tool call)
  //         - Tool call
  //         - Tool call result (coorrelated to call)
  //     - References (set)
  //     - Rules (set)
  //     - User prompt
  //
  // We may inject references or rules as appropriate (do we maintain historical references/rules in all cases, or do we curate the list
  // at the time of the request?)  If we don't include rules/refs in the history, it might be harder for the LLM to understand the history,
  // but if we do include them (esp rules), it might be a lot of rules that the LLM has to sort out (and prioritize).  We should make sure
  // to include the priority of both either way.
  //
  // ModelReply type gives us metadata and turn results - inclding message, tool calls (possibly multiple), and an error if applicable
  // - Sometimes we get multiple tool calls in one turn
  // - Sometimes we get explanatory text with a tool call (or multiple tool calls)
  //
  async handleMessage(message: string): Promise<MessageUpdate> {
    // Get system prompt from config
    const systemPrompt = await this.appState.configManager.getSystemPrompt();
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
      const reference = this.appState.referencesManager.getReference(referenceName);
      if (reference) {
        messages.push({
          role: 'user',
          content: `Reference: ${reference.text}`
        }); 
      }
    }
    
    for (const ruleName of this.rules) {
      const rule = this.appState.rulesManager.getRule(ruleName);
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
      const response = await this.llm.generateResponse(messages);
      if (!response) {
        throw new Error(`Failed to generate response from ${this.currentModel}`);
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

  switchModel(modelType: LLMType): MessageUpdate {
    try {
      // Create new LLM instance
      const llm = this.appState.llmFactory.create(modelType);
      if (!llm) {
        throw new Error(`Failed to create LLM instance for model ${modelType}`);
      }

      // Update session with new model and LLM
      this.currentModel = modelType;
      this.llm = llm;

      // Add a system message about the model switch
      const systemMessage: ChatMessage = {
        role: 'system',
        content: `Switched to ${modelType} model`
      };
      this.messages.push(systemMessage);
      this.lastSyncId++;
      
      log.info(`Switched model to ${modelType}`);
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
        content: `Failed to create LLM instance for model ${modelType}, error: ${error}`
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
      currentModel: this.currentModel,
      references: [...this.references],
      rules: [...this.rules]
    };
  }

  addReference(referenceName: string): boolean {
    if (this.references.includes(referenceName)) {
      return false; // Already exists
    }
    
    // Validate reference exists
    const reference = this.appState.referencesManager.getReference(referenceName);
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
    const rule = this.appState.rulesManager.getRule(ruleName);
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