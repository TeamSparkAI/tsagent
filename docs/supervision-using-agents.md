# Agent-Based Supervisors

## Overview

This document describes a design for implementing supervisors using AI agents. Instead of hardcoded supervisor logic, we can use AI agents that have access to tools for observing and modifying the supervised agent's state.

### Key Concepts

**Agent-Based Supervision**: Rather than implementing supervisors as hardcoded logic, we use AI agents that can reason about supervision decisions and learn from interactions. This approach provides flexibility, adaptability, and human-like reasoning capabilities.

**Tool-Based Interaction**: Supervisor agents interact with the supervised agent's state through structured tools rather than natural language parsing. This eliminates parsing errors, provides auditability, and ensures reliable communication between the supervisor and supervised systems.

**Context Management**: Supervisor agents have access to tools that allow them to dynamically manage the supervised agent's context, including adding/removing rules and references from the current session context. This enables real-time optimization of the supervised agent's capabilities.

**Abstract Design**: The system is designed to be abstract - supervisor agents can implement any supervision logic within the privileges and tools provided. Specific supervisor types (like "architect" or "guardian") are implementation choices, not fixed types in the system.

### What You'll Learn

This document covers:
- How to design supervisor agents that can observe and modify other agents
- The tool-based architecture that enables reliable supervisor-agent interaction
- How supervisor agents can manage rules, references, and context dynamically
- Implementation patterns for different types of supervision (architect, curator, etc.)
- Key design decisions and trade-offs in the architecture

## Core Concept

**Agent Supervisors** are AI agents that supervise other AI agents by:
1. **Observing** the supervised agent's interactions and state through tools
2. **Analyzing** patterns and making decisions using their AI capabilities
3. **Modifying** the supervised agent's context (rules, references, tools) when appropriate
4. **Making supervision decisions** (allow/modify/block) based on their analysis

## Architecture

### Supervisor Agent Creation

Supervisor agents are created using the existing agent creation tooling. There's no special creation process - you simply:

1. **Create a regular agent** with supervision-focused configuration:
   - System prompt for supervision role
   - Rules for supervision behavior  
   - References for supervision knowledge
   - Tools for supervision tasks

2. **Configure in agent JSON** - supervisors are configured in the agent's JSON configuration file:
   ```json
   {
     "metadata": { ... },
     "settings": { ... },
     "supervisors": [
       {
         "type": "agent",
         "id": "architect-supervisor",
         "name": "Conversation Architect",
         "config": {
           "agentPath": "./supervisors/architect-agent",
           "allowedActions": ["READ_ONLY", "MODIFY_CONTEXT"]
         }
       }
     ]
   }
   ```

### Complete Example: Creating and Configuring a Supervisor Agent

Here's a complete step-by-step example of creating a supervisor agent and configuring it:

#### Step 1: Create the Supervisor Agent

Use the existing agent creation tooling to create a supervisor agent:

```bash
# Using CLI
tsagent-cli create-agent ./supervisors/architect-agent \
  --name "Architect Supervisor" \
  --description "Supervises and improves other agents" \
  --system-prompt "You are an Architect Agent supervising another AI agent. Your job is to observe interactions, identify patterns, and suggest improvements to rules and references."

# Or using the desktop app (Foundry)
# 1. Create new agent
# 2. Set name: "Architect Supervisor"  
# 3. Set system prompt with supervision instructions
# 4. Save to ./supervisors/architect-agent/
```

#### Step 2: Configure the Supervisor in the Supervised Agent

Edit the supervised agent's JSON configuration file to include the supervisor:

```json
{
  "metadata": {
    "name": "My Supervised Agent",
    "description": "An agent that gets supervised",
    "created": "2024-01-01T00:00:00Z",
    "lastAccessed": "2024-01-01T00:00:00Z"
  },
  "settings": {
    "maxChatTurns": "50",
    "maxOutputTokens": "4000",
    "temperature": "0.7",
    "topP": "0.9"
  },
  "supervisors": [
    {
      "type": "agent",
      "id": "architect-supervisor",
      "name": "Conversation Architect",
       "config": {
         "agentPath": "./supervisors/architect-agent",
         "allowedActions": ["READ_ONLY", "MODIFY_CONTEXT"]
       }
    }
  ]
}
```

#### Step 3: Load the Supervised Agent

When you load the supervised agent, the supervisor will be automatically loaded and configured:

```typescript
import { loadAgent } from '@tsagent/core';

const supervisedAgent = await loadAgent('./my-supervised-agent', logger);

// The architect supervisor is now automatically loaded and configured
// It will supervise all chat sessions created with this agent
const session = supervisedAgent.createChatSession('supervised-session');
```

3. **Automatic loading** - supervisors are automatically loaded when the agent is created and are available for all chat sessions

### Agent Supervisor Interface

```typescript
interface AgentSupervisor extends Supervisor {
  readonly agent: Agent;
  readonly config: AgentSupervisorConfig;
  
  // The agent supervisor uses tools to interact with the supervised agent
  processRequest(session: ChatSession, messages: ChatMessage[]): Promise<RequestSupervisionResult>;
  processResponse(session: ChatSession, response: MessageUpdate): Promise<ResponseSupervisionResult>;
}
```

### Configuration

```typescript
interface AgentSupervisorConfig {
  systemPrompt: string;
  tools: SupervisorTool[];
  allowedActions: SupervisionPermission[];
}
```

## Tool-Based Interaction

### Core Design Principle

Agent supervisors interact with the supervised agent's state through **structured tools** rather than natural language parsing. This provides:

- **Reliability**: No text parsing errors
- **Auditability**: Clear record of what the supervisor did
- **Safety**: Tools can have validation and safety checks
- **Flexibility**: Supervisor can use tools in any combination

### Tool Categories

Tools provide access to data and functionality that already exists in the chat session. They are wrappers over the existing context, not magic analysis functions.

#### 1. Data Access Tools
Tools for accessing the supervised agent's state:

```typescript
// Access existing session data
'get_conversation_history' -> ChatMessage[]
'get_session_state' -> SessionState
'get_current_rules' -> string[]  // Currently active rules in session
'get_current_references' -> string[]  // Currently active references in session
'get_available_tools' -> Tool[]  // Enumerate supervised agent's tools
'get_session_stats' -> SessionStats  // Basic stats like message count, etc.
```

#### 2. Rules Management Tools
Tools for managing rules (based on existing MCP client-rules):

```typescript
// Rule CRUD operations
'createRule' -> { name: string, text: string, description?: string, priorityLevel?: number, enabled?: boolean, include?: 'always' | 'manual' | 'agent' }
'getRule' -> { name: string } -> Rule
'updateRule' -> { name: string, text?: string, description?: string, priorityLevel?: number, enabled?: boolean, include?: 'always' | 'manual' | 'agent' }
'deleteRule' -> { name: string }
'listRules' -> {} -> Rule[]  // Get all available rules

// Rule context management
'includeRule' -> { name: string }  // Add rule to current session context
'excludeRule' -> { name: string }  // Remove rule from current session context
```

#### 3. References Management Tools
Tools for managing references (based on existing MCP client-references):

```typescript
// Reference CRUD operations
'createReference' -> { name: string, text: string, description?: string, priorityLevel?: number, enabled?: boolean, include?: 'always' | 'manual' | 'agent' }
'getReference' -> { name: string } -> Reference
'updateReference' -> { name: string, text?: string, description?: string, priorityLevel?: number, enabled?: boolean, include?: 'always' | 'manual' | 'agent' }
'deleteReference' -> { name: string }
'listReferences' -> {} -> Reference[]  // Get all available references

// Reference context management
'includeReference' -> { name: string }  // Add reference to current session context
'excludeReference' -> { name: string }  // Remove reference from current session context
```

#### 4. Tool Context Management Tools
Tools for managing the supervised agent's tool context:

```typescript
// Tool listing and inspection
'supervised_listTools' -> {} -> ToolInfo[]  // List all available tools
'supervised_getTool' -> { serverName: string, toolName: string } -> ToolInfo  // Get specific tool details
'supervised_listContextTools' -> {} -> ToolInfo[]  // List tools currently in context

// Tool-level context management
'supervised_includeTool' -> { serverName: string, toolName: string }  // Include tool in context
'supervised_excludeTool' -> { serverName: string, toolName: string }  // Exclude tool from context
'supervised_setToolIncludeMode' -> { serverName: string, toolName: string, mode: 'always' | 'manual' | 'agent' }  // Set tool include mode

// Server-level context management
'supervised_listToolServers' -> {} -> ToolServerInfo[]  // List all available tool servers
'supervised_getToolServer' -> { serverName: string } -> ToolServerInfo  // Get server information
'supervised_setServerIncludeMode' -> { serverName: string, mode: 'always' | 'manual' | 'agent' }  // Set server include mode
'supervised_includeToolServer' -> { serverName: string }  // Include entire server in context
'supervised_excludeToolServer' -> { serverName: string }  // Exclude entire server from context
```

#### 5. Supervision Tools
Tools for making supervision decisions:

```typescript
// Supervision decisions
'supervised_block_message' -> { reason: string }  // Block the current message
'supervised_modify_message' -> { content: string, reason: string }  // Modify the current message
'supervised_allow_message' -> { reason: string }  // Allow the current message
'supervised_request_human_review' -> { reason: string, priority: 'low' | 'medium' | 'high' }  // Request human review
```

**Tool Organization**: Tools are organized by server (MCP server provides a set of tools), and both servers and tools can be moved in/out of the current context. When referencing tools, we always need the name of the server that provides that tool.

**Note**: The supervisor agent is responsible for analysis and decision-making. Tools only provide access to data and basic operations - they don't perform analysis.

## Implementation

### Dynamic Tool Binding Architecture

The key challenge in implementing agent-based supervisors is that the supervisor agent needs to interact with the **supervised agent's context**, not its own context. This is solved through **dynamic tool binding** - installing supervisor tools at runtime that are bound to the specific supervised session.

### Session Injection Mechanism

When the supervisor agent receives a `processRequest` call, it injects the supervised session into its installed tools:

1. **Tool Installation**: Supervisor tools are installed when the supervisor is initialized (once per supervisor)
2. **Session Injection**: When `processRequest` is called, the supervised session gets injected into the tool handlers
3. **Tool Binding**: The `supervised_*` tool handlers get bound to the specific supervised session
4. **Agent Call**: The supervisor agent can then call its own agent with tools that operate on the injected session

This allows the supervisor agent to use its own tools (from MCP servers) alongside tools that operate on the supervised session.

### Supervisor Tool Installation

Supervisor tools are installed once per supervised session and remain active for the duration of that supervision relationship:

```typescript
class SupervisionManager {
  private supervisorToolsInstalled = new Set<string>();
  
  async processRequest(session: ChatSession, messages: ChatMessage[]): Promise<RequestSupervisionResult> {
    const supervisor = this.getSupervisor(session.id);
    
    // Install supervisor tools once per supervised session
    if (!this.supervisorToolsInstalled.has(session.id)) {
      await this.installSupervisorTools(supervisor, session);
      this.supervisorToolsInstalled.add(session.id);
    }
    
    // Build context for the supervisor agent
    const context = this.buildSupervisorContext(session, messages);
    
    // Call the supervisor agent with tools
    const response = await supervisor.agent.generateResponse(context);
    
    // Parse tool calls to extract supervision decisions and modifications
    const result = this.parseSupervisorResponse(response);
    
    // Apply any modifications to the supervised session
    if (result.modifications.length > 0) {
      await this.applyModifications(session, result.modifications);
    }
    
    return result.supervisionResult;
  }
  
  private async installSupervisorTools(supervisor: Supervisor, supervisedSession: ChatSession): Promise<void> {
    // Get supervisor's existing tools (from its MCP servers)
    const supervisorTools = supervisor.agent.getTools();
    
    // Create supervised session tools with 'supervised_' prefix
    const supervisedTools = this.createSupervisorTools(supervisedSession);
    
    // Merge tools (supervisor's tools + supervised session tools)
    const allTools = [
      ...supervisorTools,
      ...supervisedTools
    ];
    
    // Install merged tool set
    await supervisor.agent.installTools(allTools);
  }
  
  private createSupervisorTools(supervisedSession: ChatSession): Tool[] {
    return [
      {
        name: 'supervised_get_conversation_history',
        description: 'Get conversation history from supervised session',
        inputSchema: { type: 'object', properties: {}, required: [] },
        handler: () => supervisedSession.getState().messages,
        permissionRequired: false  // Internal tool, no user permission needed
      },
      {
        name: 'supervised_get_current_rules',
        description: 'Get currently active rules in supervised session',
        inputSchema: { type: 'object', properties: {}, required: [] },
        handler: () => supervisedSession.getState().rules,
        permissionRequired: false
      },
      {
        name: 'supervised_include_rule',
        description: 'Include a rule in the supervised session context',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the rule to include' }
          },
          required: ['name']
        },
        handler: (args) => supervisedSession.includeRule(args.name),
        permissionRequired: false
      },
      {
        name: 'supervised_exclude_rule',
        description: 'Exclude a rule from the supervised session context',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the rule to exclude' }
          },
          required: ['name']
        },
        handler: (args) => supervisedSession.excludeRule(args.name),
        permissionRequired: false
      },
      // ... other supervisor tools
    ];
  }
}
```

### Tool Namespacing

Tools are namespaced to prevent conflicts:

- **Supervisor's own tools**: Use MCP server prefixes (e.g., `rules_createRule`, `references_createReference`)
- **Supervised session tools**: Use `supervised_` prefix (e.g., `supervised_include_rule`, `supervised_get_conversation_history`)

### Agent Supervisor Implementation

The `AgentSupervisor` loads its agent when created and installs supervision tools:

```typescript
class AgentSupervisor implements Supervisor {
  private agent: Agent;
  private supervisedSession?: ChatSession;
  
  constructor(
    private agentPath: string,
    private config: AgentSupervisorConfig,
    private logger: Logger
  ) {}
  
  async initialize(): Promise<void> {
    // Load the supervisor agent from the specified path
    this.agent = await loadAgent(this.agentPath, this.logger);
    
    // Install supervision tools (not bound to any session yet)
    await this.installSupervisionTools();
  }
  
  private async installSupervisionTools(): Promise<void> {
    // Install supervision tools that will be bound to supervised sessions
    const supervisionTools = this.createSupervisionTools();
    await this.agent.installTools(supervisionTools);
  }
  
  async processRequest(session: ChatSession, messages: ChatMessage[]): Promise<RequestSupervisionResult> {
    // Bind tools to the specific supervised session
    await this.bindToolsToSession(session);
    
    // Build context for the supervisor agent
    const context = this.buildSupervisorContext(session, messages);
    
    // Call the supervisor agent with tools
    const response = await this.agent.generateResponse(context);
    
    // Parse tool calls to extract supervision decisions and modifications
    const result = this.parseSupervisorResponse(response);
    
    // Apply any modifications to the supervised session
    if (result.modifications.length > 0) {
      await this.applyModifications(session, result.modifications);
    }
    
    return result.supervisionResult;
  }
  
  private async bindToolsToSession(supervisedSession: ChatSession): Promise<void> {
    // Inject the supervised session into the tool handlers
    this.supervisedSession = supervisedSession;
    
    // Update all supervised_* tool handlers to use this session
    const supervisedTools = this.agent.getTools().filter(tool => tool.name.startsWith('supervised_'));
    for (const tool of supervisedTools) {
      // Update the tool handler to use the injected session
      tool.handler = (args) => this.createSessionBoundHandler(supervisedSession, tool.originalHandler)(args);
    }
  }
  
  private createSessionBoundHandler(session: ChatSession, originalHandler: Function) {
    return (args: any) => {
      // The tool handler now has access to the specific supervised session
      return originalHandler(args, session);
    };
  }
  
  protected abstract buildSupervisorContext(session: ChatSession, messages: ChatMessage[]): AgentContext;
  protected abstract parseSupervisorResponse(response: AgentResponse): SupervisorResult;
  protected abstract applyModifications(session: ChatSession, modifications: Modification[]): Promise<void>;
}
```

### Base Agent Supervisor

```typescript
abstract class BaseAgentSupervisor extends AgentSupervisor {
  constructor(
    agentPath: string,
    config: AgentSupervisorConfig,
    logger: Logger
  ) {
    super(agentPath, config, logger);
  }
  
  protected buildSupervisorContext(session: ChatSession, messages: ChatMessage[]): AgentContext {
    // Build context for the supervisor agent
    return {
      systemPrompt: this.config.systemPrompt,
      messages: [
        { role: 'user', content: messages[messages.length - 1].content }
      ],
      tools: this.getSupervisorTools(session)
    };
  }
  
  protected abstract getSupervisorTools(session: ChatSession): SupervisorTool[];
  protected abstract parseSupervisorResponse(response: AgentResponse): SupervisorResult;
  protected abstract applyModifications(session: ChatSession, modifications: Modification[]): Promise<void>;
}
```

### Example Supervisor Implementations

These are examples of how the abstract agent supervisor design can be used to implement specific supervisor types.

#### Architect Agent Supervisor Example

```typescript
class ArchitectAgentSupervisor extends BaseAgentSupervisor {
  constructor(
    agentPath: string,
    logger: Logger
  ) {
    super(agentPath, {
      systemPrompt: `You are an Architect Agent supervising another AI agent. Your job is to:

1. Observe the supervised agent's interactions and performance
2. Identify patterns, strengths, and areas for improvement  
3. Suggest and implement rules, references, and other improvements
4. Help the supervised agent build skills and become more effective

You have access to tools that let you:
- Observe the supervised agent's conversation history
- View current rules and references
- Enumerate available tools
- Add, modify, or remove rules and references
- Access basic session statistics

Use these tools to continuously improve the supervised agent's capabilities.`,
      tools: [],
      maxModifications: 10,
      allowedActions: [SupervisionPermission.READ_ONLY, SupervisionPermission.MODIFY_CONTEXT],
      fallbackBehavior: 'allow'
    }, logger);
  }
  
  private getArchitectTools(session: ChatSession): SupervisorTool[] {
    return [
      // Supervised session tools (installed dynamically)
      'supervised_get_conversation_history',
      'supervised_get_current_rules',
      'supervised_get_current_references', 
      'supervised_get_available_tools',
      'supervised_get_session_stats',
      // Rules management
      'supervised_listRules',
      'supervised_createRule',
      'supervised_getRule',
      'supervised_updateRule',
      'supervised_deleteRule',
      'supervised_includeRule',
      'supervised_excludeRule',
      // References management
      'supervised_listReferences',
      'supervised_createReference',
      'supervised_getReference',
      'supervised_updateReference',
      'supervised_deleteReference',
      'supervised_includeReference',
      'supervised_excludeReference'
    ];
  }
}
```

#### Context Curator Agent Supervisor Example

```typescript
class ContextCuratorAgentSupervisor extends BaseAgentSupervisor {
  protected buildSupervisorContext(session: ChatSession, messages: ChatMessage[]): AgentContext {
    return {
      systemPrompt: this.buildCuratorPrompt(session),
      messages: [
        { role: 'user', content: messages[messages.length - 1].content }
      ],
      tools: this.getCuratorTools(session)
    };
  }
  
  private buildCuratorPrompt(session: ChatSession): string {
    return `You are a Context Curator Agent supervising another AI agent. Your job is to:

1. Assess each user prompt to determine relevance
2. Select the most appropriate rules, references, and tools for the context
3. Optimize the supervised agent's context for maximum effectiveness
4. Ensure the supervised agent has the right information at the right time

You have access to tools that let you:
- Observe the supervised agent's current context
- Access conversation history and current rules/references
- Enumerate available tools
- Modify rules and references

Use these tools to ensure the supervised agent always has the most relevant context.`;
  }
  
  private getCuratorTools(session: ChatSession): SupervisorTool[] {
    return [
      // Supervised session tools (installed dynamically)
      'supervised_get_conversation_history',
      'supervised_get_current_rules',
      'supervised_get_current_references',
      'supervised_get_available_tools',
      'supervised_get_session_stats',
      // Rules management
      'supervised_listRules',
      'supervised_getRule',
      'supervised_includeRule',
      'supervised_excludeRule',
      // References management
      'supervised_listReferences',
      'supervised_getReference',
      'supervised_includeReference',
      'supervised_excludeReference'
    ];
  }
}
```

## Key Design Decisions

### 1. Tool-Based Interaction
- **Why**: Structured, reliable, auditable
- **Alternative**: Natural language parsing (error-prone)
- **Trade-off**: More complex tool design vs. reliability

### 2. Every Message Processing
- **Why**: Architect needs to observe all interactions to build skills
- **Alternative**: Periodic processing (misses patterns)
- **Trade-off**: Higher cost vs. better supervision

### 3. Tool Enumeration vs. Tool Calling
- **Why**: Architect needs to know available tools to create relevant rules/references
- **Alternative**: Full tool access (security risk)
- **Trade-off**: Limited access vs. security

### 4. Abstract Design
- **Why**: Supervisor agent can do whatever it wants within provided privileges and tools
- **Alternative**: Fixed supervisor types (inflexible)
- **Trade-off**: Complexity vs. flexibility

### 5. Tool Wrappers
- **Why**: Tools are wrappers over existing session data/functionality
- **Alternative**: Magic analysis tools (doesn't exist)
- **Trade-off**: Simple data access vs. complex analysis functions

### 6. Dynamic Tool Binding
- **Why**: Supervisor agent needs to interact with supervised agent's context, not its own
- **Alternative**: Static tool configuration (doesn't work for cross-session operations)
- **Trade-off**: Runtime complexity vs. functional requirements

### 7. Once-Per-Session Installation
- **Why**: Efficient tool management and context building across multiple supervision calls
- **Alternative**: Install tools on every request (inefficient)
- **Trade-off**: Memory usage vs. performance

### 8. Tool Namespacing
- **Why**: Prevent conflicts between supervisor's own tools and supervised session tools
- **Alternative**: Global tool namespace (conflicts and collisions)
- **Trade-off**: Tool name complexity vs. collision prevention

## Benefits

1. **Flexibility**: Any supervision logic can be implemented as an agent
2. **Reliability**: Tool-based interaction eliminates parsing errors
3. **Auditability**: Clear record of supervisor actions
4. **Safety**: Tools can have validation and safety checks
5. **Extensibility**: Easy to add new supervisor types
6. **Human-like**: Supervisors can reason about complex situations

## Challenges

1. **Tool Design**: Need comprehensive tool set for all supervision needs
2. **Performance**: Agent calls are expensive (mitigated by agent-building use case)
3. **Validation**: Need to validate supervisor agent's tool usage
4. **Safety**: Prevent harmful modifications by supervisor agents
5. **Consistency**: Ensure supervisor agents follow protocols

## Future Enhancements

1. **Human Oversight**: Review supervisor agent changes before applying
2. **Learning**: Supervisor agents that learn from their supervision history
3. **Collaboration**: Multiple supervisor agents working together
4. **Specialization**: Domain-specific supervisor agents
5. **Metrics**: Measure supervisor agent effectiveness
