# Agent Supervision Implementation

This document describes the implementation of the agent supervision system as outlined in `supervision.md`.

## Overview

The supervision system provides a middleware layer that can intercept and modify conversations between clients and agents. It supports both traditional supervisors and agent-based supervisors:

1. **Traditional Supervisors**: Hardcoded logic supervisors (Architect, Guardian, Collection)
2. **Agent-Based Supervisors**: AI agents that supervise other agents using tools

## Current Implementation Status

✅ **Implemented**: Traditional supervisors (Architect, Guardian, Collection)
✅ **Implemented**: Agent-based supervisors with dynamic tool binding
✅ **Implemented**: Supervisor configuration system
✅ **Implemented**: Complete supervision tool set (25+ tools)

See `supervision-using-agents.md` for details on the agent-based supervisor implementation.

## Architecture

### Core Components

#### 1. Supervision Types (`src/types/supervision.ts`)

- **SupervisionPermission**: Defines permission levels (READ_ONLY, MODIFY_CONTEXT, MODIFY_MESSAGES, FULL_CONTROL)
- **SupervisionEvent**: Represents supervision events with session and message context
- **Supervisor Interface**: Base interface for all supervisors with `processRequest()` and `processResponse()` methods
- **SupervisionManager**: Manages multiple supervisors and coordinates their actions
- **RequestSupervisionResult/ResponseSupervisionResult**: Structured result types returned by supervisors and consumed by clients

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

#### 4. Specific Supervisor Implementations

**Architect Supervisor** (`src/supervisors/architect-supervisor.ts`):
- Analyzes conversation patterns
- Generates rules and references
- Tests modifications to improve agent performance
- Provides recommendations for agent improvement

**Guardian Supervisor** (`src/supervisors/guardian-supervisor.ts`):
- Implements content filtering
- Blocks or modifies inappropriate content
- Configurable guardrail rules
- Content sanitization capabilities

**Collection Supervisor** (`src/supervisors/collection-supervisor.ts`):
- Monitors all conversation activity
- Collects statistics and metadata
- Exports data in multiple formats (JSON, CSV, Log)
- Provides analytics on conversation patterns

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

### Architect Supervisor

```typescript
import { ArchitectSupervisorImpl } from '@tsagent/core/supervisors/architect-supervisor';

const architect = new ArchitectSupervisorImpl('arch-1', 'Conversation Architect', logger);

// Analyze conversation
const analysis = await architect.analyzeConversation(context);
console.log('Suggested rules:', analysis.suggestedRules);
console.log('Suggested references:', analysis.suggestedReferences);

// Test modifications
const testResult = await architect.testModifications(context, modifications);
console.log('Improvement score:', testResult.improvementScore);
```

### Collection Supervisor

```typescript
import { CollectionSupervisorImpl } from '@tsagent/core/supervisors/collection-supervisor';

const collector = new CollectionSupervisorImpl('collect-1', 'Data Collector', logger);

// Get statistics
const stats = collector.getCollectionStats();
console.log('Total messages:', stats.totalMessages);
console.log('Average session length:', stats.averageSessionLength);

// Export data
const jsonData = await collector.exportData('json');
const csvData = await collector.exportData('csv');
```

## Permission System

The supervision system includes a comprehensive permission system:

- **READ_ONLY**: Can only observe conversations
- **MODIFY_CONTEXT**: Can modify agent context (rules, references, system prompt)
- **MODIFY_MESSAGES**: Can modify message content
- **FULL_CONTROL**: Complete control over the conversation

## Event System

Supervisors can emit and listen to events:

- `supervisionDecision`: Emitted when a supervisor makes a decision
- `messageIntercepted`: Emitted when a message is intercepted
- `contextModified`: Emitted when context is modified

## Result Types

The supervision system uses structured result types that provide explicit notifications:

- **RequestSupervisionResult**: For client-to-agent messages with `finalMessage` property
- **ResponseSupervisionResult**: For agent-to-client responses with `finalResponse` property
- **Actions**: `'allow'`, `'modify'`, or `'block'` with explicit modification notifications
- **Reasons**: Optional array of strings explaining supervisor decisions
- **Clean Interface**: No redundant parameters or metadata hacks

## Error Handling

The supervision system is designed to be fault-tolerant:

- If a supervisor fails, the conversation continues with the original message
- Supervision errors are logged but don't break the conversation flow
- Failed supervisors are automatically removed from the decision pipeline
- Sequential chaining ensures each supervisor receives the output of the previous supervisor

## Performance Considerations

- Supervisors run asynchronously to avoid blocking the main conversation flow
- Sequential chaining ensures predictable processing order
- Supervision decisions are cached where possible
- Collection supervisors use efficient data structures for large datasets

## Future Enhancements

1. **Machine Learning Integration**: Use ML models for more sophisticated content analysis
2. **Real-time Analytics**: Live dashboards for supervision metrics
3. **Distributed Supervision**: Support for remote supervisors via network protocols
4. **Advanced Testing**: A/B testing framework for supervisor modifications
5. **Visualization Tools**: UI components for monitoring supervision activities

## Testing

The supervision system includes comprehensive test coverage:

- Unit tests for all supervisor types
- Integration tests for the supervision manager
- Performance tests for high-volume scenarios
- Error handling tests for fault tolerance

## Security Considerations

- Supervisors run in isolated contexts to prevent privilege escalation
- Content filtering uses secure, validated patterns
- Data collection follows privacy-preserving principles
- Supervisor permissions are strictly enforced

This implementation provides a robust foundation for agent supervision while maintaining the flexibility to extend and customize supervision behavior for specific use cases.

## Current Implementation Status

### **✅ Completed Features**

#### **Full Conversation Context Access**
- Supervisors receive complete `ChatSession` object with access to:
  - `session.rules` - All agent rules
  - `session.references` - All agent references  
  - `session.messages` - Complete conversation history
  - `session.agent` - Access to system prompt, tools, and agent configuration
  - Prepared `messages` array with embedded rules and references
- Supervision occurs right before model call with full context
- Sequential chaining of supervisors with message modifications

#### **Clean Interface Design**
- Removed redundant `MessageDirection` enum (direction implied by method called)
- Removed `metadata` hack field (proper typing instead)
- Simplified `processRequest(session: ChatSession, messages: ChatMessage[])` interface
- No redundant `sessionId` parameter (available via `session.id`)

#### **Structured Result Types**
- `RequestSupervisionResult` with explicit `'modify'` action notifications
- `ResponseSupervisionResult` for response supervision
- Clear separation between request and response processing
- Explicit modification notifications without payload comparison

## Supervision Tools Architecture

The supervision tools (used by agent-based supervisors) leverage a shared implementation architecture to avoid code duplication and ensure consistency.

### Shared Implementation Pattern

Each internal MCP client (`client-rules.ts`, `client-references.ts`, `client-tools.ts`) exports its implementation functions that can be reused by the supervision client:

- **Rules Management**: Export functions like `implementListRules`, `implementIncludeRule`, `implementExcludeRule`, etc.
- **References Management**: Export functions like `implementListReferences`, `implementIncludeReference`, etc.
- **Tools Management**: Export functions like `implementListTools`, `implementIncludeTool`, etc.

The supervision client (`client-supervision.ts`) imports these shared functions and calls them with the supervised agent/session context. This ensures that:

1. **No Code Duplication**: Implementation exists once in each specialized client
2. **Consistency**: Supervision tools behave identically to self-service tools
3. **Maintainability**: Bug fixes in one place automatically fix both contexts
4. **Domain Ownership**: Rule logic stays in `client-rules.ts`, reference logic in `client-references.ts`, tool logic in `client-tools.ts`

### Tool Parity

Supervised versions of tools (e.g., `supervised_listRules`, `supervised_includeRule`) behave identically to their self-service counterparts (e.g., `listRules`, `includeRule`), with the only difference being the context (supervised agent/session vs supervisor agent/session).

## Future Enhancements

Based on the original supervision.md specification, the following features remain to be implemented:

### **System Prompt Modification**
- **Status**: Not implemented
- **Gap**: No tools or API for supervisors to modify agent system prompt during runtime
- **Effort**: Medium - Requires new supervision tools

### **Multiple Message Testing**
- **Status**: Not implemented  
- **Gap**: No mechanism for supervisors to send multiple test messages
- **Effort**: High - Requires architectural changes to supervision flow

### **Multiple Response Options**
- **Status**: Not implemented
- **Gap**: No support for presenting multiple responses to users
- **Effort**: High - Requires changes to conversation flow and UI

### **Conversation Replay and Mutation**
- **Status**: Not implemented
- **Gap**: No replay or mutation testing capabilities
- **Effort**: High - Requires new testing infrastructure

### **Passive Observation Mode**
- **Status**: Not implemented
- **Gap**: Supervisors only work in real-time, no post-conversation analysis
- **Effort**: Medium - Requires post-processing analysis mode

### **Message Supervision Actions**
- **Status**: Partially implemented
- **Gap**: Tools defined but return placeholders (`supervised_block_message`, `supervised_modify_message`, `supervised_allow_message`, `supervised_request_human_review`)
- **Effort**: Medium - Requires changes to chat session runtime to intercept/modify/block messages

### **External System Integration**
- **Status**: Basic collection implemented
- **Gap**: No built-in support for external logging, monitoring, or data export
- **Effort**: Medium - Requires integration with logging/monitoring infrastructure
