import { Supervisor, RequestSupervisionResult, ResponseSupervisionResult, SupervisionPermission } from '../types/supervision.js';
import { ChatSession, ChatMessage, MessageUpdate } from '../types/chat.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { loadAgent } from '../runtime.js';

export interface AgentSupervisorConfig {
  systemPrompt: string;
  allowedActions: SupervisionPermission[];
}

export class AgentSupervisor implements Supervisor {
  private agent!: Agent;
  private initialized = false;
  
  constructor(
    private agentPath: string,
    private config: AgentSupervisorConfig,
    private logger: Logger
  ) {}
  
  get id(): string {
    return `agent-supervisor-${this.agentPath}`;
  }
  
  get name(): string {
    return `Agent Supervisor (${this.agentPath})`;
  }
  
  get permissions(): SupervisionPermission[] {
    return this.config.allowedActions;
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    // Load the supervisor agent from the specified path
    this.agent = await loadAgent(this.agentPath, this.logger);
    
    this.initialized = true;
    this.logger.info(`Initialized agent supervisor: ${this.agentPath}`);
  }
  
  private buildSupervisorContext(session: ChatSession, messages: ChatMessage[], direction: 'request' | 'response'): any {
    const lastMessage = messages[messages.length - 1];
    let content = '';
    
    if (typeof lastMessage === 'string') {
      content = lastMessage;
    } else if (lastMessage.role === 'user' || lastMessage.role === 'system' || lastMessage.role === 'error') {
      content = lastMessage.content;
    } else if (lastMessage.role === 'assistant') {
      content = lastMessage.modelReply?.turns.map(t => t.message).join('\n') || '';
    } else {
      content = 'Non-text message';
    }
    
    // Role is determined by direction, not the message's role
    const role = direction === 'request' ? 'user' : 'assistant';
    
    return {
      systemPrompt: this.config.systemPrompt,
      messages: [
        { role, content }
      ]
    };
  }

  async processRequest(session: ChatSession, messages: ChatMessage[]): Promise<RequestSupervisionResult> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Build context for the supervisor agent
    const context = this.buildSupervisorContext(session, messages, 'request');
    
    // Create a chat session for the supervisor agent
    const supervisorSession = this.agent.createChatSession(`supervisor-${session.id}`);
    
    // Get the supervision MCP client and inject the supervised session
    const supervisionClient = await this.agent.getMcpClient('supervision');
    if (supervisionClient && 'setSupervisedSession' in supervisionClient) {
      (supervisionClient as any).setSupervisedSession(session);
    }
    
    // Call the supervisor agent - it will process multiple turns if needed (tool calls, etc.)
    const response = await supervisorSession.handleMessage(context.messages[0]);
    
    // Parse tool calls to extract supervision decisions and modifications
    const result = this.parseSupervisorResponse(response);
    
    // Apply any modifications to the supervised session
    if (result.modifications.length > 0) {
      await this.applyModifications(session, result.modifications);
    }
    
    return result.supervisionResult;
  }
  
  async processResponse(session: ChatSession, response: MessageUpdate): Promise<ResponseSupervisionResult> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Build context for the supervisor agent using the response message
    const context = this.buildSupervisorContext(session, response.updates, 'response');
    
    // Create or reuse the supervisor agent's chat session
    const supervisorSession = this.agent.createChatSession(`supervisor-${session.id}`);
    
    // Get the supervision MCP client and inject the supervised session
    const supervisionClient = await this.agent.getMcpClient('supervision');
    if (supervisionClient && 'setSupervisedSession' in supervisionClient) {
      (supervisionClient as any).setSupervisedSession(session);
    }
    
    // Call the supervisor agent - it will process multiple turns if needed (tool calls, etc.)
    const supervisorResponse = await supervisorSession.handleMessage(context.messages[0]);
    
    // Parse tool calls to extract supervision decisions and modifications
    const result = this.parseSupervisorResponse(supervisorResponse);
    
    // Apply any modifications to the supervised session
    if (result.modifications.length > 0) {
      await this.applyModifications(session, result.modifications);
    }
    
    return result.supervisionResult;
  }
    
  private parseSupervisorResponse(response: any): any {
    // TODO: Parse the supervisor agent's response to extract supervision decisions
    // For now, just return allow
    return {
      supervisionResult: { action: 'allow', finalMessage: response },
      modifications: []
    };
  }
  
  private async applyModifications(session: ChatSession, modifications: any[]): Promise<void> {
    // TODO: Apply modifications to the supervised session
    this.logger.info(`Applying ${modifications.length} modifications to session ${session.id}`);
  }
  
  async cleanup(): Promise<void> {
    this.logger.info(`Cleaning up agent supervisor: ${this.agentPath}`);
  }
}
