import { Supervisor, RequestSupervisionResult, ResponseSupervisionResult, SupervisionPermission } from '../types/supervision.js';
import { ChatSession, ChatMessage, MessageUpdate } from '../types/chat.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { loadAgent } from '../runtime.js';

export interface AgentSupervisorConfig {
  systemPrompt: string;
  tools: string[];
  allowedActions: SupervisionPermission[];
}

export class AgentSupervisor implements Supervisor {
  private agent!: Agent;
  private supervisedSession?: ChatSession;
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
    
    // TODO: Install supervision tools
    // This would need to be implemented based on how tools are managed
    
    this.initialized = true;
    this.logger.info(`Initialized agent supervisor: ${this.agentPath}`);
  }
  
  private async installSupervisionTools(): Promise<void> {
    // TODO: Install supervision tools that will be bound to supervised sessions
    // This would need to be implemented based on how tools are managed
    const supervisionTools = this.createSupervisionTools();
    // await this.agent.installTools(supervisionTools);
  }
  
  private createSupervisionTools(): Tool[] {
    return [
      // Data Access Tools
      {
        name: 'supervised_get_conversation_history',
        description: 'Get conversation history from supervised session',
        inputSchema: { 
          type: 'object', 
          properties: {}, 
          required: [] 
        },
        handler: () => this.getSupervisedSessionData('messages')
      },
      {
        name: 'supervised_get_current_rules',
        description: 'Get currently active rules in supervised session',
        inputSchema: { 
          type: 'object', 
          properties: {}, 
          required: [] 
        },
        handler: () => this.getSupervisedSessionData('rules')
      },
      {
        name: 'supervised_get_current_references',
        description: 'Get currently active references in supervised session',
        inputSchema: { 
          type: 'object', 
          properties: {}, 
          required: [] 
        },
        handler: () => this.getSupervisedSessionData('references')
      },
      {
        name: 'supervised_get_available_tools',
        description: 'Get available tools in supervised session',
        inputSchema: { 
          type: 'object', 
          properties: {}, 
          required: [] 
        },
        handler: () => this.getSupervisedSessionTools()
      },
      {
        name: 'supervised_get_session_stats',
        description: 'Get session statistics and metadata',
        inputSchema: { 
          type: 'object', 
          properties: {}, 
          required: [] 
        },
        handler: () => this.getSupervisedSessionStats()
      },
      
      // Rules Management Tools
      {
        name: 'supervised_listRules',
        description: 'List all available rules in the supervised agent',
        inputSchema: { 
          type: 'object', 
          properties: {}, 
          required: [] 
        },
        handler: () => this.listSupervisedRules()
      },
      {
        name: 'supervised_createRule',
        description: 'Create a new rule in the supervised agent',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Unique name for the rule' },
            description: { type: 'string', description: 'Description of what the rule does' },
            priorityLevel: { type: 'number', description: 'Priority level (000-999)' },
            enabled: { type: 'boolean', description: 'Whether the rule is enabled' },
            include: { type: 'string', enum: ['always', 'manual', 'agent'], description: 'How the rule should be included' },
            text: { type: 'string', description: 'The actual rule text' }
          },
          required: ['name', 'text']
        },
        handler: (args: any) => this.createSupervisedRule(args)
      },
      {
        name: 'supervised_getRule',
        description: 'Get a specific rule from the supervised agent',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the rule to get' }
          },
          required: ['name']
        },
        handler: (args: any) => this.getSupervisedRule(args.name)
      },
      {
        name: 'supervised_updateRule',
        description: 'Update an existing rule in the supervised agent',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the rule to update' },
            description: { type: 'string', description: 'New description' },
            priorityLevel: { type: 'number', description: 'New priority level' },
            enabled: { type: 'boolean', description: 'Whether the rule is enabled' },
            include: { type: 'string', enum: ['always', 'manual', 'agent'], description: 'How the rule should be included' },
            text: { type: 'string', description: 'New rule text' }
          },
          required: ['name']
        },
        handler: (args: any) => this.updateSupervisedRule(args)
      },
      {
        name: 'supervised_deleteRule',
        description: 'Delete a rule from the supervised agent',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the rule to delete' }
          },
          required: ['name']
        },
        handler: (args: any) => this.deleteSupervisedRule(args.name)
      },
      {
        name: 'supervised_includeRule',
        description: 'Include a rule in the supervised session context',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the rule to include' }
          },
          required: ['name']
        },
        handler: (args: any) => this.supervisedSession?.addRule(args.name)
      },
      {
        name: 'supervised_excludeRule',
        description: 'Exclude a rule from the supervised session context',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the rule to exclude' }
          },
          required: ['name']
        },
        handler: (args: any) => this.supervisedSession?.removeRule(args.name)
      },
      
      // References Management Tools
      {
        name: 'supervised_listReferences',
        description: 'List all available references in the supervised agent',
        inputSchema: { 
          type: 'object', 
          properties: {}, 
          required: [] 
        },
        handler: () => this.listSupervisedReferences()
      },
      {
        name: 'supervised_createReference',
        description: 'Create a new reference in the supervised agent',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Unique name for the reference' },
            description: { type: 'string', description: 'Description of what the reference contains' },
            priorityLevel: { type: 'number', description: 'Priority level (000-999)' },
            enabled: { type: 'boolean', description: 'Whether the reference is enabled' },
            include: { type: 'string', enum: ['always', 'manual', 'agent'], description: 'How the reference should be included' },
            text: { type: 'string', description: 'The actual reference text' }
          },
          required: ['name', 'text']
        },
        handler: (args: any) => this.createSupervisedReference(args)
      },
      {
        name: 'supervised_getReference',
        description: 'Get a specific reference from the supervised agent',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the reference to get' }
          },
          required: ['name']
        },
        handler: (args: any) => this.getSupervisedReference(args.name)
      },
      {
        name: 'supervised_updateReference',
        description: 'Update an existing reference in the supervised agent',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the reference to update' },
            description: { type: 'string', description: 'New description' },
            priorityLevel: { type: 'number', description: 'New priority level' },
            enabled: { type: 'boolean', description: 'Whether the reference is enabled' },
            include: { type: 'string', enum: ['always', 'manual', 'agent'], description: 'How the reference should be included' },
            text: { type: 'string', description: 'New reference text' }
          },
          required: ['name']
        },
        handler: (args: any) => this.updateSupervisedReference(args)
      },
      {
        name: 'supervised_deleteReference',
        description: 'Delete a reference from the supervised agent',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the reference to delete' }
          },
          required: ['name']
        },
        handler: (args: any) => this.deleteSupervisedReference(args.name)
      },
      {
        name: 'supervised_includeReference',
        description: 'Include a reference in the supervised session context',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the reference to include' }
          },
          required: ['name']
        },
        handler: (args: any) => this.supervisedSession?.addReference(args.name)
      },
      {
        name: 'supervised_excludeReference',
        description: 'Exclude a reference from the supervised session context',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the reference to exclude' }
          },
          required: ['name']
        },
        handler: (args: any) => this.supervisedSession?.removeReference(args.name)
      },
      
      // Supervision Tools
      {
        name: 'supervised_block_message',
        description: 'Block the current message from being processed',
        inputSchema: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Reason for blocking the message' }
          },
          required: ['reason']
        },
        handler: (args: any) => this.blockMessage(args.reason)
      },
      {
        name: 'supervised_modify_message',
        description: 'Modify the current message before processing',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'New message content' },
            reason: { type: 'string', description: 'Reason for modifying the message' }
          },
          required: ['content', 'reason']
        },
        handler: (args: any) => this.modifyMessage(args.content, args.reason)
      },
      {
        name: 'supervised_allow_message',
        description: 'Allow the current message to proceed unchanged',
        inputSchema: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Reason for allowing the message' }
          },
          required: ['reason']
        },
        handler: (args: any) => this.allowMessage(args.reason)
      },
      {
        name: 'supervised_request_human_review',
        description: 'Request human review for the current message',
        inputSchema: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Reason for requesting human review' }
          },
          required: ['reason']
        },
        handler: (args: any) => this.requestHumanReview(args.reason)
      }
    ];
  }
  
  private getSupervisedSessionData(field: keyof ReturnType<ChatSession['getState']>): any {
    if (!this.supervisedSession) {
      throw new Error('No supervised session bound');
    }
    return this.supervisedSession.getState()[field];
  }
  
  private getSupervisedSessionTools(): Tool[] {
    if (!this.supervisedSession) {
      throw new Error('No supervised session bound');
    }
    // TODO: Return the supervised agent's tools
    // This would need to be implemented based on how tools are exposed
    return [];
  }
  
  private getSupervisedSessionStats(): any {
    if (!this.supervisedSession) {
      throw new Error('No supervised session bound');
    }
    // TODO: Return session statistics
    return {
      messageCount: this.supervisedSession.getState().messages.length,
      activeRules: this.supervisedSession.getState().rules.length,
      activeReferences: this.supervisedSession.getState().references.length
    };
  }
  
  // Rules Management Methods
  private listSupervisedRules(): any {
    if (!this.supervisedSession) {
      throw new Error('No supervised session bound');
    }
    // TODO: Get rules from the supervised agent
    return [];
  }
  
  private createSupervisedRule(args: any): any {
    if (!this.supervisedSession) {
      throw new Error('No supervised session bound');
    }
    // TODO: Create rule in the supervised agent
    return { success: true, message: `Rule "${args.name}" created` };
  }
  
  private getSupervisedRule(name: string): any {
    if (!this.supervisedSession) {
      throw new Error('No supervised session bound');
    }
    // TODO: Get specific rule from the supervised agent
    return null;
  }
  
  private updateSupervisedRule(args: any): any {
    if (!this.supervisedSession) {
      throw new Error('No supervised session bound');
    }
    // TODO: Update rule in the supervised agent
    return { success: true, message: `Rule "${args.name}" updated` };
  }
  
  private deleteSupervisedRule(name: string): any {
    if (!this.supervisedSession) {
      throw new Error('No supervised session bound');
    }
    // TODO: Delete rule from the supervised agent
    return { success: true, message: `Rule "${name}" deleted` };
  }
  
  // References Management Methods
  private listSupervisedReferences(): any {
    if (!this.supervisedSession) {
      throw new Error('No supervised session bound');
    }
    // TODO: Get references from the supervised agent
    return [];
  }
  
  private createSupervisedReference(args: any): any {
    if (!this.supervisedSession) {
      throw new Error('No supervised session bound');
    }
    // TODO: Create reference in the supervised agent
    return { success: true, message: `Reference "${args.name}" created` };
  }
  
  private getSupervisedReference(name: string): any {
    if (!this.supervisedSession) {
      throw new Error('No supervised session bound');
    }
    // TODO: Get specific reference from the supervised agent
    return null;
  }
  
  private updateSupervisedReference(args: any): any {
    if (!this.supervisedSession) {
      throw new Error('No supervised session bound');
    }
    // TODO: Update reference in the supervised agent
    return { success: true, message: `Reference "${args.name}" updated` };
  }
  
  private deleteSupervisedReference(name: string): any {
    if (!this.supervisedSession) {
      throw new Error('No supervised session bound');
    }
    // TODO: Delete reference from the supervised agent
    return { success: true, message: `Reference "${name}" deleted` };
  }
  
  // Supervision Decision Methods
  private blockMessage(reason: string): any {
    // TODO: Implement message blocking
    return { action: 'block', reason };
  }
  
  private modifyMessage(content: string, reason: string): any {
    // TODO: Implement message modification
    return { action: 'modify', content, reason };
  }
  
  private allowMessage(reason: string): any {
    // TODO: Implement message allowance
    return { action: 'allow', reason };
  }
  
  private requestHumanReview(reason: string): any {
    // TODO: Implement human review request
    return { action: 'human_review', reason };
  }
  
  async processRequest(session: ChatSession, messages: ChatMessage[]): Promise<RequestSupervisionResult> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Get the supervision MCP client and inject the supervised session
    const supervisionClient = await this.agent.getMcpClient('supervision');
    if (supervisionClient && 'setSupervisedSession' in supervisionClient) {
      (supervisionClient as any).setSupervisedSession(session);
    }
    
    // Build context for the supervisor agent
    const context = this.buildSupervisorContext(session, messages);
    
    // TODO: Call the supervisor agent with the supervision tools available
    // The supervisor agent can now call supervision tools like supervised_block_message, etc.
    const response = { content: 'TODO: implement agent response generation' };
    
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
    
    // For now, just allow all responses
    // TODO: Implement response supervision logic
    return { action: 'allow' };
  }
  
  private async bindToolsToSession(supervisedSession: ChatSession): Promise<void> {
    // Inject the supervised session into the tool handlers
    this.supervisedSession = supervisedSession;
    
    // TODO: Update all supervised_* tool handlers to use this session
    // This would need to be implemented based on how tools are managed
    // const supervisedTools = this.agent.getTools().filter(tool => tool.name.startsWith('supervised_'));
    // for (const tool of supervisedTools) {
    //   tool.handler = (args: any) => this.createSessionBoundHandler(supervisedSession, tool.handler)(args);
    // }
  }
  
  private createSessionBoundHandler(session: ChatSession, originalHandler: Function) {
    return (args: any) => {
      // The tool handler now has access to the specific supervised session
      return originalHandler(args);
    };
  }
  
  private buildSupervisorContext(session: ChatSession, messages: ChatMessage[]): any {
    const lastMessage = messages[messages.length - 1];
    let content = '';
    
    if (typeof lastMessage === 'string') {
      content = lastMessage;
    } else if (lastMessage.role === 'user' || lastMessage.role === 'system' || lastMessage.role === 'error') {
      content = lastMessage.content;
    } else {
      content = 'Non-text message';
    }
    
    return {
      systemPrompt: this.config.systemPrompt,
      messages: [
        { role: 'user', content }
      ],
      tools: [] // TODO: Get tools from agent
    };
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
    // TODO: Cleanup resources
    this.logger.info(`Cleaning up agent supervisor: ${this.agentPath}`);
  }
}
