# Semantic Indexing for Context Selection

## Overview

This document describes the design for semantic indexing of agent rules, references, and MCP tools (tools available to the agent from installed MCP clients/servers) to enable intelligent context selection during chat sessions. The system uses local embeddings to determine which context items are most relevant to a user's query, allowing the agent to operate on only the relevant context rather than overwhelming the LLM with all available items.

**Important**: The "tools" discussed in this document refer to **MCP tools available to the agent** (from installed MCP clients/servers), not tools exported by the agent (AgentTool definitions used in Tools mode agents).

## Goals

1. **Relevant Context Selection**: Automatically include only the most relevant rules, references, and tools based on the current user query
2. **Performance**: Minimize overhead by using JIT (Just-In-Time) indexing
3. **Simplicity**: Keep the implementation simple with minimal synchronization complexity
4. **Integration**: Seamlessly integrate with existing include modes (`always`, `manual`, `agent`)

## Architecture

### Core Components

The semantic indexing system leverages the `SemanticIndexer` class from the `@tsagent/semantic-index` CLI project (see `apps/semantic-index/src/indexer.ts`). The indexer provides:

- **Local Embeddings**: Uses `@xenova/transformers` with `Xenova/all-MiniLM-L6-v2` model (~80MB, quantized)
- **Chunking**: Splits long text into semantically coherent chunks (~500 chars max)
- **Cosine Similarity**: Brute-force vector similarity search for relevance scoring
- **Multi-Scope Support**: Indexes rules, references, and tools with scope metadata (`'rules'`, `'references'`, `'tools'`) to enable filtered searches

### Indexing Strategy

#### Content Format

Items are indexed with the following format:

- **Rules**: `name: description\n\ntext` (if description exists, otherwise just `name\n\ntext`)
- **References**: `name: description\n\ntext` (if description exists, otherwise just `name\n\ntext`)
- **Tools**: `name: description` (if description exists, otherwise just `name`)
  - Note: These are MCP tools available to the agent (from installed MCP clients/servers), not tools exported by the agent

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
MCP tools are accessed via `McpClient` instances (from `agent.getAllMcpClients()`), and each client has a `serverTools: Tool[]` array. Tools are managed and accessed at the client level, where:
1. Tools belong to a specific MCP server/client
2. Tools are accessed via `client.serverTools` (where `client` is from `agent.getAllMcpClients()`)
3. Tool metadata (include modes, permissions) is managed at the server config level
4. Usage pattern: "get all tools with `include: 'agent'` along with their embeddings"

Since tools are managed per `McpClient` and we control the `McpClient` interface, we store tool embeddings directly on the client:

```typescript
// Extend McpClient interface
export interface McpClient {
  serverVersion: { name: string; version: string } | null;
  serverTools: Tool[];
  toolEmbeddings?: Map<string, IndexedChunk[]>;  // Key: toolName, Value: embeddings
  // ... other methods
}

// Example usage:
// client.toolEmbeddings?.get("read_file") -> [IndexedChunk, ...]
```

This structure:
- Keeps embeddings with the tool management structure (on the client where tools live)
- Preserves the natural relationship: `client` → `serverTools` → `toolEmbeddings`
- Matches how tools are accessed: iterate clients → iterate `client.serverTools` → access `client.toolEmbeddings?.get(tool.name)`
- Makes it easy to get all tools from a server with their embeddings
- No need to maintain a separate map on Agent - embeddings live where tools live

**Indexing Strategy for MCP Tools**:
- Tools are loaded during `preloadMcpClients()` in Agent initialization
- After MCP clients are connected, tools are available via `client.serverTools`
- Index tools once after preload (JIT on first semantic search request)
- Store embeddings on client: `client.toolEmbeddings = new Map(); client.toolEmbeddings.set(toolName, chunks)`
- No invalidation needed (tools don't change after load)
- If client is reloaded, embeddings are cleared with the client

## JIT Indexing Approach

### Principle

Embeddings are generated **on-demand** when needed for semantic search, not upfront during agent loading. This defers the cost until semantic context selection is actually used.

### Implementation

**For Rules and References**:

1. **On Semantic Search Request**:
   - Check if embeddings exist for each item that needs indexing: `if (!item.embeddings) { ... }`
   - For items missing embeddings, generate them (batch all missing items together)
   - Store embeddings with the item: `item.embeddings = chunks`

2. **On Item Update**:
   - Clear embeddings: `item.embeddings = undefined`
   - Embeddings will be regenerated on next semantic search

3. **No Complex Sync**:
   - No version tracking
   - No timestamps
   - No hash checks
   - Simple presence check: `if (!item.embeddings) { generate }`

**For MCP Tools**:

1. **On Semantic Search Request**:
   - Get all MCP clients: `await agent.getAllMcpClients()`
   - For each client/server, iterate through `client.serverTools`
   - Check if embeddings exist: `if (!client.toolEmbeddings?.has(tool.name)) { ... }`
   - For tools missing embeddings, generate them (batch all missing tools together)
   - Ensure embeddings map exists: `if (!client.toolEmbeddings) { client.toolEmbeddings = new Map() }`
   - Store embeddings: `client.toolEmbeddings.set(tool.name, chunks)`

2. **On Tool Change**:
   - Not applicable - tools don't change after MCP clients are loaded
   - If an MCP client is reloaded, the client is replaced and embeddings are cleared with the old client

3. **Indexing Timing**:
   - Tools are available after `preloadMcpClients()` completes
   - Index tools JIT on first semantic search request (same as rules/references)
   - No invalidation needed since tools don't change

4. **Retrieval Pattern**:
   - Common usage: "get all tools with `include: 'agent'` along with their embeddings"
   - Iterate clients: `for (const [serverName, client] of Object.entries(await agent.getAllMcpClients()))`
   - Filter tools by include mode from `client.serverTools`
   - Get embeddings: `client.toolEmbeddings?.get(tool.name)`
   - Results naturally preserve server/tool relationship (via client reference)

### Benefits

- **No Upfront Cost**: Agent loading doesn't pay the embedding generation penalty (~800ms for 151 chunks)
- **Incremental Updates**: Only re-index items that have changed
- **Same Total Cost When Used**: First semantic search pays the same ~800ms (690ms indexing + 100ms model init)
- **Better for Unused Features**: Agents that don't use semantic search pay no cost

### Performance Characteristics

Based on observed performance from `@tsagent/semantic-index`:

- **Model Initialization**: ~100ms (one-time, cached after first use)
- **Indexing**: ~690ms for 151 chunks (~4.5ms per chunk)
- **Inference (Search)**: ~10ms per 100 documents in the index (very fast)

For a typical agent with 100 context items:
- **First Semantic Search**: ~800ms (if all items need indexing)
- **Subsequent Searches**: ~10ms (using cached embeddings)

## Integration with Include Modes

The semantic indexing system integrates with existing include modes:

### Include Mode Behavior

- **`always`**: Always included, no semantic search needed
- **`manual`**: Explicitly included/removed by user, no semantic search needed
- **`agent`**: Dynamically included based on semantic relevance

### Context Selection Flow

1. **Always Items**: Include all items with `include: 'always'` (or manually added items in interactive mode)
2. **Agent Items**: For items with `include: 'agent'`:
   - Generate embeddings for items missing them (JIT)
   - Search for top K most relevant items based on user query
   - Include only the selected items in the context

### Supervisor Integration

The Supervisor (including Supervisor Agent) can use semantic indexing to:
- Include/exclude context elements (rules, references, and tools) based on relevance to the current user message
- Consider message history when determining relevance
- Filter to only the most relevant context to avoid overwhelming the LLM

## Usage

The general idea is to use this tooling (the indexer from `@tsagent/semantic-index`) to select relevant rules, references, and tools to include in a chat request context.

We have the concept of a rule/reference/tool that may be included by "Agent" (when the agent thinks it's relevant). We also have the concept of a Supervisor, including a Supervisor Agent, where one of the functions is to include/exclude context elements (rules, references, and tools) based on relevance to the current user-provided context (message, possibly also including some message history).

The idea is that on each chat message the agent includes the "always" context items (or manually added ones, if interactive), then it searches the "agent" context items to find the most relevant K matches to the current query and includes those also. It might be better to only index the "Agent" context items to make this logic cleaner (though those items may have been manually added by a user in an interactive agent, so we'd still need to check for that).

In this way the LLM is only operating on relevant context (not overwhelmed cognitively and not overrunning input token limits).

## Implementation Details

### Model Management

The embedding model (`Xenova/all-MiniLM-L6-v2`) is:
- **Lazy Loaded**: Only loaded when first semantic search is requested
- **Shared**: Single model instance shared across all embeddings for the agent
- **Cached**: Model is cached by `@xenova/transformers` in `~/.cache/transformers` (or `TRANSFORMERS_CACHE` env var)
- **Pure JS**: No C++ dependencies, works in all environments

### Embedding Generation

When generating embeddings for items:

1. **Check Existing**: `if (item.embeddings) { use existing }`
2. **Collect Missing**: Gather all items that need embeddings
3. **Batch Generate**: Generate embeddings for all missing items in one pass
4. **Store**: Attach embeddings to each item: `item.embeddings = chunks`

### Cache Invalidation

When an item is updated:

1. **Clear Embeddings**: `item.embeddings = undefined`
2. **Next Search**: Embeddings will be regenerated automatically

No complex invalidation logic needed - simple presence check is sufficient.

### Search Implementation

When performing semantic search:

1. **Filter Items**: Collect items with `include: 'agent'` that are enabled
   - **Rules**: `agent.getAllRules().filter(r => r.include === 'agent' && r.enabled)`
   - **References**: `agent.getAllReferences().filter(r => r.include === 'agent' && r.enabled)`
   - **Tools**: Get tools from MCP clients with `include: 'agent'` (via tool context management)

2. **Ensure Embeddings**: Generate embeddings for any missing items (JIT)
   - **Rules/References**: Check `if (!item.embeddings) { generate }`, store on item
   - **Tools**: For each client, iterate `client.serverTools`, check `if (!client.toolEmbeddings?.has(tool.name)) { generate }`, store on client

3. **Collect All Chunks**: Gather all chunks with their metadata (server, tool, scope)
   - **Rules/References**: Iterate `item.embeddings` for each item, include item name
   - **Tools**: Iterate clients → iterate `client.serverTools` → get embeddings from `client.toolEmbeddings?.get(tool.name)`
   - Store metadata with each chunk: `{ serverName: client name, toolName: tool.name, scope: 'tools', chunkIndex, text, embedding }`

4. **Generate Query Embedding**: Embed the user query using the same model

5. **Calculate Similarity**: Cosine similarity between query embedding and all collected chunks

6. **Rank Results**: Sort by similarity score, return top K items (with scope and item name)

7. **Include in Context**: Add selected items to the chat session context
   - **Rules/References**: Add by name
   - **Tools**: Add by server name + tool name (preserved in search results), or via tool context management
   - Results naturally preserve the server/tool relationship without string parsing

## Future Considerations

### Enhancements

- **Persistent Cache**: Store embeddings on disk to avoid regeneration on agent reload
- **Incremental Updates**: Re-index only changed chunks, not entire items
- **Hybrid Search**: Combine semantic search with keyword matching for better results
- **Context Window Management**: Dynamically adjust K based on available token budget

### Limitations

- All embeddings are computed in memory (can be memory-intensive for very large agents)
- Simple brute-force search (not optimized for very large datasets)
- No cross-item semantic relationships (each item indexed independently)

## References

- **Semantic Index CLI**: `apps/semantic-index/` - Standalone CLI tool for semantic indexing
- **Indexer Implementation**: `apps/semantic-index/src/indexer.ts` - Core indexing and search logic
- **Model**: `Xenova/all-MiniLM-L6-v2` - Lightweight, fast embedding model (~80MB)

## Open Issues

Do we want to treat rules and references as one "domain" for semantic inclusion, and tools as a separate domain?

Do we want to configure match result settings:
- topK - max embedding matches to consider
- topN - target number of results to return (after grouping matches)
- includeScore - always include items with this similarity score or higher (can cause topN to be exceeded)

How do we configure the match result settings?
- Session props for each setting (and for each domain)
- Maybe abstract mode for each domain - Aggressive (smallest context), Normal, Conservative (larger context)
  - We could have a topK, topN, includeScore profile for each mode (that we just manage internally)

For include (always, agent, manual)
- Always means always include in new chat session (if removed manually, it should stay removed for duration of session)
  - This appears to be violated in some area
  - Make the dropdown choices more clear (as in rules/refs)
- Agent should be able to add only elements with "Agent" setting
- Agent-added elements are only for duration of chat prompt processing (they are not added to the session state)
- It would be nice to know which context items were used to processing a given chat request (so we can see what the agent added)
  - As part of this, also record "how" (auto, agent, manual) - if an auto was removed and re-added, is not still auto, or is it manual
  - Can we record this somewhere in the message, maybe expose in UX details - would need some short metadata (that also works for server/tool)
- Given the inclusion settings (esp manual), it seems like rule/reference enable/disable is not longer needed / applicable
