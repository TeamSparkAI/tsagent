# Context Management System

## Overview

The context management system tracks rules, references, and tools used in chat sessions and requests. It provides a three-layer hierarchy (Agent → Session → Request) that enables transparency about how context items are included and used. The system integrates semantic search to automatically select relevant context items for each request.

## Context Hierarchy

Context items flow through three levels, from agent configuration to individual requests:

### 1. Agent Level (Available Context)

The agent defines a full set of context items (rules, references, and tools) that are **available** to chat sessions. Each item has an `include` mode:

- **`always`**: Item is automatically added to session context when a new session is created
- **`manual`**: Item can be manually added to session context by the user
- **`agent`**: Item is available for agent-controlled inclusion via semantic search on a per-request basis

**For Tools**: There's an additional layer of configuration:
- **Server-level include mode**: Default include mode for all tools in an MCP server
- **Tool-level include mode**: Can override the server default for individual tools
- The effective include mode for a tool is determined by: tool-level setting (if present) → server-level default → `always`

**Agent level items are the source of truth** - they define what's available, and what's placed into new sessions automatically.

### 2. Session Level (Session Context)

The session context consists of items that are **actively included** in the chat session:

- **Items with `include: 'always'`**: Automatically added when the session is created
- **Manually manipulated items**: Any item can be manually added (if it is not already in the session context) or removed (if it is in the session context), regardless of its include mode

Session context persists across requests and only changes when explicitly modified.

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

## Include Modes

The system tracks how items were included at each level:

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

### Chat State

The session state includes all active context items:

```typescript
export interface ChatState {
  messages: ChatMessage[];
  lastSyncId: number;
  currentModelProvider?: ProviderType;
  currentModelId?: string;
  contextItems: SessionContextItem[];  // Tracked context items with include modes
  maxChatTurns: number;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  toolPermission: SessionToolPermission;
}
```

## How It Works

### Session Context Management

When items are added to a session, their include mode is tracked:

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
```

When a session is created, items with `include: 'always'` are automatically added with `includeMode: 'always'`.

### Building Request Context

Request context is built for each request by combining session context and agent-selected items:

```typescript
// In ChatSessionImpl
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
  
  // Step 2: Add agent mode items via semantic search (if available)
  const agentModeItems = this.getAgentModeItems();
  if (agentModeItems.length > 0) {
    try {
      // Use semantic search to select relevant agent mode items
      const searchResults = await this.agent.searchContextItems(
        userMessage,
        agentModeItems.map(item => ({
          type: item.type,
          name: item.name,
          serverName: item.serverName,
          includeMode: 'always' as const,  // Placeholder - search doesn't use includeMode
        })),
        {
          topK: 20,  // Consider top 20 chunk matches
          topN: 5,   // Return top 5 items after grouping
          includeScore: 0.7,  // Always include items with score >= 0.7
        }
      );
      
      // Add agent-selected items to request context
      requestItems.push(...searchResults);
    } catch (error) {
      // Semantic search is optional - if it fails, continue without agent items
      this.logger?.warn('Semantic search failed, continuing without agent mode items', error);
    }
  }
  
  return {
    items: requestItems,
  };
}
```

### Using Request Context to Build LLM Messages

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

### Attaching Request Context to Response

Request context is stored with the assistant message:

```typescript
// In ChatSessionImpl.handleMessage()
// After generating response, attach request context to assistant message
const replyMessage: ChatMessage = {
  role: 'assistant' as const,
  modelReply: modelResponse,
  requestContext: requestContext  // Attach the context used for this request/response pair
};

this.messages.push(replyMessage);
```

## Semantic Search Integration

The context system integrates with semantic search to automatically select relevant agent mode items for each request.

### Overview

Semantic search uses local embeddings to determine which context items are most relevant to a user's query. This allows the agent to operate on only the relevant context rather than overwhelming the LLM with all available items.

**Important**: The "tools" discussed here refer to **MCP tools available to the agent** (from installed MCP clients/servers), not tools exported by the agent (AgentTool definitions used in Tools mode agents).

### Architecture

The semantic indexing system uses the `SemanticIndexer` class (located in `packages/agent-api/src/managers/semantic-indexer.ts`). The indexer provides:

- **Local Embeddings**: Uses `@xenova/transformers` with `Xenova/all-MiniLM-L6-v2` model (~80MB, quantized)
- **Chunking**: Splits long text into semantically coherent chunks (~500 chars max)
- **Cosine Similarity**: Brute-force vector similarity search for relevance scoring
- **Context-Item-Centric Design**: Works directly with `SessionContextItem[]` and `RequestContextItem[]` types

### Agent Interface

The `Agent` interface provides a `searchContextItems()` method:

```typescript
async searchContextItems(
  query: string,
  items: SessionContextItem[],
  options?: {
    topK?: number;  // Max embedding matches to consider (default: 20)
    topN?: number;  // Target number of results to return after grouping (default: 5)
    includeScore?: number;  // Always include items with this score or higher (default: 0.7)
  }
): Promise<RequestContextItem[]>
```

The `SemanticIndexer` is a private, lazy-initialized member of `AgentImpl`. It is accessed only through the public `searchContextItems()` method on the `Agent` interface.

### Indexing Strategy

#### Content Format

Items are indexed with the following format:

- **Rules**: `name: description\n\ntext` (if description exists, otherwise just `name\n\ntext`)
- **References**: `name: description\n\ntext` (if description exists, otherwise just `name\n\ntext`)
- **Tools**: `name: description` (if description exists, otherwise just `name`)

The combined text is then chunked using a semantic-aware strategy:
1. Split by paragraphs first
2. If a paragraph exceeds 500 chars, split by sentences
3. Combine sentences up to ~500 chars per chunk

#### Embedding Storage

**Rules and References**:
Each item (Rule, Reference) can store embeddings directly:

```typescript
interface IndexedChunk {
  text: string;
  embedding: number[];  // 384-dimensional vector
  chunkIndex: number;
}

interface Rule {
  // ... existing fields
  embeddings?: IndexedChunk[];  // JIT-generated embeddings
}

interface Reference {
  // ... existing fields
  embeddings?: IndexedChunk[];  // JIT-generated embeddings
}
```

**MCP Tools**:
MCP tools are accessed via `McpClient` instances, and embeddings are stored on the client:

```typescript
export interface McpClient {
  serverVersion: { name: string; version: string } | null;
  serverTools: Tool[];
  toolEmbeddings?: Map<string, IndexedChunk[]>;  // Key: toolName, Value: embeddings
  // ... other methods
}
```

This structure:
- Keeps embeddings with the tool management structure (on the client where tools live)
- Preserves the natural relationship: `client` → `serverTools` → `toolEmbeddings`
- Makes it easy to get all tools from a server with their embeddings

### JIT (Just-In-Time) Indexing

Embeddings are generated **on-demand** when needed for semantic search, not upfront during agent loading. This defers the cost until semantic context selection is actually used.

**Implementation**:

1. **On Semantic Search Request**:
   - The `searchContextItems()` method internally calls `indexContextItems()` to ensure all items are indexed
   - `indexContextItems()` iterates through `SessionContextItem[]` and checks for missing embeddings:
     - **Rules/References**: `if (!item.embeddings) { generate }`
     - **Tools**: `if (!client.toolEmbeddings?.has(tool.name)) { generate }`
   - For items missing embeddings, generate them (batch all missing items together)
   - Store embeddings:
     - Rules/References: `item.embeddings = chunks`
     - Tools: `client.toolEmbeddings.set(tool.name, chunks)`

2. **On Item Update**:
   - **Rules/References**: Clear embeddings: `item.embeddings = undefined`
   - **Tools**: Not applicable - tools don't change after MCP clients are loaded
   - Embeddings will be regenerated on next semantic search

**Benefits**:
- **No Upfront Cost**: Agent loading doesn't pay the embedding generation penalty
- **Incremental Updates**: Only re-index items that have changed
- **Better for Unused Features**: Agents that don't use semantic search pay no cost

**Performance Characteristics**:
- **Model Initialization**: ~100ms (one-time, cached after first use)
- **Indexing**: ~690ms for 151 chunks (~4.5ms per chunk)
- **Inference (Search)**: ~10ms per 100 documents in the index (very fast)

For a typical agent with 100 context items:
- **First Semantic Search**: ~800ms (if all items need indexing)
- **Subsequent Searches**: ~10ms (using cached embeddings)

### Search Implementation

When performing semantic search:

1. **JIT Indexing**: The `searchContextItems()` method internally calls `indexContextItems()` to ensure all items in the provided `SessionContextItem[]` are indexed before searching

2. **Collect All Chunks**: Gather all chunks from indexed items with their metadata
   - **Rules/References**: Iterate `item.embeddings` for each item
   - **Tools**: Iterate clients → iterate `client.serverTools` → get embeddings from `client.toolEmbeddings?.get(tool.name)`
   - Store metadata with each chunk: `{ item: SessionContextItem, chunkIndex, text, embedding }`

3. **Generate Query Embedding**: Embed the user query using the same model

4. **Calculate Similarity**: Cosine similarity between query embedding and all collected chunks

5. **Rank and Filter Results**:
   - Sort by similarity score (descending)
   - Take top `topK` chunk matches (default: 20)
   - Group by item (using type + name + serverName for tools), keep best score per item
   - Apply `includeScore` threshold: always include items with score >= `includeScore` (default: 0.7)
   - Limit remaining results to `topN` items (default: 5), but high-score items can exceed `topN`

6. **Return Results**: Convert to `RequestContextItem[]` with `includeMode: 'agent'` and `similarityScore` attached

### Search Parameters

The `searchContextItems()` method accepts optional search parameters:

- **`topK`** (default: 20): Max embedding chunk matches to consider before grouping by item
- **`topN`** (default: 5): Target number of results to return after grouping by item
- **`includeScore`** (default: 0.7): Always include items with this similarity score or higher, even if it exceeds `topN`

These parameters allow fine-tuning of semantic search behavior:
- Higher `topK` considers more chunk matches (more thorough but slower)
- Higher `topN` returns more items (larger context but more tokens)
- Higher `includeScore` includes more high-confidence matches (can exceed `topN`)

### Integration with Include Modes

The semantic indexing system integrates with existing include modes:

- **`always`**: Always included, no semantic search needed
- **`manual`**: Explicitly included/removed by user, no semantic search needed
- **`agent`**: Dynamically included based on semantic relevance

### Model Management

The embedding model (`Xenova/all-MiniLM-L6-v2`) is:
- **Lazy Loaded**: Only loaded when first semantic search is requested
- **Shared**: Single model instance shared across all embeddings for the agent
- **Cached**: Model is cached by `@xenova/transformers` in `~/.cache/transformers` (or `TRANSFORMERS_CACHE` env var)
- **Native Modules**: Uses `onnxruntime-node` for Node.js environments (Electron main process)

## UX Display

### Request Context Modal

Request context is displayed on-demand via a modal dialog accessible from assistant messages in the desktop app.

**Access**:
- "View Context" button on assistant messages
- Only visible on messages that have `requestContext` attached
- Opens modal to display request context
- Modal component: `apps/desktop/src/renderer/components/RequestContextModal.tsx`

**Modal Layout**:
- Three-column layout matching the context panel design
- Each column shows one type: Rules, References, Tools
- Read-only view (no "Manage" buttons or add/remove functionality)

**Item Display**:
- Priority level (for rules/references) - displayed as 3-digit number (e.g., "001")
- Server name (for tools) - displayed as "serverName."
- Include mode badges: "Always", "Manual", "Agent" (with color coding)
- Item name with description tooltip
- Similarity score (for agent mode items) - displayed as badge, formatted to 2 decimal places
- Item description (if available) - displayed below header

**Sorting**:
- Rules/References: By priority level (if available), then by name
- Tools: By server name, then tool name

**Example Display**:
```
Rules Column:
  001 • Authentication Rules [Always]
  002 • Error Handling [Manual]
  003 • File Operations [Agent - 0.87]

References Column:
  001 • API Documentation [Always]
  002 • Database Schema [Agent - 0.92]

Tools Column:
  filesystem. • read_file [Manual]
  database. • query [Agent - 0.85]
```

**Implementation Details**:
- Modal fetches detailed information (description, priorityLevel) from agent APIs on open
- `requestContext` is preserved when messages are loaded/updated in `ChatTab.tsx`
- `RendererChatMessage` type includes `requestContext?: RequestContext`
- Modal uses discriminated union types properly for type-safe access to item properties
- Handles loading states and empty context gracefully

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

### End User (Desktop App)

- View context details for any message/turn
- See which items were auto-selected vs manually added
- View semantic search results (which items were found relevant)
- Verify that semantic search is working as expected
- Understand what context the agent had access to

## Future Enhancements

### Configuration Options

- **Per-Agent Configuration**: Make semantic search configurable per agent (enable/disable, custom parameters)
- **Preset Modes**: Consider preset modes (Aggressive, Normal, Conservative) for search parameters that map to different parameter combinations
- **Per-Domain Settings**: Treat rules/references as one domain and tools as another, with separate parameter settings

### Performance Optimizations

- **Persistent Cache**: Store embeddings on disk to avoid regeneration on agent reload
- **Incremental Updates**: Re-index only changed chunks, not entire items
- **Hybrid Search**: Combine semantic search with keyword matching for better results
- **Context Window Management**: Dynamically adjust `topK`/`topN` based on available token budget

### UX Improvements

- **Context Usage Analytics**: Track which context items are actually used (referenced in response)
- **Optimization Suggestions**: Suggest removing unused items from session based on usage patterns
- **Context Sharing**: Share request contexts between similar queries, cache effective context combinations

### Persistent Storage

- Request context stored with messages enables historical analysis
- Could export context data for analytics
- Could use to train/improve semantic search

### Context Optimization

- Track which context items are actually used (referenced in response)
- Optimize context selection based on usage patterns
- Suggest removing unused items from session

## Open Questions

- Should rules and references be treated as one "domain" for semantic inclusion, and tools as a separate domain?
- Should search parameters be configurable per session or per agent?
- Should we support preset modes (Aggressive, Normal, Conservative) for search parameters?

