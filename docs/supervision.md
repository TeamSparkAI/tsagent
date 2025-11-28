# Agent Supervision

## Overview

The supervision system provides a middleware layer that can intercept and modify conversations between clients and agents. It supports both traditional supervisors (hardcoded logic) and agent-based supervisors (AI agents that supervise other agents using tools).

## Core Concepts

### What is Supervision?

Supervision is a mechanism that allows external components to observe and control agent conversations. Supervisors have full access to conversation state and can:

- **Observe**: Access full conversation context (system prompt, references, rules, message history)
- **Modify**: Change agent context (rules, references, tools) or message content
- **Control**: Allow, modify, or block messages at request and response stages

### Supervision Types

#### Traditional Supervisors

Hardcoded logic supervisors that implement specific supervision behaviors:

- **Architect Supervisor**: Analyzes conversation patterns, generates rules and references, tests modifications to improve agent performance
- **Guardian Supervisor**: Implements content filtering, blocks or modifies inappropriate content, configurable guardrail rules
- **Collection Supervisor**: Monitors all conversation activity, collects statistics and metadata, exports data in multiple formats

#### Agent-Based Supervisors

AI agents that supervise other agents using tools:

- Supervisor agents are regular agents configured with supervision-focused system prompts
- Access to supervision tools that allow observing and modifying the supervised agent's state
- Can dynamically manage rules, references, and tools in the supervised session
- Make supervision decisions (allow/modify/block) based on AI reasoning

## Architecture

### Core Components

#### 1. Supervision Types (`src/types/supervision.ts`)

- **SupervisionPermission**: Defines permission levels (READ_ONLY, MODIFY_CONTEXT, MODIFY_MESSAGES, FULL_CONTROL)
- **SupervisionEvent**: Represents supervision events with session and message context
- **Supervisor Interface**: Base interface for all supervisors with `processRequest()` and `processResponse()` methods
- **SupervisionManager**: Manages multiple supervisors and coordinates their actions
- **RequestSupervisionResult/ResponseSupervisionResult**: Structured result types returned by supervisors

#### 2. Supervision Manager (`src/managers/supervision-manager.ts`)

The `SupervisionManagerImpl` class coordinates supervision activities:

- Manages multiple supervisors per session
- Chains supervisors sequentially for message processing
- Handles supervisor lifecycle (add/remove/initialize/cleanup)
- Returns structured results with explicit modification notifications
- Provides full conversation context to supervisors through ChatSession object

#### 3. Base Supervisor (`src/supervisors/base-supervisor.ts`)

Provides common functionality for all supervisors:

- Permission checking
- Lifecycle management
- Default implementations for `processRequest()` and `processResponse()` methods

#### 4. Supervisor Implementations

**Traditional Supervisors**:
- `ArchitectSupervisorImpl`: Analyzes conversations, generates rules/references
- `GuardianSupervisorImpl`: Content filtering and guardrails
- `CollectionSupervisorImpl`: Monitoring and data collection

**Agent-Based Supervisor**:
- `AgentSupervisor`: Uses an AI agent with supervision tools to make decisions

## Integration Points

### ChatSession Integration

The supervision system is integrated into the `ChatSessionImpl` class:

1. **Request Processing**: Right before calling the model, supervisors receive:
   - Full conversation context (system prompt, references, rules, message history)
   - Prepared messages array with embedded rules and references
   - Complete ChatSession object for access to all session data
   - Can allow, modify, or block the request

2. **Response Processing**: After generating responses, supervisors can:
   - Allow the response to be sent unchanged
   - Modify the response content (explicit `'modify'` action)
   - Block the response entirely

### Agent Integration

The `AgentImpl` class includes supervision management methods:

- `getSupervisionManager()`: Get the current supervision manager
- `setSupervisionManager()`: Set a supervision manager
- `addSupervisor()`: Add a supervisor to the agent
- `removeSupervisor()`: Remove a supervisor
- `getSupervisor()`: Get a specific supervisor
- `getAllSupervisors()`: Get all supervisors

## Usage Examples

### Basic Setup

```typescript
import { loadAgent } from '@tsagent/core';
import { SupervisionManagerImpl } from '@tsagent/core/managers/supervision-manager';
import { GuardianSupervisorImpl } from '@tsagent/core/supervisors/guardian-supervisor';

// Load agent
const agent = await loadAgent('./my-agent', logger);

// Create supervision manager
const supervisionManager = new SupervisionManagerImpl(logger);

// Create guardian supervisor
const guardian = new GuardianSupervisorImpl('guard-1', 'Content Guardian', logger);
await guardian.setGuardrailRules(['no profanity', 'no personal info']);

// Add supervisor to manager
await supervisionManager.addSupervisor(guardian);

// Set supervision manager on agent
agent.setSupervisionManager(supervisionManager);

// Create supervised session
const session = agent.createChatSession('session-1');
await supervisionManager.registerSupervisor('session-1', guardian);

// Messages will now be supervised with full conversation context
const response = await session.handleMessage('Hello!');
```

## Agent-Based Supervisors

### Overview

Agent-based supervisors use AI agents to supervise other agents. Instead of hardcoded logic, supervisor agents use tools to observe and modify the supervised agent's state.

### Key Concepts

**Tool-Based Interaction**: Supervisor agents interact with the supervised agent's state through structured tools rather than natural language parsing. This provides:
- **Reliability**: No text parsing errors
- **Auditability**: Clear record of what the supervisor did
- **Safety**: Tools can have validation and safety checks
- **Flexibility**: Supervisor can use tools in any combination

**Dynamic Tool Binding**: Supervisor tools are installed at runtime and bound to the specific supervised session. This allows the supervisor agent to interact with the supervised agent's context, not its own.

### Creating a Supervisor Agent

1. **Create a regular agent** with supervision-focused configuration:
   ```bash
   tsagent-cli create-agent ./supervisors/architect-agent \
     --name "Architect Supervisor" \
     --description "Supervises and improves other agents" \
     --system-prompt "You are an Architect Agent supervising another AI agent..."
   ```

2. **Configure in agent YAML** - supervisors are configured in the agent's YAML configuration file:
   ```yaml
   supervisors:
     - type: "agent"
       id: "architect-supervisor"
       name: "Conversation Architect"
       config:
         agentPath: "./supervisors/architect-agent"
         allowedActions: ["READ_ONLY", "MODIFY_CONTEXT"]
   ```

3. **Automatic loading** - supervisors are automatically loaded when the agent is created

### Supervision Tools

Supervisor agents have access to tools that allow them to observe and modify the supervised agent's state:

#### Data Access Tools
- `supervised_get_conversation_history`: Get conversation history
- `supervised_get_current_rules`: Get currently active rules
- `supervised_get_current_references`: Get currently active references
- `supervised_get_available_tools`: Enumerate supervised agent's tools
- `supervised_get_session_stats`: Get basic session statistics

#### Rules Management Tools
- `supervised_listRules`: List all available rules
- `supervised_createRule`: Create a new rule
- `supervised_getRule`: Get a specific rule
- `supervised_updateRule`: Update a rule
- `supervised_deleteRule`: Delete a rule
- `supervised_includeRule`: Add rule to session context
- `supervised_excludeRule`: Remove rule from session context

#### References Management Tools
- `supervised_listReferences`: List all available references
- `supervised_createReference`: Create a new reference
- `supervised_getReference`: Get a specific reference
- `supervised_updateReference`: Update a reference
- `supervised_deleteReference`: Delete a reference
- `supervised_includeReference`: Add reference to session context
- `supervised_excludeReference`: Remove reference from session context

#### Tool Context Management Tools
- `supervised_listTools`: List all available tools
- `supervised_getTool`: Get specific tool details
- `supervised_listContextTools`: List tools currently in context
- `supervised_includeTool`: Include tool in context
- `supervised_excludeTool`: Exclude tool from context
- `supervised_setToolIncludeMode`: Set tool include mode
- `supervised_listToolServers`: List all available tool servers
- `supervised_setServerIncludeMode`: Set server include mode
- `supervised_includeToolServer`: Include entire server in context
- `supervised_excludeToolServer`: Exclude entire server from context

#### Supervision Decision Tools
- `supervised_block_message`: Block the current message
- `supervised_modify_message`: Modify the current message
- `supervised_allow_message`: Allow the current message
- `supervised_request_human_review`: Request human review

### Shared State Approach

Agent supervisors use a shared state object that supervision tools can mutate directly. This approach:
- Eliminates parsing errors (no need to parse supervisor agent responses)
- Provides type safety (state object has enforced structure)
- Enables natural tool usage (supervisor agent treats supervision tools like any other tools)

```typescript
interface SupervisionState {
  decision: 'allow' | 'modify' | 'block' | null;
  reasons: string[];
  modifiedRequestContent?: string;
  modifiedResponseContent?: string;
  contextChanges: {
    addedRules: string[];
    removedRules: string[];
    addedReferences: string[];
    removedReferences: string[];
    // ...
  };
}
```

## Content Modification

### Request Modification

Request messages are simple text messages that supervisors can directly replace:

```typescript
async processRequest(session: ChatSession, messages: ChatMessage[]): Promise<RequestSupervisionResult> {
  const lastMessage = messages[messages.length - 1];
  const content = typeof lastMessage === 'string' ? lastMessage : lastMessage.content;
  
  // Sanitize
  const sanitized = content.replace(/badword/g, '****');
  
  if (sanitized !== content) {
    return {
      action: 'modify',
      finalMessage: { role: 'user', content: sanitized },
      reasons: ['Content sanitized']
    };
  }
  
  return { action: 'allow' };
}
```

### Response Modification

Response messages have a complex multi-turn structure. Supervisors can modify responses in two ways:

#### Abstract Level (Current Implementation)
Supervisors can provide a simple text replacement that replaces the entire response:

```typescript
{
  action: 'modify',
  finalResponse: {
    updates: [{
      role: 'assistant',
      modelReply: {
        timestamp: Date.now(),
        turns: [{
          message: "Replacement text here"
        }]
      }
    }]
  }
}
```

#### Structural Level (Future Enhancement)
For fine-grained control, supervisors could navigate and modify specific turns (not yet implemented).

### Context Modifications

Context modifications (rules, references, tools) are applied directly via supervision tools. These don't go through the structured result flow because they:
- Are operational changes, not content changes
- Need immediate effect
- Don't need aggregation across supervisors

## Permission System

The supervision system includes a comprehensive permission system:

- **READ_ONLY**: Can only observe conversations
- **MODIFY_CONTEXT**: Can modify agent context (rules, references, system prompt)
- **MODIFY_MESSAGES**: Can modify message content
- **FULL_CONTROL**: Complete control over the conversation

## Result Types

The supervision system uses structured result types that provide explicit notifications:

- **RequestSupervisionResult**: For client-to-agent messages with `finalMessage` property
- **ResponseSupervisionResult**: For agent-to-client responses with `finalResponse` property
- **Actions**: `'allow'`, `'modify'`, or `'block'` with explicit modification notifications
- **Reasons**: Optional array of strings explaining supervisor decisions

## Error Handling

The supervision system is designed to be fault-tolerant:

- If a supervisor fails, the conversation continues with the original message
- Supervision errors are logged but don't break the conversation flow
- Failed supervisors are automatically removed from the decision pipeline
- Sequential chaining ensures each supervisor receives the output of the previous supervisor

## Current Implementation Status

### ✅ Completed Features

- **Full Conversation Context Access**: Supervisors receive complete `ChatSession` object
- **Traditional Supervisors**: Architect, Guardian, Collection supervisors implemented
- **Agent-Based Supervisors**: Agent supervisors with dynamic tool binding
- **Supervision Tools**: Complete tool set (25+ tools) for agent supervisors
- **Content Modification**: Request and response modification support
- **Context Modification**: Rules, references, and tools can be modified via tools
- **Permission System**: Configurable permission levels
- **Sequential Chaining**: Multiple supervisors can be chained
- **Shared State Approach**: Agent supervisors use shared state for tool interaction

### ⏳ Remaining Work

- **System Prompt Modification**: No tools or API for supervisors to modify agent system prompt during runtime
- **Multiple Message Testing**: No mechanism for supervisors to send multiple test messages
- **Multiple Response Options**: No support for presenting multiple responses to users
- **Conversation Replay and Mutation**: No replay or mutation testing capabilities
- **Passive Observation Mode**: Supervisors only work in real-time, no post-conversation analysis
- **Message Supervision Actions**: Tools defined but return placeholders (block/modify/allow message tools need implementation)

## Design Decisions

### 1. Tool-Based Interaction
- **Why**: Structured, reliable, auditable
- **Alternative**: Natural language parsing (error-prone)
- **Trade-off**: More complex tool design vs. reliability

### 2. Dynamic Tool Binding
- **Why**: Supervisor agent needs to interact with supervised agent's context, not its own
- **Alternative**: Static tool configuration (doesn't work for cross-session operations)
- **Trade-off**: Runtime complexity vs. functional requirements

### 3. Shared State Approach
- **Why**: Eliminates parsing errors, provides type safety, enables natural tool usage
- **Alternative**: Parse supervisor agent responses (error-prone)
- **Trade-off**: State management complexity vs. reliability

### 4. Sequential Chaining
- **Why**: Each supervisor receives the output of the previous supervisor
- **Alternative**: Parallel processing (can't chain modifications)
- **Trade-off**: Sequential processing time vs. modification chaining

### 5. Abstract vs. Structural Response Modification
- **Why**: Abstract modification is simpler and works for most use cases
- **Alternative**: Structural modification (more complex, more powerful)
- **Trade-off**: Simplicity vs. fine-grained control

## Future Enhancements

1. **System Prompt Modification**: Tools for supervisors to modify agent system prompt during runtime
2. **Multiple Message Testing**: Mechanism for supervisors to send multiple test messages
3. **Multiple Response Options**: Support for presenting multiple responses to users
4. **Conversation Replay and Mutation**: Replay and mutation testing capabilities
5. **Passive Observation Mode**: Post-conversation analysis mode
6. **Structural Response Modification**: Fine-grained editing of multi-turn responses
7. **Machine Learning Integration**: Use ML models for more sophisticated content analysis
8. **Real-time Analytics**: Live dashboards for supervision metrics
9. **Distributed Supervision**: Support for remote supervisors via network protocols
10. **A/B Testing**: Framework for testing supervisor modifications
