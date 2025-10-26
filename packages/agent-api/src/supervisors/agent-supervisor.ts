import { Supervisor, RequestSupervisionResult, ResponseSupervisionResult, SupervisionPermission, SupervisionState } from '../types/supervision.js';
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
  
  private buildSupervisorContext(session: ChatSession, messages: ChatMessage[], direction: 'request' | 'response'): { systemPrompt: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } {
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
    const role: 'user' | 'assistant' = direction === 'request' ? 'user' : 'assistant';
    
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
    
    // Create shared supervision state
    const state: SupervisionState = {
      decision: null,
      reasons: [],
      contextChanges: {
        addedRules: [],
        removedRules: [],
        addedReferences: [],
        removedReferences: [],
        addedTools: [],
        removedTools: []
      }
    };
    
    // Build context for the supervisor agent
    const context = this.buildSupervisorContext(session, messages, 'request');
    
    // Create a chat session for the supervisor agent
    const supervisorSession = this.agent.createChatSession(`supervisor-${session.id}`);
    
    // Get the supervision MCP client and inject both session and state
    const supervisionClient = await this.agent.getMcpClient('supervision');
    if (supervisionClient) {
      if ('setSupervisedSession' in supervisionClient) {
        (supervisionClient as any).setSupervisedSession(session);
      }
      if ('setSupervisionState' in supervisionClient) {
        (supervisionClient as any).setSupervisionState(state);
      }
    }
    
    // Call the supervisor agent - its tools will mutate the state object
    await supervisorSession.handleMessage(context.messages[0] as ChatMessage);
    
    // Extract decision from state and return structured result
    if (state.decision === 'block') {
      return {
        action: 'block',
        reasons: state.reasons
      };
    }
    
    if (state.decision === 'modify' && state.modifiedRequestContent) {
      const lastMessage = messages[messages.length - 1];
      const modifiedMessage: ChatMessage = {
        ...(typeof lastMessage === 'string' ? { role: 'user', content: lastMessage } : lastMessage),
        content: state.modifiedRequestContent
      } as ChatMessage;
      
      return {
        action: 'modify',
        finalMessage: modifiedMessage,
        reasons: state.reasons
      };
    }
    
    return { 
      action: 'allow',
      finalMessage: messages[messages.length - 1]
    };
  }
  
  async processResponse(session: ChatSession, response: MessageUpdate): Promise<ResponseSupervisionResult> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Create shared supervision state
    const state: SupervisionState = {
      decision: null,
      reasons: [],
      contextChanges: {
        addedRules: [],
        removedRules: [],
        addedReferences: [],
        removedReferences: [],
        addedTools: [],
        removedTools: []
      }
    };
    
    // Build context for the supervisor agent using the response message
    const context = this.buildSupervisorContext(session, response.updates, 'response');
    
    // Create or reuse the supervisor agent's chat session
    const supervisorSession = this.agent.createChatSession(`supervisor-${session.id}`);
    
    // Get the supervision MCP client and inject both session and state
    const supervisionClient = await this.agent.getMcpClient('supervision');
    if (supervisionClient) {
      if ('setSupervisedSession' in supervisionClient) {
        (supervisionClient as any).setSupervisedSession(session);
      }
      if ('setSupervisionState' in supervisionClient) {
        (supervisionClient as any).setSupervisionState(state);
      }
    }
    
    // Call the supervisor agent - its tools will mutate the state object
    await supervisorSession.handleMessage(context.messages[0] as ChatMessage);
    
    // Extract decision from state and return structured result
    if (state.decision === 'block') {
      return {
        action: 'block',
        reasons: state.reasons
      };
    }
    
    if (state.decision === 'modify' && state.modifiedResponseContent) {
      // Find the assistant message to preserve its structure
      const assistantMessage = response.updates.find(m => 
        typeof m !== 'string' && m.role === 'assistant'
      );
      
      // Construct the modified response
      const modifiedResponse: MessageUpdate = {
        ...response,
        updates: [{
          role: 'assistant',
          modelReply: {
            timestamp: assistantMessage && 'modelReply' in assistantMessage 
              ? assistantMessage.modelReply.timestamp 
              : Date.now(),
            turns: [{ message: state.modifiedResponseContent }]
          }
        }]
      };
      
      return {
        action: 'modify',
        finalResponse: modifiedResponse,
        reasons: state.reasons
      };
    }
    
    return { action: 'allow' };
  }
    
  async cleanup(): Promise<void> {
    this.logger.info(`Cleaning up agent supervisor: ${this.agentPath}`);
  }
}
