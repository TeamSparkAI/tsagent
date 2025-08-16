import { ChatSessionImpl, ChatSessionOptionsWithRequiredSettings } from '../core/chat-session';
import { ChatSession, ChatSessionOptions } from '../types/chat';
import { ChatSessionManager } from './types';
import { Agent, MAX_CHAT_TURNS_KEY, MAX_CHAT_TURNS_DEFAULT, MAX_OUTPUT_TOKENS_KEY, MAX_OUTPUT_TOKENS_DEFAULT, TEMPERATURE_KEY, TEMPERATURE_DEFAULT, TOP_P_KEY, TOP_P_DEFAULT, SESSION_TOOL_PERMISSION_KEY, SESSION_TOOL_PERMISSION_TOOL, SessionToolPermission, SESSION_TOOL_PERMISSION_ALWAYS, SESSION_TOOL_PERMISSION_NEVER } from '../types/agent';
import { Logger } from '../types/common';

export class ChatSessionManagerImpl implements ChatSessionManager {
  private agent: Agent;
  private sessions: Map<string, ChatSession> = new Map();

  constructor(agent: Agent, private logger: Logger) {
    this.agent = agent;
    this.loadSessions();
  }

  getAll(): ChatSession[] {
    return Array.from(this.sessions.values());
  }

  get(sessionId: string): ChatSession | null {
    return this.sessions.get(sessionId) || null;
  }

  async save(session: ChatSession): Promise<void> {
    this.sessions.set(session.id, session);
    await this.saveSessions();
  }

  async delete(sessionId: string): Promise<boolean> {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      await this.saveSessions();
    }
    return deleted;
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  private getSettingsValue(value: number | undefined, key: string, defaultValue: number): number {
    if (value != undefined) {
      return value;
    }
    const settingsValue = this.agent.getSetting(key);
    return settingsValue ? parseFloat(settingsValue) : defaultValue;
  }

  private getToolPermissionValue(value: SessionToolPermission | undefined, key: string, defaultValue: SessionToolPermission): SessionToolPermission {
    if (value != undefined) {
      return value;
    }
    const settingsValue = this.agent.getSetting(key);
    return (settingsValue === SESSION_TOOL_PERMISSION_TOOL || settingsValue === SESSION_TOOL_PERMISSION_ALWAYS || settingsValue === SESSION_TOOL_PERMISSION_NEVER)
      ? settingsValue as SessionToolPermission
      : defaultValue;
  }

  create(id: string, options: ChatSessionOptions = {}): ChatSession {
    // Don't create if already exists
    if (this.sessions.has(id)) {
      throw new Error(`Session already exists with id: ${id}`);
    }

    const optionsWithRequiredSettings: ChatSessionOptionsWithRequiredSettings = {
      ...options,
      maxChatTurns: this.getSettingsValue(options.maxChatTurns, MAX_CHAT_TURNS_KEY, MAX_CHAT_TURNS_DEFAULT),
      maxOutputTokens: this.getSettingsValue(options.maxOutputTokens, MAX_OUTPUT_TOKENS_KEY, MAX_OUTPUT_TOKENS_DEFAULT),
      temperature: this.getSettingsValue(options.temperature, TEMPERATURE_KEY, TEMPERATURE_DEFAULT),
      topP: this.getSettingsValue(options.topP, TOP_P_KEY, TOP_P_DEFAULT),
      toolPermission: this.getToolPermissionValue(options.toolPermission, SESSION_TOOL_PERMISSION_KEY, SESSION_TOOL_PERMISSION_TOOL)
    }

    // Create new ChatSession instance
    const session = new ChatSessionImpl(this.agent, id, optionsWithRequiredSettings, this.logger);
    this.sessions.set(session.id, session);
    
    this.logger.info(`Created new chat session for tab ${session.id} with model ${session.currentProvider}`);
    return session;
  }

  private loadSessions(): void {
    // For now, using in-memory storage
    // In a real implementation, this would load from files or database
    this.sessions.clear();
  }

  private async saveSessions(): Promise<void> {
    // For now, using in-memory storage
    // In a real implementation, this would save to files or database
    // This is a placeholder for the actual persistence logic
  }
}