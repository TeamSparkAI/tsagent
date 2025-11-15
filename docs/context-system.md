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
  contextTopK: number;
  contextTopN: number;
  contextIncludeScore: number;
  toolPermission: SessionToolPermission;
}
```

## Agent and Session Settings

Context behavior is controlled by configuration tracked at both the **agent** and **session** level:

- **Agent defaults**: Each agent stores default values for chat settings (max turns, temperature, topP, tool permissions) and for agent-mode selection controls (`contextTopK`, `contextTopN`, `contextIncludeScore`).
- **Session overrides**: When a chat session is created, it inherits the agent defaults. Users can adjust any of these values for the active session without affecting the agent defaults.
- **Request building**: `ChatSessionImpl` always uses the current session values when invoking `searchContextItems()`. Agent-level defaults only matter when seeding new sessions.

Desktop and CLI surfaces expose both layers—the agent settings tab edits the defaults, while the per-session settings drawer adjusts the overrides. These settings directly influence which context items are available to the agent and how semantic selection is performed for each request.

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

## Context-Based Expansion

### Problem Statement

The current context system builds request context once at the start of each request based on semantic search of the user's query. However, there's a temporal mismatch: the initial query doesn't always reveal all the context items the LLM will need. After the LLM analyzes the initially selected context items, it may discover it needs other items that weren't included.

**Example Scenario:**
- User asks: "How do I authenticate?"
- System includes: "Authentication Rules" reference (via semantic search on query)
- LLM reads the reference and discovers it needs to "fetch an API endpoint"
- Problem: The `fetch_website` tool wasn't included because the initial query didn't mention fetching
- Result: LLM lacks the necessary tool, even though it logically follows from the included context

This problem occurs because:
1. **Query-driven selection**: Context is selected based on the user query, not on the content of other context items
2. **No awareness of dependencies**: The system doesn't know that certain context items implicitly require others
3. **Static context building**: Context is built once at request start and doesn't adapt as the LLM processes it

### Context-Based Expansion Approach

**Two-Pass Semantic Search**: Expand context based on the content of initially selected items using existing chunk embeddings.

#### Implementation Strategy

**Pass 1: Query-Based Selection (Current)**
- Run semantic search on the user query
- Select initial context items using existing `searchContextItems()` logic
- Items are selected based on relevance to the user's explicit query

**Pass 2: Chunk-Based Expansion (New)**
- For each context item selected in Pass 1, use its existing chunk embeddings as "queries"
- **Rules/References**: Use all chunk embeddings from the item (already indexed in `item.embeddings[]`)
- **Tools**: Use the tool's description embedding (already indexed in `client.toolEmbeddings.get(tool.name)`)
- For each chunk embedding from Pass 1 items:
  - Compute cosine similarity to all context chunk embeddings (excluding chunks from Pass 1 items)
  - Collect similarity scores for all context items
- **Pool scores across chunks** (similar to query chunking):
  - **Max pooling**: For each context item, take the maximum similarity score across all chunk queries
  - This gives each candidate item the benefit of the best-matching chunk from Pass 1 items
- Apply same filtering/thresholding logic as Pass 1 (topN, includeScore)
- Include high-confidence matches that weren't already selected in Pass 1

#### Example Flow

```
User Query: "How do I authenticate?"

Pass 1 (Query-based):
  - Embed user query: "How do I authenticate?"
  - Semantic search against all context chunks
  - Selects: "Authentication Rules" reference (similarity: 0.92)
  - "Authentication Rules" has 3 chunks (already indexed)

Pass 2 (Chunk-based expansion):
  - Use "Authentication Rules" chunk embeddings as queries:
    - Chunk 1: "To authenticate, fetch the API endpoint..." (embedding: [0.1, 0.2, ...])
    - Chunk 2: "Get the authentication token from..." (embedding: [0.3, 0.4, ...])
    - Chunk 3: "Make HTTP request with token..." (embedding: [0.5, 0.6, ...])
  - For each chunk embedding, compute similarity to all other context chunks
  - Pool results (max pooling):
    - "fetch_website" tool: max(0.85, 0.72, 0.68) = 0.85
    - "http_request" tool: max(0.78, 0.81, 0.89) = 0.89
  - Include items above threshold (0.75) not already in Pass 1
  - Adds: "fetch_website" tool (0.85), "http_request" tool (0.89)

Final Request Context:
  - "Authentication Rules" reference (Pass 1, similarity: 0.92)
  - "fetch_website" tool (Pass 2, similarity: 0.85)
  - "http_request" tool (Pass 2, similarity: 0.89)
```

#### Benefits

- **Uses existing infrastructure**: Leverages current semantic search, chunk embeddings, and similarity computation
- **No extraction step**: Uses existing chunk embeddings directly (no keyword/phrase extraction needed)
- **No LLM awareness required**: Automatic and transparent to the LLM
- **Solves the dependency problem**: Captures implicit relationships between context items based on their content
- **Similar to query chunking**: Uses the same max pooling technique already described in the document
- **Configurable**: Can be enabled/disabled and tuned via agent/session settings
- **Incremental implementation**: Can be added without breaking existing functionality

#### Configuration Options

- **`contextExpansionDepth`**: Number of expansion passes (0 = off, 1 = one pass, etc.)
- **`contextExpansionThreshold`**: Minimum similarity score for expansion items (default: 0.75)
- **`contextExpansionTopN`**: Maximum number of items to include per expansion pass (default: 3)
- **`contextExpansionEnabled`**: Enable/disable expansion per agent or session

#### Implementation Considerations

- **Performance**: Uses existing chunk embeddings (no additional embedding generation needed)
  - Similarity computation is fast (cosine similarity on already-computed vectors)
  - Max pooling across chunks is O(n*m) where n = number of Pass 1 chunks, m = number of candidate chunks
  - Can be optimized by limiting the number of Pass 1 chunks used (e.g., top 5 chunks per item)
  - Expansion can reuse the same similarity computation infrastructure as Pass 1
- **Token efficiency**: May include more context items, but only high-confidence matches
  - Threshold filtering (e.g., 0.75) prevents low-quality matches
  - TopN limiting prevents excessive context expansion
- **No extraction step**: Uses existing indexed chunks directly
  - Rules/References: Chunks already exist in `item.embeddings[]` (JIT indexed when needed)
  - Tools: Tool description embeddings already exist in `client.toolEmbeddings` (JIT indexed when needed)
  - No additional processing or "extraction" required
- **Chunk selection**: May want to limit which chunks are used as queries
  - Option: Use all chunks from Pass 1 items (comprehensive but slower)
  - Option: Use top K chunks per item (faster, still effective)
  - Option: Use chunks above a relevance threshold (most relevant chunks only)
- **User transparency**: Expansion items should be marked in request context display
  - Could use `includeMode: 'expansion'` or similar to distinguish from query-based items
  - Similarity scores from expansion can be shown in context modal

### Alternative: Pre-computed Context Relationships

**Relationship Graph**: Pre-compute semantic relationships between all context items at agent load time using existing chunk embeddings.

- For each context item, use its existing chunk embeddings (already indexed)
- For each pair of items, compute item-level similarity:
  - **Option 1**: Average all chunk embeddings per item, then compute cosine similarity
  - **Option 2**: Max pooling (best chunk match between items)
  - **Option 3**: Mean pooling (average of all chunk-to-chunk similarities)
- Store relationships above a threshold (e.g., 0.75): `itemA → [itemB (0.87), itemC (0.82)]`
- On request context building: After Pass 1, look up pre-computed relationships for selected items
- Include related items above threshold that aren't already selected

**Benefits:**
- Very fast at request time (just lookups, no additional semantic search)
- Captures relationships that might not appear in a single query
- Can be computed once and cached (during agent indexing)
- Uses existing chunk embeddings (no additional embedding generation)

**Trade-offs:**
- Requires upfront computation (but can be done during agent indexing, or lazily on first use)
- May include items that aren't needed (but threshold helps)
- Relationships are static (won't capture dynamic needs from tool results)
- Item-level similarity may lose nuance compared to chunk-level search

### Hybrid Approach

Combine both approaches:
1. **Two-pass semantic search** for query-driven expansion (more flexible, adapts to query)
2. **Relationship graph** for item-driven expansion (faster, captures static relationships)
3. Configurable thresholds and limits for each

This provides both flexibility and performance, with the relationship graph handling common cases quickly and two-pass search handling query-specific needs.

### Future: Tool Result Analysis

For cases where tool results suggest additional context items are needed (e.g., LLM analyzes tool result and discovers it needs other tools/rules):
- **Tool-specific expansion rules**: Define relationships between tools (e.g., `read_file` → `write_file`, `search_code`)
  - Simple rule-based approach for common patterns
  - Could be configured per agent or globally
- **Tool result embedding**: Embed tool result text (chunk it if needed) and search for similar context items
  - Similar to Pass 2 chunk-based expansion, but using tool result chunks as queries
  - Would require embedding tool results on-the-fly (adds latency)
  - Could be limited to specific tool types (e.g., `read_file` results)

These are more complex and may require additional infrastructure, but could be added incrementally after context-based expansion is implemented.

## Open Questions

- Should rules and references be treated as one "domain" for semantic inclusion, and tools as a separate domain?
- Should search parameters be configurable per session or per agent?
- Should we support preset modes (Aggressive, Normal, Conservative) for search parameters?

## Query Chunking + Ensemble Embeddings

### Goal
Long prompts often pack in multiple sub-questions or topic shifts. A single embedding of the whole prompt can "average away" those nuances, hurting recall. Query chunking combats that by breaking the prompt into smaller, coherent segments (sentences, clauses, bullet points) and embedding each independently.

### As-Built Implementation

**1. Chunk the Query**
- Split the query by sentences using sentence boundaries (`.`, `!`, `?`)
- One chunk per sentence (no combining)
- Truncate any sentence longer than `maxChunkSize` (default: 500 characters)
- Implementation: `chunkQueryText()` in `packages/agent-api/src/managers/semantic-indexer.ts`

**2. Embed Each Chunk**
- Generate embeddings for all query chunks in parallel using `Promise.all()`
- Each chunk gets its own embedding vector
- Embeddings are normalized (from `@xenova/transformers` pipeline with `normalize: true`)

**3. Build M×N Scores Matrix**
- M rows = query chunks
- N columns = context item chunks
- Each cell: `{ contextItemIndex: number, score: number }`
- Compute cosine similarity (dot product, since embeddings are normalized) for each (query chunk, context chunk) pair

**4. Pool the Scores**
- **Max pooling** (implemented): For each context chunk (column), take the maximum similarity score across all query chunks (rows)
- If only one query chunk (M=1), use that row directly
- If multiple query chunks (M>1), compute `max(...columnScores)` per column
- This gives each context chunk the benefit of the best-matching query chunk

**5. Aggregate Results**
- After pooling, have N scores (one per context chunk)
- Sort by score, apply topK filtering
- Group by context item, keep best score per item
- Apply topN and includeScore thresholds as usual

### Advantages
- **Captures multi-topic queries**: Different query chunks can match different context items
- **Preserves detail**: Shorter segments embed more precisely than one long, diluted vector
- **Better for topic shifts**: Max pooling ensures items that match any query chunk well are included

### Known Issue: Minimum Representation Per Query Chunk

**Problem**: When query chunks have different score distributions, max pooling can favor one chunk over another. For example:
- Query chunk 1 matches items with scores [0.9, 0.85, 0.8]
- Query chunk 2 matches items with scores [0.75, 0.7, 0.65]
- After max pooling and filtering, only items from chunk 1 may appear in final results

**Potential Solution**: Ensure minimum representation per query chunk in final results:
- Track which query chunk gave each item its max score
- After final filtering, check distribution across query chunks
- If any chunk has fewer than minimum items, promote items that had their max from that chunk
- This ensures each query chunk contributes to final results, even if its scores are lower

**Status**: Not yet implemented - future enhancement

### Considerations
- **Performance**: Embedding every chunk increases runtime roughly linearly with the number of segments, but parallel embedding generation mitigates this
- **Chunking strategy**: Sentence-based chunking works well for most queries, but may need adjustment for very long sentences or special formatting
- **Pooling choice**: Max pooling favors recall (items matching any query chunk), while mean pooling would favor precision (items matching multiple query chunks). Max pooling is better for multi-topic queries.

This approach is often called "ensemble retrieval" or "multi-vector query encoding" in vector search systems.