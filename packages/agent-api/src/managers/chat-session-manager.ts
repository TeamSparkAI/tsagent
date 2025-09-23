import { ChatSessionImpl } from '../core/chat-session.js';
import { ChatSession, ChatSessionOptions, ChatSessionOptionsWithRequiredSettings } from '../types/chat.js';
import { ChatSessionManager } from './types.js';
import { 
  Agent, 
  SETTINGS_KEY_MAX_CHAT_TURNS, 
  SETTINGS_DEFAULT_MAX_CHAT_TURNS, 
  SETTINGS_KEY_MAX_OUTPUT_TOKENS, 
  SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS, 
  SETTINGS_KEY_TEMPERATURE, 
  SETTINGS_DEFAULT_TEMPERATURE, 
  SETTINGS_KEY_TOP_P, 
  SETTINGS_DEFAULT_TOP_P, 
  SESSION_TOOL_PERMISSION_KEY, 
  SESSION_TOOL_PERMISSION_TOOL, 
  SessionToolPermission, 
  SESSION_TOOL_PERMISSION_ALWAYS, 
  SESSION_TOOL_PERMISSION_NEVER 
} from '../types/agent.js';
import { Logger } from '../types/common.js';

export class ChatSessionManagerImpl implements ChatSessionManager {
  private agent: Agent;
  private sessions: Map<string, ChatSession> = new Map();

  constructor(agent: Agent, private logger: Logger) {
    this.agent = agent;
  }

  getAllChatSessions(): ChatSession[] {
    return Array.from(this.sessions.values());
  }

  getChatSession(sessionId: string): ChatSession | null {
    return this.sessions.get(sessionId) || null;
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

  createChatSession(sessionId: string, options: ChatSessionOptions = {}): ChatSession {
    // Don't create if already exists
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session already exists with id: ${sessionId}`);
    }

    const optionsWithRequiredSettings: ChatSessionOptionsWithRequiredSettings = {
      ...options,
      maxChatTurns: this.getSettingsValue(options.maxChatTurns, SETTINGS_KEY_MAX_CHAT_TURNS, SETTINGS_DEFAULT_MAX_CHAT_TURNS),
      maxOutputTokens: this.getSettingsValue(options.maxOutputTokens, SETTINGS_KEY_MAX_OUTPUT_TOKENS, SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS),
      temperature: this.getSettingsValue(options.temperature, SETTINGS_KEY_TEMPERATURE, SETTINGS_DEFAULT_TEMPERATURE),
      topP: this.getSettingsValue(options.topP, SETTINGS_KEY_TOP_P, SETTINGS_DEFAULT_TOP_P),
      toolPermission: this.getToolPermissionValue(options.toolPermission, SESSION_TOOL_PERMISSION_KEY, SESSION_TOOL_PERMISSION_TOOL)
    }

    // Create new ChatSession instance
    const session = new ChatSessionImpl(this.agent, sessionId, optionsWithRequiredSettings, this.logger);
    this.sessions.set(session.id, session);
    
    this.logger.info(`Created new chat session for tab ${session.id} with model ${session.currentProvider}`);
    return session;
  }

  async deleteChatSession(sessionId: string): Promise<boolean> {
    const deleted = this.sessions.delete(sessionId);
    return deleted;
  }
}