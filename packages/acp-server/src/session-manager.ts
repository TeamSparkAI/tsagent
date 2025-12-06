import { Agent, Logger } from '@tsagent/core';
import { ChatSession, MessageUpdate } from '@tsagent/core/types/chat.js';

/**
 * Represents an ACP session with its corresponding agent chat session
 */
export class ACPSession {
  readonly id: string;
  readonly chatSession: ChatSession;

  constructor(
    sessionId: string,
    private agent: Agent,
    private logger: Logger
  ) {
    this.id = sessionId;
    // Create an autonomous agent chat session (ACP always uses autonomous sessions)
    this.chatSession = agent.createChatSession(sessionId, { autonomous: true });
    this.logger.debug(`Created ACP session ${sessionId} with chat session`);
  }

  async close(): Promise<void> {
    // Delete the associated chat session via the agent
    await this.agent.deleteChatSession(this.id);
    this.logger.debug(`Closed ACP session ${this.id}`);
  }
}

/**
 * Manages ACP session lifecycle
 */
export class SessionManager {
  private sessions: Map<string, ACPSession> = new Map();

  constructor(private agent: Agent, private logger: Logger) {}

  /**
   * Create a new ACP session
   */
  createSession(sessionId: string): ACPSession {
    if (this.sessions.has(sessionId)) {
      this.logger.warn(`Session ${sessionId} already exists, reusing existing session`);
      return this.sessions.get(sessionId)!;
    }

    const session = new ACPSession(sessionId, this.agent, this.logger);
    this.sessions.set(sessionId, session);
    this.logger.info(`Created new ACP session: ${sessionId}`);
    return session;
  }

  /**
   * Get an existing session
   */
  getSession(sessionId: string): ACPSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Close a specific session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.close();
      this.sessions.delete(sessionId);
      this.logger.info(`Closed ACP session: ${sessionId}`);
    }
  }

  /**
   * Close all sessions
   */
  async closeAllSessions(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.closeSession(sessionId);
    }
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): ACPSession[] {
    return Array.from(this.sessions.values());
  }
}
