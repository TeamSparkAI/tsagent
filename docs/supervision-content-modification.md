# Supervision Content Modification Design

## Overview

This document describes the unified approach to content modification in the supervision system, including how supervisors modify both simple request messages and complex multi-turn response structures.

## Core Principles

1. **Structured Results for Content**: Supervisors return structured results (`RequestSupervisionResult`, `ResponseSupervisionResult`) indicating their decisions (allow/modify/block) and providing modified content when applicable.

2. **Direct Modification for Context**: Context changes (rules, references, tools) are applied directly by supervision tools, as these are operational changes that need immediate effect.

3. **Request Simplification**: Supervisors only need to handle simple text modifications for request messages.

4. **Response Abstraction**: Supervisors can modify responses in two ways:
   - **Abstract Level**: Provide a summary or replacement text that replaces the entire response
   - **Structural Level**: (Future) Navigate and modify the complex multi-turn response structure

## Request Modification

### Structure
Request messages are simple text messages that supervisors can directly replace:

```typescript
interface ChatMessage {
  role: 'user' | 'system' | 'error';
  content: string;
}
```

### Flow
1. Supervisor receives full conversation context
2. Supervisor makes decision (allow/modify/block)
3. If modify: Supervisor provides new `content` string
4. `SupervisionManager` applies modification by replacing the message
5. Modified message proceeds to the agent

### Implementation in ChatSession
```typescript
// In ChatSession.handleMessage()
if (result.action === 'modify' && result.finalMessage) {
  message = result.finalMessage;
  messages[messages.length - 1] = result.finalMessage;
}
```

## Response Modification

### Challenge
Response messages have a complex multi-turn structure:

```typescript
interface ChatMessage {
  role: 'assistant';
  modelReply: ModelReply;
}

interface ModelReply {
  timestamp: number;
  turns: {
    message?: string;
    inputTokens?: number;
    outputTokens?: number;
    toolCalls?: ToolCallResult[];
    error?: string;
  }[];
  pendingToolCalls?: ToolCallRequest[];
}
```

### Solution: Two-Level Modification

#### Level 1: Abstract Modification (Current Implementation)
Supervisors can provide a simple text replacement that replaces the entire response:

```typescript
// Supervisor returns:
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

**When to Use:**
- Simplifying complex responses
- Removing inappropriate content
- Converting multi-turn to single turn
- Adding explanations or context

**Advantages:**
- Simple for supervisors to implement
- Works for most use cases
- Supervisor doesn't need to understand internal structure

#### Level 2: Structural Modification (Future Enhancement)
For fine-grained control, supervisors could navigate and modify specific turns:

```typescript
interface StructuralModification {
  type: 'remove_turn' | 'modify_turn' | 'add_turn' | 'reorder_turns';
  turnIndex?: number;
  newContent?: string;
  // ... other fields
}
```

**When to Use:**
- Preserving tool call results while modifying text
- Removing specific turns but keeping others
- Complex surgical edits to specific response parts

**Trade-offs:**
- More complex for supervisors to implement
- Requires understanding of response structure
- More powerful but harder to use

### Current Implementation Strategy

**For Traditional Supervisors:**
- Use structured results approach
- Implement `processResponse()` to return modified `MessageUpdate`
- Supervisor constructs the replacement response structure

**For Agent Supervisors:**
- Agent receives simplified version of response for analysis:
  - Single concatenated string of all message content
  - Tool calls listed separately as metadata
  - Summary statistics (turn count, has tools, etc.)
- Agent returns either:
  - Simple text replacement (most common)
  - Structured modification commands (future)

## Implementation Details

### Supervision Manager Flow

```typescript
async processRequest(session: ChatSession, messages: ChatMessage[]): Promise<RequestSupervisionResult> {
  const supervisors = this.getSessionSupervisors(session.id);
  let currentMessages = [...messages];
  
  for (const supervisor of supervisors) {
    const result = await supervisor.processRequest(session, currentMessages);
    
    if (result.action === 'block') return result;
    
    // Apply modification
    if (result.action === 'modify' && result.finalMessage) {
      currentMessages[currentMessages.length - 1] = result.finalMessage;
    }
  }
  
  return {
    action: currentMessages !== messages ? 'modify' : 'allow',
    finalMessage: currentMessages[currentMessages.length - 1]
  };
}

async processResponse(session: ChatSession, response: MessageUpdate): Promise<ResponseSupervisionResult> {
  const supervisors = this.getSessionSupervisors(session.id);
  let processedResponse = response;
  
  for (const supervisor of supervisors) {
    const result = await supervisor.processResponse(session, processedResponse);
    
    if (result.action === 'block') return result;
    
    // Apply modification
    if (result.action === 'modify' && result.finalResponse) {
      processedResponse = result.finalResponse;
    }
  }
  
  return {
    action: 'allow',
    finalResponse: processedResponse
  };
}
```

### Agent Supervisor Context Building

```typescript
private buildSupervisorContext(session: ChatSession, messages: ChatMessage[], direction: 'request' | 'response'): any {
  const lastMessage = messages[messages.length - 1];
  let content = '';
  let metadata: any = {};
  
  if (direction === 'response') {
    // For responses, extract content and provide metadata
    if (typeof lastMessage === 'object' && lastMessage.role === 'assistant') {
      // Concatenate all message content
      content = lastMessage.modelReply?.turns
        .map(t => t.message || '')
        .join('\n') || '';
      
      // Add structured metadata
      metadata = {
        turnCount: lastMessage.modelReply?.turns.length || 0,
        hasToolCalls: lastMessage.modelReply?.turns.some(t => t.toolCalls?.length > 0),
        hasPendingTools: !!lastMessage.modelReply?.pendingToolCalls?.length,
        toolCalls: lastMessage.modelReply?.turns
          .flatMap(t => t.toolCalls || [])
          .map(tc => ({ name: tc.toolName, server: tc.serverName }))
      };
    }
  } else {
    // For requests, simple content extraction
    content = typeof lastMessage === 'string' 
      ? lastMessage 
      : lastMessage.content;
  }
  
  return {
    systemPrompt: this.config.systemPrompt,
    messages: [{ role: direction === 'request' ? 'user' : 'assistant', content }],
    metadata
  };
}
```

### Agent Supervisor: Shared State Approach

Instead of parsing tool calls from the supervisor agent's response, we use a shared state object that supervision tools can mutate directly. This approach is cleaner and doesn't require complex parsing.

```typescript
// Shared state object injected into supervision client
interface SupervisionState {
  decision: 'allow' | 'modify' | 'block' | null;
  reasons: string[];
  
  // For request modification
  modifiedRequestContent?: string;
  
  // For response modification
  modifiedResponseContent?: string;
  
  // Context modifications (applied immediately)
  contextChanges: {
    addedRules: string[];
    removedRules: string[];
    addedReferences: string[];
    removedReferences: string[];
    addedTools: Array<{serverName: string, toolName: string}>;
    removedTools: Array<{serverName: string, toolName: string}>;
  };
}
```

The supervision client receives this state object and tools mutate it directly:

```typescript
class McpClientInternalSupervision implements McpClient {
  private supervisionState: SupervisionState;
  
  setSupervisionState(state: SupervisionState): void {
    this.supervisionState = state;
  }
  
  setSupervisedSession(session: ChatSession): void {
    this.supervisedSession = session;
  }
  
  private blockMessage(reason: string): any {
    this.supervisionState.decision = 'block';
    this.supervisionState.reasons.push(reason);
    return { success: true, message: "Message blocked", reason };
  }
  
  private modifyMessage(content: string, reason: string): any {
    this.supervisionState.decision = 'modify';
    this.supervisionState.modifiedRequestContent = content;
    this.supervisionState.reasons.push(reason);
    return { success: true, message: "Message modified", reason };
  }
  
  private modifyResponse(content: string, reason: string): any {
    this.supervisionState.decision = 'modify';
    this.supervisionState.modifiedResponseContent = content;
    this.supervisionState.reasons.push(reason);
    return { success: true, message: "Response modified", reason };
  }
  
  private includeRule(name: string): any {
    // Apply context change directly
    this.supervisedSession?.addRule(name);
    this.supervisionState.contextChanges.addedRules.push(name);
    return `Rule "${name}" added to session`;
  }
  // ... etc
}
```

The AgentSupervisor creates the state object, passes it to the supervision client, and then extracts the decision:

```typescript
class AgentSupervisor {
  async processRequest(session: ChatSession, messages: ChatMessage[]): Promise<RequestSupervisionResult> {
    // Create shared state
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
    
    // Build context for supervisor agent
    const context = this.buildSupervisorContext(session, messages, 'request');
    
    // Create supervisor session
    const supervisorSession = this.agent.createChatSession(`supervisor-${session.id}`);
    
    // Get supervision client and inject both session and state
    const supervisionClient = await this.agent.getMcpClient('supervision');
    if (supervisionClient) {
      (supervisionClient as any).setSupervisedSession(session);
      (supervisionClient as any).setSupervisionState(state);
    }
    
    // Call supervisor agent - its tools will mutate the state object
    await supervisorSession.handleMessage(context.messages[0]);
    
    // Extract decision from state
    if (state.decision === 'block') {
      return {
        action: 'block',
        reasons: state.reasons
      };
    }
    
    if (state.decision === 'modify' && state.modifiedRequestContent) {
      return {
        action: 'modify',
        finalMessage: {
          role: 'user',
          content: state.modifiedRequestContent
        },
        reasons: state.reasons
      };
    }
    
    return { action: 'allow' };
  }
  
  async processResponse(session: ChatSession, response: MessageUpdate): Promise<ResponseSupervisionResult> {
    // Same pattern for response processing
    const state: SupervisionState = { /* ... */ };
    
    // ... setup supervisor agent ...
    
    // Extract decision and construct modified response
    if (state.decision === 'block') {
      return {
        action: 'block',
        reasons: state.reasons
      };
    }
    
    if (state.decision === 'modify' && state.modifiedResponseContent) {
      // Construct the complex response structure
      const assistantMessage = response.updates.find(m => 
        typeof m !== 'string' && m.role === 'assistant'
      );
      
      return {
        action: 'modify',
        finalResponse: {
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
        },
        reasons: state.reasons
      };
    }
    
    return { action: 'allow' };
  }
}
```

**Key Benefits:**
1. **No parsing needed** - Tools directly mutate shared state; no inspection of supervisor agent responses
2. **Type-safe** - State object has enforced structure
3. **Natural tool usage** - Supervisor agent treats supervision tools like any other tools; results are tracked in state
4. **Clean separation** - Context changes applied immediately, content changes extracted later

## Context Modifications

Context modifications (rules, references, tools) are applied directly via supervision tools:

```typescript
// In client-supervision.ts
private async implementIncludeRule(agent: Agent, session: ChatSession, args: any) {
  // Directly modify the session
  session.addRule(args.name);
  return `Rule "${args.name}" added to session`;
}
```

These don't go through the structured result flow because they:
- Are operational changes, not content changes
- Need immediate effect
- Don't need aggregation across supervisors

## Examples

### Example 1: Simple Request Modification
**Scenario**: Guardian supervisor sanitizes user input

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

### Example 2: Response Summarization
**Scenario**: Architect supervisor simplifies verbose responses

```typescript
async processResponse(session: ChatSession, response: MessageUpdate): Promise<ResponseSupervisionResult> {
  const assistantMessage = response.updates.find(m => 
    typeof m !== 'string' && m.role === 'assistant'
  );
  
  if (assistantMessage && 'modelReply' in assistantMessage) {
    const fullContent = assistantMessage.modelReply.turns
      .map(t => t.message)
      .join('\n');
    
    if (fullContent.length > 500) {
      // Too verbose, summarize
      const summary = await this.summarize(fullContent);
      
      return {
        action: 'modify',
        finalResponse: {
          ...response,
          updates: [{
            role: 'assistant',
            modelReply: {
              timestamp: Date.now(),
              turns: [{ message: summary }]
            }
          }]
        },
        reasons: ['Response summarized for clarity']
      };
    }
  }
  
  return { action: 'allow' };
}
```

### Example 3: Agent Supervisor Modification
**Scenario**: Agent supervisor uses tools to modify response

```python
# Supervisor agent's internal reasoning:
"The response is too technical. I should use supervised_modify_response 
to provide a simpler explanation."

Tool: supervised_modify_response
  content: "In simple terms, when you click the button, the app sends a 
           request to the server to get your data."
  reason: "Simplified technical explanation for better user understanding"
```

The AgentSupervisor parses this and constructs the modified response structure automatically.

## Implementation Status

### Completed ✅
- **Shared State Infrastructure**: `SupervisionState` interface defined and integrated
- **Supervision Client**: Updated to accept and mutate shared state  
- **Content Modification Tools**: Tools now update shared state instead of modifying session directly
- **AgentSupervisor**: Fully implemented with shared state approach
- **Removed Stub Code**: Deleted `parseSupervisorResponse` and `applyModifications` methods
- **Traditional Supervisors**: Already working correctly with structured results

### Remaining Work

#### High Priority
1. **Testing**: 
   - Create test cases for agent supervisor with various scenarios
   - Test block, modify, and allow decisions
   - Test context modifications (rules, references, tools)
   - Test both request and response supervision

2. **Error Handling**:
   - Add try-catch blocks in `AgentSupervisor.processRequest` and `processResponse`
   - Handle cases where supervision client is not available
   - Handle cases where supervisor agent fails
   - Fall back to allowing message if supervision fails

3. **Logging**:
   - Add detailed logging for supervision decisions
   - Log when state is modified by tools
   - Log final decisions extracted from state
   - Log reasons for modifications/blocks

#### Medium Priority
4. **Documentation**:
   - Update supervisor agent documentation with examples
   - Document how to create a supervisor agent
   - Provide examples of tool usage in supervisor agents
   - Document the decision flow

5. **Context Modifications Tracking**:
   - Currently context modifications are recorded in state but not applied
   - Consider if we need to track these for audit/logging purposes
   - Document that context tools still apply directly (as intended)

#### Low Priority
6. **Performance Optimization**:
   - Consider caching supervisor agent sessions
   - Optimize state object creation
   - Consider batching multiple modifications

7. **Enhanced Error Messages**:
   - Provide more detailed error messages when supervision fails
   - Include context about which tool caused failures
   - Include information about supervisor agent configuration

## Future Enhancements

1. **Structural Response Modification**: Allow fine-grained editing of multi-turn responses
2. **Partial Modifications**: Modify specific turns without replacing entire response
3. **Modification Suggestions**: Supervisor suggests modifications that require user approval
4. **Version History**: Track all modifications made to a conversation
5. **A/B Testing**: Compare different supervisor strategies

## Conclusion

This design provides a clean separation between:
- **Content modifications** (structured, aggregated, visible)
- **Context modifications** (direct, immediate, operational)

The approach handles both simple request messages and complex multi-turn responses while keeping the supervisor agent's implementation simple and understandable.
