import { ChatSessionImpl } from '../core/chat-session.js';
import { ChatSession, ChatSessionOptions, ChatSessionOptionsWithRequiredSettings } from '../types/chat.js';
import { ChatSessionManager } from './types.js';
import { 
  Agent,
  AgentSettings,
  SessionToolPermission,
  getDefaultSettings
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

  private getSettingsValue(value: number | undefined, key: keyof AgentSettings): number {
    if (value != undefined) {
      return value;
    }
    const settings = this.agent.getSettings();
    const settingsValue = settings[key];
    if (typeof settingsValue === 'number') {
      return settingsValue;
    }
    // Fall back to schema defaults
    const defaults = getDefaultSettings();
    return defaults[key] as number ?? 0;
  }

  private getToolPermissionValue(value: SessionToolPermission | undefined, key: keyof AgentSettings, defaultValue: SessionToolPermission): SessionToolPermission {
    if (value != undefined) {
      return value;
    }
    const settings = this.agent.getSettings();
    const settingsValue = settings.toolPermission;
    return settingsValue ?? defaultValue;
  }

  createChatSession(sessionId: string, options: ChatSessionOptions = {}): ChatSession {
    // Don't create if already exists
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session already exists with id: ${sessionId}`);
    }

    // Validate autonomous option against agent
    if (this.agent.autonomous && options.autonomous === false) {
      const errorMsg = `Cannot create non-autonomous session ${sessionId}: agent is autonomous and requires all sessions to be autonomous`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Set default autonomous value
    const autonomousValue = this.agent.autonomous 
      ? true // Agent is autonomous, session must be autonomous
      : (options.autonomous ?? false); // Agent is not autonomous, default to false

    const optionsWithRequiredSettings: ChatSessionOptionsWithRequiredSettings = {
      ...options,
      autonomous: autonomousValue,
      maxChatTurns: this.getSettingsValue(options.maxChatTurns, 'maxChatTurns'),
      maxOutputTokens: this.getSettingsValue(options.maxOutputTokens, 'maxOutputTokens'),
      temperature: this.getSettingsValue(options.temperature, 'temperature'),
      topP: this.getSettingsValue(options.topP, 'topP'),
      toolPermission: this.getToolPermissionValue(options.toolPermission, 'toolPermission', 'tool'),
      contextTopK: this.getSettingsValue(options.contextTopK, 'contextTopK'),
      contextTopN: this.getSettingsValue(options.contextTopN, 'contextTopN'),
      contextIncludeScore: this.getSettingsValue(options.contextIncludeScore, 'contextIncludeScore')
    }

    // Create new ChatSession instance
    const session = new ChatSessionImpl(this.agent, sessionId, optionsWithRequiredSettings, this.logger);
    
    // Set supervision manager if available
    const supervisionManager = this.agent.getSupervisionManager();
    if (supervisionManager) {
      session.setSupervisionManager(supervisionManager);
    }
    
    this.sessions.set(session.id, session);
    
    this.logger.info(`Created new chat session for tab ${session.id} with model ${session.currentProvider}`);
    return session;
  }

  async deleteChatSession(sessionId: string): Promise<boolean> {
    const deleted = this.sessions.delete(sessionId);
    return deleted;
  }
}