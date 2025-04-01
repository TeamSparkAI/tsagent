import { ChatSession, ChatSessionOptions, ChatState, ChatMessage, MessageUpdate } from '../types/ChatSession';
import { LLMType } from '../llm/types';
import { LLMFactory } from '../llm/llmFactory';
import { AppState } from './AppState';
import log from 'electron-log';

export class ChatSessionManager {
  private sessions = new Map<string, ChatSession>();
  
  constructor(private appState: AppState) {
    log.info('ChatSessionManager initialized');
  }
  
  createSession(tabId: string, options: ChatSessionOptions = {}): ChatSession {
    // Don't create if already exists
    if (this.sessions.has(tabId)) {
      throw new Error(`Session already exists for tab ${tabId}`);
    }

    const modelType = options.modelType || LLMType.Test;
    const llm = LLMFactory.create(modelType);
    if (!llm) {
      throw new Error(`Failed to create LLM instance for model ${modelType}`);
    }

    const session: ChatSession = {
      messages: [
        ...(options.initialMessages || []),
        {
          role: 'system',
          content: `Welcome to TeamSpark AI Workbench! You are using the ${modelType} model.`
        }
      ],
      lastSyncId: 0,
      currentModel: modelType,
      llm,
      appState: this.appState,
      rules: [],
      references: []
    };
    
    this.sessions.set(tabId, session);
    log.info(`Created new chat session for tab ${tabId} with model ${session.currentModel}`);
    return session;
  }

  deleteSession(tabId: string): void {
    if (!this.sessions.has(tabId)) {
      throw new Error(`No session exists for tab ${tabId}`);
    }
    this.sessions.delete(tabId);
    log.info(`Deleted chat session for tab ${tabId}`);
  }

  getSession(tabId: string): ChatSession {
    const session = this.sessions.get(tabId);
    if (!session) {
      throw new Error(`No session exists for tab ${tabId}`);
    }
    return session;
  }

  hasSession(tabId: string): boolean {
    return this.sessions.has(tabId);
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
  async handleMessage(tabId: string, message: string): Promise<MessageUpdate> {
    const session = this.getSession(tabId);

    // Get system prompt from config
    const systemPrompt = await session.appState.getConfigManager().getSystemPrompt();
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...session.messages.filter(m => m.role !== 'system')
    ];

    // Search user message for each instance of @ref:[referenceName] and @rule:[ruleName] and inject found references and rules into messages array
    //
    const referenceRegex = /@ref:(\w+)/g;
    const ruleRegex = /@rule:(\w+)/g;
    const referenceMatches = message.match(referenceRegex);
    const ruleMatches = message.match(ruleRegex);

    // Note: We are going to inject references and rules as messages into the messages array we send to the model. 
    // 
    //       We we will track them in the session so that we can send them every time (to maintain consistent context).
    //
    //       The ChatSession will end up having a state of whatever has been "attached" as context (rules and references for now).
    //
    //       We may want to be able to communicate this state to the UX and allow them to modify it (add or remove references and rules).
    //
    //       It's possible that the UX might want to participate in the context discovery process (references and rules) - meaning as
    //       @ menntions of refs or rules are entered, or as keywords are entered, the UX can determine which contexts will be added
    //       and can display them to the user interactively.
    //

    // Find any @ mentioned rules or referneces, add them to the session, remove the references from the message text
    //
    let cleanMessage = message;
    if (referenceMatches) {
      cleanMessage = cleanMessage.replace(referenceRegex, '');
      for (const match of referenceMatches) {
        const referenceName = match.replace('@ref:', '');
        if (!session.references.includes(referenceName)) {
          session.references.push(referenceName);
        }
      }
    }
    if (ruleMatches) {
      cleanMessage = cleanMessage.replace(ruleRegex, '');
      for (const match of ruleMatches) {
        const ruleName = match.replace('@rule:', '');
        if (!session.rules.includes(ruleName)) {
          session.rules.push(ruleName);
        }
      }
    }
    // Clean up any extra whitespace that might have been left
    cleanMessage = cleanMessage.replace(/\s+/g, ' ').trim();

    // Add the references and rules to the messages array (both new and existing)
    //
    for (const referenceName of session.references) {
      const reference = this.appState.getReferencesManager().getReference(referenceName);
      if (reference) {
        messages.push({
          role: 'user',
          content: `Reference: ${reference.text}`
        }); 
      }
    }
    for (const ruleName of session.rules) {
      const rule = this.appState.getRulesManager().getRule(ruleName);
      if (rule) {
        messages.push({
          role: 'user',
          content: `Rule: ${rule.text}`
        });
      }
    }

    // Finish off with the user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: cleanMessage
    };
    messages.push(userMessage);

    try {
      const response = await session.llm.generateResponse(messages);
      if (!response) {
        throw new Error(`Failed to generate response from ${session.currentModel}`);
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
      
      session.messages.push(...updates);
      session.lastSyncId++;
      
      return {
        updates,
        lastSyncId: session.lastSyncId
      };
    } catch (error) {
      log.error(`Error handling message in session ${tabId}:`, error);
      throw error;
    }
  }

  switchModel(tabId: string, modelType: LLMType): MessageUpdate {
    const session = this.getSession(tabId);
    
    try {
      // Create new LLM instance
      const llm = LLMFactory.create(modelType);
      if (!llm) {
        throw new Error(`Failed to create LLM instance for model ${modelType}`);
      }

      // Update session with new model and LLM
      session.currentModel = modelType;
      session.llm = llm;

      // Add a system message about the model switch
      const systemMessage: ChatMessage = {
        role: 'system',
        content: `Switched to ${modelType} model`
      };
      session.messages.push(systemMessage);
      session.lastSyncId++;
      
      log.info(`Switched model for tab ${tabId} to ${modelType}`);
      return {
        updates: [systemMessage],
        lastSyncId: session.lastSyncId
      };
    } catch (error) {
      log.error(`Error switching model for tab ${tabId}:`, error);
      throw error;
    }
  }

  getSessionState(tabId: string): ChatState {
    const session = this.getSession(tabId);
    return {
      messages: [...session.messages],
      lastSyncId: session.lastSyncId,
      currentModel: session.currentModel
    };
  }
} 