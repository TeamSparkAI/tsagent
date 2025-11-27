import { Agent, Logger } from '@tsagent/core';
import { loadAndInitializeAgent } from '@tsagent/core/runtime';
import { AgentSideConnection, ndJsonStream, type Agent as ACPAgent, type InitializeRequest, type InitializeResponse, type NewSessionRequest, type NewSessionResponse, type PromptRequest, type PromptResponse, type CancelNotification } from '@agentclientprotocol/sdk';
import { SessionManager, ACPSession } from './session-manager.js';
import { ConsoleLogger } from './logger.js';
import { Readable, Writable } from 'node:stream';

export interface ACPServerOptions {
  logger?: Logger;
  verbose?: boolean;
}

/**
 * ACP Agent implementation that wraps @tsagent/core agents
 */
class TsAgentACPAgent implements ACPAgent {
  constructor(
    private connection: AgentSideConnection,
    private tsagent: Agent,
    private sessionManager: SessionManager,
    private logger: Logger
  ) {}

  async initialize(params: InitializeRequest): Promise<InitializeResponse> {
    this.logger.debug('Handling initialize request');

    const agentMetadata = this.tsagent.getMetadata();

    return {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: false,
        // Add other capabilities as needed
      },
      agentInfo: {
        name: this.tsagent.name,
        version: agentMetadata?.version || '1.0.0',
      },
    };
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    this.logger.debug('Handling newSession request');

    // Generate session ID (client doesn't provide it)
    const sessionId = this.generateSessionId();
    
    // Create new session
    const session = this.sessionManager.createSession(sessionId);

    return {
      sessionId: session.id,
    };
  }

  async authenticate(params: any): Promise<any> {
    // No authentication required
    return {};
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    this.logger.debug(`Handling prompt request for session: ${params.sessionId}`);

    // Get the session
    const session = this.sessionManager.getSession(params.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${params.sessionId}`);
    }

    try {
      // Convert ACP prompt to agent format and process
      // TODO: Handle tool calls, streaming updates, etc.
      const messageText = this.extractTextFromPrompt(params);
      
      const messageUpdate = await session.chatSession.handleMessage(messageText);
      
      // Convert agent response to ACP format
      const content = this.convertResponseToACP(messageUpdate);
      
      // Send content updates via sessionUpdate
      for (const item of content) {
        await this.connection.sessionUpdate({
          sessionId: params.sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: item,
          },
        });
      }

      return {
        stopReason: 'end_turn',
      };
    } catch (error: any) {
      this.logger.error(`Error processing prompt: ${error.message}`, error);
      throw error;
    }
  }

  async cancel(params: CancelNotification): Promise<void> {
    this.logger.debug(`Handling cancel notification for session: ${params.sessionId}`);
    
    // Note: We can't really interrupt the agent processing easily
    // This is more of a notification that the client cancelled
    const session = this.sessionManager.getSession(params.sessionId);
    if (session) {
      this.logger.info(`Session ${params.sessionId} cancelled by client`);
      // TODO: Implement actual cancellation if possible
    }
  }

  async setSessionMode(params: any): Promise<any> {
    // Session mode changes not implemented yet
    return {};
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private extractTextFromPrompt(params: PromptRequest): string {
    // Extract text from ACP prompt content
    const parts: string[] = [];
    
    // PromptRequest has a `prompt` array of ContentBlock items
    if (params.prompt) {
      for (const item of params.prompt) {
        if (item.type === 'text') {
          parts.push(item.text);
        } else if (item.type === 'resource' && 'resource' in item) {
          // Extract text from resource if it's a text resource
          const resource = item.resource;
          if ('text' in resource) {
            parts.push(resource.text);
          }
        }
      }
    }

    return parts.join('\n\n').trim() || '';
  }

  private convertResponseToACP(messageUpdate: any): any[] {
    // Convert agent MessageUpdate to ACP content format
    const content: any[] = [];

    // Extract assistant responses from the updates
    for (const update of messageUpdate.updates || []) {
      if (update.role === 'assistant' && update.modelReply) {
        // Extract text from model reply
        if (update.modelReply.turns) {
          for (const turn of update.modelReply.turns) {
            if (turn.results) {
              for (const result of turn.results) {
                if (result.type === 'text' && result.text) {
                  content.push({
                    type: 'text',
                    text: result.text,
                  });
                }
              }
            }
          }
        }
      }
    }

    return content;
  }
}

/**
 * Main ACP Server class
 * 
 * Implements the Agent Client Protocol server that wraps @tsagent/core agents.
 * Uses the @agentclientprotocol/sdk to handle JSON-RPC communication over stdio.
 */
export class ACPServer {
  private connection: AgentSideConnection | null = null;
  private agent: Agent | null = null;
  private sessionManager: SessionManager | null = null;
  private logger: Logger;
  private isStarted: boolean = false;
  private agentPath: string;

  constructor(agentPath: string, options: ACPServerOptions = {}) {
    this.agentPath = agentPath;
    this.logger = options.logger || new ConsoleLogger();
    
    if (options.verbose !== undefined && this.logger instanceof ConsoleLogger) {
      this.logger.setVerbose(options.verbose);
    }
  }

  /**
   * Initialize and start the ACP server
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      throw new Error('ACP server is already started');
    }

    try {
      // Load the agent
      this.logger.info(`Loading agent from: ${this.agentPath}`);
      this.agent = await loadAndInitializeAgent(this.agentPath, this.logger);
      this.logger.info(`Agent loaded successfully: ${this.agent.name}`);

      // Initialize session manager
      this.sessionManager = new SessionManager(this.agent, this.logger);

      // Create stdio streams (convert Node.js streams to Web Streams)
      // Note: process.stdin/stdout are binary streams, so they are Uint8Array at runtime
      // TypeScript can't infer this, so we cast. This is safe because stdio is always binary.
      const stdin = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
      const stdout = Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;
      
      // Create ACP stream from stdio
      const stream = ndJsonStream(stdout, stdin);

      // Create AgentSideConnection with our agent implementation
      this.connection = new AgentSideConnection(
        (conn: AgentSideConnection) => {
          return new TsAgentACPAgent(
            conn,
            this.agent!,
            this.sessionManager!,
            this.logger
          );
        },
        stream
      );

      this.isStarted = true;
      this.logger.info('ACP server started successfully');
      this.logger.info('Communicating via stdio (JSON-RPC over stdio)');

      // After connecting to stdio, disable verbose logging (only log errors to stderr)
      if (this.logger instanceof ConsoleLogger) {
        this.logger.setVerbose(false);
      }

      // Wait for connection to close
      await this.connection.closed;
      this.logger.info('ACP connection closed');
    } catch (error: any) {
      this.logger.error(`Failed to start ACP server: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Stop the ACP server and clean up resources
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      this.logger.info('Stopping ACP server...');

      // Close all sessions
      if (this.sessionManager) {
        await this.sessionManager.closeAllSessions();
      }

      this.isStarted = false;
      this.logger.info('ACP server stopped');
    } catch (error: any) {
      this.logger.error(`Error stopping ACP server: ${error.message}`, error);
      throw error;
    }
  }

}
