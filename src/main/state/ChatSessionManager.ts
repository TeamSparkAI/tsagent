import { ChatSessionOptions, ChatState, MessageUpdate } from '../../shared/ChatSession';
import { LLMType } from '../../shared/llm';
import log from 'electron-log';
import { ChatSession } from './ChatSession';
import { WorkspaceManager } from './WorkspaceManager';

export class ChatSessionManager {
  private sessions = new Map<string, ChatSession>();
  
  constructor(private workspace: WorkspaceManager) {
    log.info('ChatSessionManager initialized');
  }
  
  createSession(tabId: string, options: ChatSessionOptions = {}): ChatSession {
    // Don't create if already exists
    if (this.sessions.has(tabId)) {
      throw new Error(`Session already exists for tab ${tabId}`);
    }

    // Create new ChatSession instance
    const session = new ChatSession(this.workspace, options);
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

  async handleMessage(tabId: string, message: string): Promise<MessageUpdate> {
    const session = this.getSession(tabId);
    try {
      return await session.handleMessage(message);
    } catch (error) {
      log.error(`Error handling message in session ${tabId}:`, error);
      throw error;
    }
  }

  switchModel(tabId: string, modelType: LLMType, modelId?: string): MessageUpdate {
    const session = this.getSession(tabId);
    try {
      return session.switchModel(modelType, modelId);
    } catch (error) {
      log.error(`Error switching model for tab ${tabId}:`, error);
      throw error;
    }
  }

  getSessionState(tabId: string): ChatState {
    const session = this.getSession(tabId);
    return session.getState();
  }

  addReference(tabId: string, referenceName: string): boolean {
    const session = this.getSession(tabId);
    return session.addReference(referenceName);
  }

  removeReference(tabId: string, referenceName: string): boolean {
    const session = this.getSession(tabId);
    return session.removeReference(referenceName);
  }

  addRule(tabId: string, ruleName: string): boolean {
    const session = this.getSession(tabId);
    return session.addRule(ruleName);
  }

  removeRule(tabId: string, ruleName: string): boolean {
    const session = this.getSession(tabId);
    return session.removeRule(ruleName);
  }
} 