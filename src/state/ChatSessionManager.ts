import { ChatSession, ChatSessionOptions, ChatState, Message, MessageUpdate } from '../types/ChatSession';
import { LLMType } from '../llm/types';
import { LLMFactory } from '../llm/llmFactory';
import log from 'electron-log';

const DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";

export class ChatSessionManager {
  private sessions = new Map<string, ChatSession>();
  
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
      systemPrompt: options.systemPrompt || DEFAULT_PROMPT,
      llm
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

  // !!! We're going to pass in a bag of messages
  //     - System prompt
  //     - Historical messages (set)
  //       - User prompt
  //       - Server reply (set)
  //         - Text reply (when no tool call, final message, when tool call, explanatory text related to tool call)
  //         - Tool call
  //         - Tool call result (coorrelated to call)
  //     - User prompt
  //
  // We may inject references or rules as appropriate (do we maintain historical references/rules in all cases, or do we curate the list
  // at the time of the request?)  If we don't include rules/refs in the history, it might be harder for the LLM to understand the history,
  // but if we do include them (esp rules), it might be a lot of rules that the LLM has to sort out (and prioritize).  We should make sure
  // to include the priority of both either way.
  //
  // Note: Sometimes we get multiple tool calls in one turn
  //       Sometimes we get explanatory text with a tool call
  //
  // LlmReply: 
  //   - Input tokens
  //   - Output tokens
  //   - Timestamp (elapsed time?)
  //   - Turn[]
  //
  // Turn:  
  //   - Message[]
  //   - ToolCall[]
  //   - ToolCallResult[]
  //
  // ToolCall:
  //   - Server name
  //   - Tool name
  //   - Args
  //   - Call ID (if not provided, make a synthetic on)
  //
  // ToolCallResult:
  //   - Call ID
  //   - ElapsedTimeMs (timestamp?)
  //   - Output
  //   - Error (if applicable)
  //
  // It might make sense to combine the ToolCall and ToolCallResult into a single object (the argument for separating them would be if we
  // had a human in the loop that needed to review the tool call).
  //
  async handleMessage(tabId: string, message: string): Promise<MessageUpdate> {
    const session = this.getSession(tabId);
    
    try {
      const response = await session.llm.generateResponse(message);
      if (!response) {
        throw new Error(`Failed to generate response from ${session.currentModel}`);
      }

      const updates: Message[] = [
        { role: 'user' as const, content: message },
        { role: 'assistant' as const, content: response }
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
      const systemMessage: Message = {
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