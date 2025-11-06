# Context Tracking Design

## Overview

This document describes the design for tracking context (rules, references, and tools) used in chat sessions and requests. The system tracks how context items enter the session and how they're selected for each request, enabling transparency and debugging.

## Context Hierarchy

Context items exist at three levels, flowing from agent configuration to session to individual requests:

### 1. Agent Level (Available Context)

The agent defines a full set of context items (rules, references, and tools) that are **available** to chat sessions. Each item has an `include` mode:

- **`always`**: Item is automatically added to session context when a new session is created
- **`manual`**: Item can be manually added to session context by the user
- **`agent`**: Item is available for agent-controlled inclusion (via mechanisms including semantic search) on a per-request basis

**For Tools**: There's an additional layer of configuration:
- **Server-level include mode**: Default include mode for all tools in an MCP server
- **Tool-level include mode**: Can override the server default for individual tools
- The effective include mode for a tool is determined by: tool-level setting (if present) → server-level default → `always`

**Agent level items are the source of truth** - they define what's available, and what's placed into new sessions automatically.

### 2. Session Level (Session Context)

The session context consists of items that are **actively included** in the chat session:

- **Items with `include: 'always'`**: Automatically added when the session is created
- **Manually manipulated items**: Any item can be manually added (if it is not already in the session context) or removed (if it is in the session context), regardless of its include mode

Session context persists across requests and only change when they are explicitly changed.

### 3. Request Level (Request Context)

The request context represents the context items **actually used** for a specific request/response pair:

- **All session context items**: Everything in the session context is included in the request context
- **Agent items**: Items with `include: 'agent'` that are NOT in session context, but are determined to be relevant to the current request via semantic search

Request context is **built fresh for each request** by combining:
1. Current session context
2. Agent items selected via semantic search (determined per-request)

**Request context is a superset of session context** - it includes everything in session context, plus any agent items selected via semantic search for that specific request.

### Flow Example

```
Agent Level:
  - Rule A (include: 'always')
  - Rule B (include: 'manual')
  - Rule C (include: 'agent')
  - Reference X (include: 'always')
  - Reference Y (include: 'agent')

Session Creation:
  Session Context:
    - Rule A (added automatically - 'always')
    - Reference X (added automatically - 'always')
    - Rule B (added manually by user)
    → Session context now has: [A, X, B]

Request 1 (user: "How do I authenticate?"):
  Request Context:
    - Rule A (from session - 'always')
    - Reference X (from session - 'always')
    - Rule B (from session - 'manual')
    - Rule C (included via agent - similarity: 0.92)
    → Request context: [A, X, B, C]

Request 2 (user: "What's the error handling?"):
  Request Context:
    - Rule A (from session - 'always')
    - Reference X (from session - 'always')
    - Rule B (from session - 'manual')
    - Reference Y (included via agent - similarity: 0.87)
    → Request context: [A, X, B, Y]
    (Note: Rule C not included via agent this time)
```

## Goals

1. **Session Context Tracking**: Track how items entered the session context (always vs manual)
2. **Request Context Recording**: Record what context was actually used for each request/response pair, including how each item was included (always, manual, or agent) and semantic search details (e.g., similarity score) when items are included via agent mode
3. **Historical Transparency**: Users can see what context was used for any historical message
4. **Build from Context**: Use request context object to build actual LLM requests

## Key Concepts

### Include Modes

In the context tracking system, we track how items were included:

- **`always`**: Item has `include: 'always'` mode - automatically added to session on creation
- **`manual`**: Item was manually added to session by user (regardless of its include mode)
- **`agent`**: Item was included via semantic search for this specific request (must have `include: 'agent'` and not be in session context)

## Data Structures

### Base Context Item

Discriminated union for type-safe context items:

```typescript
// Base discriminated union - ensures type safety
export type ContextItemBase = 
  | { type: 'rule'; name: string }
  | { type: 'reference'; name: string }
  | { type: 'tool'; name: string; serverName: string };  // serverName required for tools
```

### Session Context Item

Session context items extend the base with session include modes:

```typescript
// Session context item - base + session include modes only
export type SessionContextItem = ContextItemBase & {
  includeMode: 'always' | 'manual';
}
```

### Request Context Item

Request context items extend the base with all include modes and optional similarity score:

```typescript
// Request context item - extends base with all include modes + optional score
export type RequestContextItem = ContextItemBase & {
  includeMode: 'always' | 'manual' | 'agent';
  similarityScore?: number;  // Optional, typically present when includeMode is 'agent'
}

export class ChatSessionImpl {
  // Replace simple arrays with tracked context items
  contextItems: SessionContextItem[] = [];
  
  // Note: Backward-compatible getters were removed
  // All consumers now use contextItems directly
}
```

### Request Context

Request context built from session context + agent items:

```typescript
export interface RequestContext {
  items: RequestContextItem[];  // All items used for this request (session + agent items)
}

// Attached to assistant messages
export type ChatMessage = {
  role: 'user' | 'system' | 'error';
  content: string;
} | {
  role: 'approval';
  toolCallApprovals: ToolCallApproval[];
} | {
  role: 'assistant';
  modelReply: ModelReply;
  requestContext?: RequestContext;  // Context used for this request/response pair
};
```

## Implementation

### 1. Session Context Management

When items are added to session, track include mode:

```typescript
// In ChatSession
addRule(ruleName: string, method: 'always' | 'manual' = 'manual'): void {
  if (!this.contextItems.some(item => item.type === 'rule' && item.name === ruleName)) {
    this.contextItems.push({
      name: ruleName,
      type: 'rule',
      includeMode: method,
    });
  }
}

addReference(referenceName: string, method: 'always' | 'manual' = 'manual'): void {
  if (!this.contextItems.some(item => item.type === 'reference' && item.name === referenceName)) {
    this.contextItems.push({
      name: referenceName,
      type: 'reference',
      includeMode: method,
    });
  }
}

async addTool(serverName: string, toolName: string, method: 'always' | 'manual' = 'manual'): Promise<boolean> {
  // Validate tool exists...
  
  if (!this.contextItems.some(item => 
    item.type === 'tool' && 
    item.name === toolName && 
    item.serverName === serverName
  )) {
    this.contextItems.push({
      name: toolName,
      type: 'tool',
      serverName: serverName,
      includeMode: method,
    });
  }
  return true;
}
```

### 2. Initializing Session Context

When session is created, add 'always' items with selection method:

```typescript
private initializeAlwaysIncludeTools(): void {
  // ... existing logic ...
  
  for (const tool of client.serverTools) {
    if (getToolEffectiveIncludeMode(serverConfig as any, tool.name) === 'always') {
      this.addTool(serverName, tool.name, 'always');  // Explicitly mark as 'always'
    }
  }
}

// Similar for rules and references
for (const rule of this.agent.getAllRules()) {
  if (rule.include === 'always') {
    this.addRule(rule.name, 'always');
  }
}
```

### 3. Building Request Context

Build request context from session context + agent items:

```typescript
// In ChatSessionImpl (method on the session instance)
private async buildRequestContext(
  userMessage: string
): Promise<RequestContext> {
  const requestItems: RequestContextItem[] = [];
  
  // Step 1: Add all session context items (always + manual)
  for (const sessionItem of this.contextItems) {
    // Convert SessionContextItem to RequestContextItem
    if (sessionItem.type === 'tool') {
      requestItems.push({
        type: 'tool',
        name: sessionItem.name,
        serverName: sessionItem.serverName,
        includeMode: sessionItem.includeMode,
      });
    } else {
      requestItems.push({
        type: sessionItem.type,
        name: sessionItem.name,
        includeMode: sessionItem.includeMode,
      });
    }
  }
  
  // Step 2: For Phase 3, we don't include agent mode items yet
  // This will be added in Phase 5 with semantic search
  
  return {
    items: requestItems,
  };
}

// Helper function to get agent mode items (prepared for semantic search integration)
private getAgentModeItems(): RequestContextItem[] {
  const items: RequestContextItem[] = [];
  
  // Get rules with include: 'agent'
  for (const rule of this.agent.getAllRules()) {
    if (rule.include === 'agent' && rule.enabled) {
      // Check if not already in session
      const inSession = this.contextItems.some(
        item => item.type === 'rule' && item.name === rule.name
      );
      if (!inSession) {
        items.push({
          name: rule.name,
          type: 'rule',
          includeMode: 'agent',  // Will be included via semantic search
        });
      }
    }
  }
  
  // Get references with include: 'agent'
  for (const reference of this.agent.getAllReferences()) {
    if (reference.include === 'agent' && reference.enabled) {
      // Check if not already in session
      const inSession = this.contextItems.some(
        item => item.type === 'reference' && item.name === reference.name
      );
      if (!inSession) {
        items.push({
          name: reference.name,
          type: 'reference',
          includeMode: 'agent',  // Will be included via semantic search
        });
      }
    }
  }
  
  // Get tools with include: 'agent'
  const mcpClients = this.agent.getAllMcpClientsSync();
  for (const [serverName, client] of Object.entries(mcpClients)) {
    const serverConfig = this.agent.getMcpServer(serverName)?.config;
    if (!serverConfig) continue;
    
    for (const tool of client.serverTools) {
      const effectiveMode = getToolEffectiveIncludeMode(serverConfig, tool.name);
      if (effectiveMode === 'agent') {
        const inSession = this.contextItems.some(
          item => item.type === 'tool' && 
                  item.name === tool.name && 
                  item.serverName === serverName
        );
        if (!inSession) {
          items.push({
            name: tool.name,
            type: 'tool',
            serverName: serverName,
            includeMode: 'agent',
          });
        }
      }
    }
  }
  
  return items;
}
```

### 4. Using Request Context to Build LLM Messages

The request context is used to build the actual messages array sent to the LLM. This ensures that what's recorded in the request context is exactly what was used:

```typescript
// In ChatSessionImpl.handleMessage()
// After building request context, use it to construct messages array
const requestContext = await this.buildRequestContext(userMessageContent);

// Build messages array, starting with system prompt and existing non-system messages
const systemPrompt = await this.agent.getSystemPrompt();
const messages: ChatMessage[] = [
  { role: 'system', content: systemPrompt },
  ...this.messages.filter(m => m.role !== 'system')
];

// Add the references to the messages array (from request context)
for (const item of requestContext.items) {
  if (item.type === 'reference') {
    const reference = this.agent.getReference(item.name);
    if (reference) {
      messages.push({
        role: 'user',
        content: `Reference: ${reference.text}`
      }); 
    }
  }
}

// Add the rules to the messages array (from request context)
for (const item of requestContext.items) {
  if (item.type === 'rule') {
    const rule = this.agent.getRule(item.name);
    if (rule) {
      messages.push({
        role: 'user',
        content: `Rule: ${rule.text}`
      });
    }
  }
}

// Add the user message to the messages array
messages.push(message);

// Tools from request context are handled via ProviderHelper.getIncludedTools()
// which uses the session's getIncludedTools() method that derives from contextItems
```

### 5. Attaching Request Context to Response

Store request context with assistant message:

```typescript
// In ChatSessionImpl.handleMessage()
// After generating response, attach request context to assistant message
const replyMessage: ChatMessage = {
  role: 'assistant' as const,
  modelReply: modelResponse,
  requestContext: requestContext  // Attach the context used for this request/response pair
};

this.messages.push(replyMessage);
this.lastSyncId++;

// Return MessageUpdate with the assistant message (which includes requestContext)
return {
  updates: [message, replyMessage],
  lastSyncId: this.lastSyncId,
};
```

## Key Design Decisions

### 1. Store References, Not Objects

- Session and request context store only names/identifiers, not full objects
- Actual items are looked up from Agent when needed: `agent.getRule(ruleName)`
- This keeps context lightweight and avoids storing stale objects
- Historical messages still reference items by name (items may have changed, but reference is preserved)

### 2. Single Array Structure

- Use single `RequestContextItem[]` array with `type` field, rather than separate arrays
- Simplifies iteration and filtering
- Makes it easy to process all context items uniformly

### 3. Selection Method Per Item

- Each context item knows how it was selected
- Enables transparency: users can see why each item was included
- Helps debug semantic search effectiveness

### 4. Request Context on Assistant Message

- Store request context with the assistant message (response)
- Represents the context used to generate that response
- One context per request/response pair (not separate for request and response)

### 5. Build from Request Context

- Actual LLM request is built from `RequestContext` object
- Ensures consistency: what's recorded is what was used
- Makes it easy to reconstruct what was sent to the LLM

## Use Cases

### API User

- See which context items were included in each turn
- Understand why each item was included (always/manual/agent)
- Debug why certain items weren't included
- Track semantic selection quality over time
- Rebuild requests from stored context

### End User (UX)

- View context details for any message/turn
- See which items were auto-selected vs manually added
- View semantic search results (which items were found relevant)
- Verify that semantic search is working as expected
- Understand what context the agent had access to

## UX Display

### Request Context Modal

Request context is displayed on-demand via a modal dialog accessible from assistant messages:

**Access**:
- Context menu option or button on assistant messages
- Only visible on messages that have `requestContext` attached
- Opens modal to display request context

**Modal Layout**:
- Three-column layout matching the context panel design
- Each column shows one type: Rules, References, Tools
- Read-only view (no "Manage" buttons or add/remove functionality)

**Item Display**:
- Include mode badges: "Always", "Manual", "Agent"
- Item name
- Similarity score (for agent mode items, when semantic search is enabled)
- Item description/tooltip

**Example Display**:
```
Rules Column:
  • Authentication Rules [Always]
  • Error Handling [Manual]
  • File Operations [Agent - 0.87]

References Column:
  • API Documentation [Always]
  • Database Schema [Agent - 0.92]

Tools Column:
  • filesystem:read_file [Manual]
  • database:query [Agent - 0.85]
```

## Backward Compatibility

- `requestContext` field is optional on `ChatMessage` (assistant messages only)
- Messages without `requestContext` show "No context data available" in the modal
- **Note**: Backward-compatible arrays (`rules`, `references`, `tools`) were removed from `ChatState` in favor of `contextItems`
- All consumers (desktop app, CLI, MCP clients) were updated to use `contextItems` directly

## Future Considerations

### Persistent Storage

- Request context stored with messages enables historical analysis
- Could export context data for analytics
- Could use to train/improve semantic search

### Context Optimization

- Track which context items are actually used (referenced in response)
- Optimize context selection based on usage patterns
- Suggest removing unused items from session

### Context Sharing

- Share request contexts between similar queries
- Cache effective context combinations
- Learn from successful context selections

