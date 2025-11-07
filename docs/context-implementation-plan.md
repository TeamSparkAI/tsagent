# Context Management Implementation Plan

This document outlines a phased implementation plan for the context tracking system described in `context.md`. The plan is designed to be incremental, with each phase delivering value and being independently testable.

## Implementation Status

**Completed Phases**: 1, 2, 3, 4, 5a, 5b, 5c, 5d  
**Remaining Phases**: 6

## Implementation Phases

### ✅ COMPLETED PHASES

### ✅ Phase 1: Type Definitions and Data Structures
**Status**: COMPLETE  
**Goal**: Define all type structures needed for context tracking without changing behavior.

**Tasks Completed**:
1. ✅ Created `packages/agent-api/src/types/context.ts` with:
   - `ContextItemBase` discriminated union
   - `SessionContextItem` type
   - `RequestContextItem` type
   - `RequestContext` interface
2. ✅ Updated `ChatMessage` type in `packages/agent-api/src/types/chat.ts`:
   - Added optional `requestContext?: RequestContext` to assistant message variant
3. ✅ Exported all context types from `packages/agent-api/src/index.ts`

**Deliverables**:
- ✅ Type definitions file created
- ✅ Updated ChatMessage type
- ✅ All types compile without errors
- ✅ Types exported for API consumers

---

### ✅ Phase 2: Session Context Refactoring
**Status**: COMPLETE  
**Goal**: Replace simple arrays with tracked context items.

**Tasks Completed**:
1. ✅ Updated `ChatSessionImpl` in `packages/agent-api/src/core/chat-session.ts`:
   - Added `contextItems: SessionContextItem[]` property
   - Updated constructor to initialize `contextItems` from 'always' items with `includeMode: 'always'`
   - **Note**: Removed backward-compatible arrays and getters (all consumers updated to use `contextItems`)
2. ✅ Updated `addRule()`, `addReference()`, `addTool()` methods:
   - Accept optional `method: 'always' | 'manual' = 'manual'` parameter
   - Add items to `contextItems` array with proper include mode tracking
   - Maintain existing boolean return signature
3. ✅ Updated `removeRule()`, `removeReference()`, `removeTool()` methods:
   - Remove from `contextItems` array
   - Maintain existing behavior
4. ✅ Updated `getState()` method:
   - Returns `contextItems` in state (required field, not optional)

**Deliverables**:
- ✅ Session context tracking with include modes
- ✅ All consumers updated to use `contextItems` directly
- ✅ All existing tests pass

**Implementation Notes**:
- Removed backward-compatible arrays (`rules`, `references`, `tools`) from `ChatState`
- All consumers (desktop app, CLI, MCP clients) updated to use `contextItems` directly
- Include modes correctly tracked when items are added
- 'always' items automatically added with correct include mode
- Manual additions tracked with 'manual' include mode

---

### ✅ Phase 3: Request Context Building (Without Semantic Search)
**Status**: COMPLETE  
**Goal**: Build request context from session context, without semantic search integration yet.

**Tasks Completed**:
1. ✅ Created `buildRequestContext()` function in `packages/agent-api/src/core/chat-session.ts`:
   - Takes user message as parameter
   - Builds `RequestContext` from session context items (all with their include modes)
   - Currently only includes session context (no agent mode items yet - Phase 5)
   - Returns `RequestContext` object
2. ✅ Updated `handleMessage()` method:
   - Calls `buildRequestContext()` before generating response
   - **Uses request context to build actual LLM messages array**: Iterates through `requestContext.items` to extract rules and references, looks them up from the agent, and adds them as user messages to the messages array sent to the LLM
   - This ensures that what's recorded in `requestContext` is exactly what was used to generate the response
   - Attaches `requestContext` to assistant message before pushing to messages array
3. ✅ Created helper function `getAgentModeItems()`:
   - Identifies items with `include: 'agent'` that are NOT in session context
   - Returns list of potential agent items (prepared for Phase 5 semantic search)

**Deliverables**:
- ✅ Request context built for each request
- ✅ Request context attached to assistant messages
- ✅ Context used to build LLM messages (ensuring consistency)

**Implementation Notes**:
- Request context is created for each message
- Request context includes all session context items with correct include modes
- **Request context items are used to build the messages array sent to the LLM**: The `handleMessage()` method iterates through `requestContext.items`, extracts rules and references, looks them up from the agent, and adds them as user messages to the messages array. This ensures consistency - what's recorded is what was used.
- Request context is attached to assistant messages in `updates` array
- LLM receives same context as recorded in request context

---

### ✅ Phase 4: ChatState and API Updates
**Status**: COMPLETE  
**Goal**: Update public APIs to expose context tracking information.

**Tasks Completed**:
1. ✅ Updated `ChatState` interface:
   - Added `contextItems: SessionContextItem[]` field (required, not optional)
   - **Note**: Removed backward-compatible arrays (all consumers updated)
2. ✅ Updated `MessageUpdate` interface:
   - **Note**: Did not add `requestContext` to `MessageUpdate` (redundant - already in `ChatMessage.requestContext` on assistant messages)
   - Removed `references` and `rules` fields (no longer needed - consumers use `getChatState()`)
3. ✅ Updated `getState()` method:
   - Includes `contextItems` in returned state
4. ✅ Updated `handleMessage()` return:
   - Includes `requestContext` in assistant messages within `updates` array
5. ✅ Updated all API consumers:
   - Desktop app updated to use `contextItems` directly
   - CLI updated to use `contextItems` directly
   - MCP clients updated to use `contextItems` directly

**Deliverables**:
- ✅ Public APIs expose context tracking data
- ✅ All API consumers updated
- ✅ Desktop app can access context information via `ChatState.contextItems`
- ✅ Request context accessible via `ChatMessage.requestContext` on assistant messages

**Implementation Notes**:
- `requestContext` is accessible via `messageUpdate.updates.find(m => m.role === 'assistant')?.requestContext`
- No need for top-level `requestContext` on `MessageUpdate` (would be redundant)
- All context types properly exported from `packages/agent-api/src/index.ts`

---

### 🔄 REMAINING PHASES

### ✅ Phase 5a: Add SemanticIndexer to Agent
**Status**: COMPLETE  
**Goal**: Add semantic indexing capability to Agent as an optional, on-demand feature.

**Prerequisites**:
- Semantic indexer from `apps/semantic-index` must be available as a package or integrated into `agent-api`
- `@xenova/transformers` dependency available

**Tasks**:
1. ✅ Extract `SemanticIndexer` from `apps/semantic-index/src/indexer.ts` into `packages/agent-api/src/managers/semantic-indexer.ts`:
   - ✅ Adapted to work with `SessionContextItem[]` and `RequestContextItem[]` types (context-item-centric design)
   - ✅ Supports JIT (Just-In-Time) indexing via `indexContextItems()` method
   - ✅ Maintains same embedding model (`Xenova/all-MiniLM-L6-v2`)
   - ✅ Removed `Scope` and `SearchResult` types in favor of context item types
2. ✅ Add `searchContextItems()` method to `Agent` interface:
   - ✅ Public method: `searchContextItems(query: string, items: SessionContextItem[], options?: {...}): Promise<RequestContextItem[]>`
   - ✅ `SemanticIndexer` is private, lazy-initialized member of `AgentImpl`
   - ✅ No getter/setter - indexer is internal implementation detail
3. ✅ Update `AgentImpl` to support semantic indexer:
   - ✅ Private `_semanticIndexer: SemanticIndexer | null = null` property
   - ✅ Private `getSemanticIndexer(): SemanticIndexer` method with lazy initialization
   - ✅ Public `searchContextItems()` method delegates to indexer
   - ✅ Uses agent's logger for indexer initialization
   - ✅ Model initialization deferred until first use

**Deliverables**:
- ✅ `SemanticIndexer` class available in `agent-api` package
- ✅ Agent interface supports semantic search via `searchContextItems()` method
- ✅ Indexer initializes on-demand (no upfront cost)
- ✅ Search parameters implemented: `topK` (default: 20), `topN` (default: 5), `includeScore` (default: 0.7)

**Implementation Notes**:
- `SemanticIndexer` is context-item-centric: works directly with `SessionContextItem[]` and returns `RequestContextItem[]`
- `indexContextItems()` performs JIT indexing for all items in the provided array
- `searchContextItems()` internally calls `indexContextItems()` to ensure all items are indexed before searching
- Embeddings stored directly on items (`Rule.embeddings`, `Reference.embeddings`) and clients (`McpClient.toolEmbeddings`)
- Search parameters allow fine-tuning: `topK` for chunk match limit, `topN` for result limit, `includeScore` for high-confidence threshold

**Testing**:
- ✅ Semantic indexer initializes only when first used
- ✅ Model loading works correctly
- ✅ System works without semantic indexer (optional feature)
- ✅ Search parameters work with defaults and custom values

---

### ✅ Phase 5b: JIT Indexing for Rules and References
**Status**: COMPLETE  
**Goal**: Implement JIT indexing for rules and references with embeddings stored on items.

**Prerequisites**:
- Phase 5a complete (SemanticIndexer available on Agent)

**Tasks**:
1. ✅ Update `Rule` and `Reference` interfaces to support embeddings:
   - ✅ Added optional `embeddings?: IndexedChunk[]` field
   - ✅ `IndexedChunk` includes: `text: string`, `embedding: number[]`, `chunkIndex: number`
2. ✅ Implement JIT indexing in `SemanticIndexer`:
   - ✅ Method to index single rule/reference on demand (`indexRule()`, `indexReference()`)
   - ✅ Method to batch index multiple rules/references (`indexContextItems()`)
   - ✅ Check for existing embeddings before indexing: `if (!item.embeddings) { generate }`
   - ✅ Store embeddings on item: `item.embeddings = chunks`
3. ✅ Implement cache invalidation:
   - ✅ Clear embeddings when rule/reference is updated: `item.embeddings = undefined`
   - ✅ Embeddings regenerated on next semantic search
4. ✅ Update rule/reference update methods:
   - ✅ Clear embeddings in `addRule()` and `addReference()` (used for both add and update)

**Deliverables**:
- ✅ Rules and references support optional embeddings
- ✅ JIT indexing generates embeddings on demand
- ✅ Cache invalidation clears embeddings on updates
- ✅ No upfront indexing cost

**Implementation Notes**:
- Embeddings are stored directly on `Rule` and `Reference` objects
- JIT indexing is triggered automatically when `searchContextItems()` is called (via `indexContextItems()`)
- Cache invalidation only clears embeddings when updating existing items (not for new items)

**Testing**:
- ✅ Embeddings generated only when needed
- ✅ Embeddings persist until item is updated
- ✅ Cache invalidation works correctly
- ✅ Performance acceptable (no blocking on agent load)

---

### ✅ Phase 5c: JIT Indexing for MCP Tools
**Status**: COMPLETE  
**Goal**: Implement JIT indexing for MCP tools with embeddings stored on McpClient.

**Prerequisites**:
- Phase 5a complete (SemanticIndexer available on Agent)
- Phase 5b complete (JIT indexing pattern established)

**Tasks**:
1. ✅ Update `McpClient` interface to support tool embeddings:
   - ✅ Added optional `toolEmbeddings?: Map<string, IndexedChunk[]>` field
   - ✅ Key: tool name, Value: embeddings chunks
2. ✅ Implement JIT indexing for tools in `SemanticIndexer`:
   - ✅ Method to index tools from a specific MCP client (`indexTool()`)
   - ✅ Method to batch index tools from multiple clients (via `indexContextItems()`)
   - ✅ Check for existing embeddings: `if (!client.toolEmbeddings?.has(tool.name)) { generate }`
   - ✅ Ensure map exists: `if (!client.toolEmbeddings) { client.toolEmbeddings = new Map() }`
   - ✅ Store embeddings: `client.toolEmbeddings.set(tool.name, chunks)`
3. ✅ Handle tool indexing (same JIT pattern as rules/references):
   - ✅ Index tools JIT on first semantic search request (same as rules/references)
   - ✅ No invalidation needed (tools don't change after MCP clients are loaded)
   - ✅ If client is reloaded, embeddings cleared with old client (new client has no embeddings)

**Deliverables**:
- ✅ MCP tools support optional embeddings on client
- ✅ JIT indexing generates tool embeddings on demand
- ✅ Embeddings stored per tool on client
- ✅ No upfront indexing cost

**Implementation Notes**:
- Embeddings are stored on `McpClient` instances in a `Map<string, IndexedChunk[]>`
- JIT indexing is triggered automatically when `searchContextItems()` is called (via `indexContextItems()`)
- No cache invalidation needed since tools don't change after MCP clients are loaded

**Testing**:
- ✅ Tool embeddings generated only when needed
- ✅ Embeddings persist per client
- ✅ Client reload clears embeddings correctly
- ✅ Performance acceptable

---

### ✅ Phase 5d: Integrate Semantic Search into Request Context
**Status**: COMPLETE  
**Goal**: Integrate semantic search to automatically select agent mode items for each request.

**Prerequisites**:
- Phase 5a complete (SemanticIndexer on Agent)
- Phase 5b complete (JIT indexing for rules/references)
- Phase 5c complete (JIT indexing for tools)

**Tasks**:
1. ✅ Update `buildRequestContext()` in `ChatSessionImpl`:
   - ✅ Get agent mode items using `getAgentModeItems()` helper
   - ✅ Call `agent.searchContextItems()` with user message and agent mode items
   - ✅ Use default search parameters (topK: 20, topN: 5, includeScore: 0.7)
   - ✅ Handle optional semantic search gracefully (try/catch - works without it)
   - ✅ Merge agent-selected items into request context
   - ✅ Ensure no duplicates (agent items already in session context are excluded)
   - ✅ Preserve server/tool relationship for tools
2. ✅ Update `handleMessage()`:
   - ✅ Semantic search is already integrated via `buildRequestContext()`
   - ✅ Similarity scores are automatically attached to agent mode items in request context
   - ✅ No additional changes needed (request context already includes similarity scores)

**Deliverables**:
- ✅ Agent mode items automatically selected via semantic search
- ✅ Similarity scores recorded in request context
- ✅ Works with or without semantic search enabled
- ✅ JIT indexing ensures embeddings exist when needed

**Implementation Notes**:
- Semantic search is called in `buildRequestContext()` before building the request context
- JIT indexing runs automatically when `searchContextItems()` is called
- Search results are merged into request context with `includeMode: 'agent'` and `similarityScore` attached
- Error handling ensures system works even if semantic search fails

**Testing**:
- ✅ Agent mode items are selected based on query relevance
- ✅ Similarity scores are recorded correctly
- ✅ No duplicates between session context and agent-selected items
- ✅ System works when semantic search is unavailable
- ✅ JIT indexing works correctly (embeddings generated on demand)
- ✅ Performance acceptable (first search may be slower due to indexing)

---

### ⏳ Phase 6: UX Integration (Desktop App)
**Status**: PENDING  
**Goal**: Display request context information for assistant messages via an on-demand modal.

**Tasks**:
1. Add context menu/button to assistant messages:
   - Add context menu option or button on assistant messages
   - Only visible on messages that have `requestContext` attached
   - Triggers modal to display request context
2. Create Request Context Modal component:
   - Modal dialog similar to existing modals (ReferencesModal, RulesModal, ToolsModal)
   - Layout similar to context panel (columns for Rules/References/Tools)
   - **No "Manage" buttons** (read-only view)
   - Display include mode badges (Always, Manual, Agent) for each item
   - Display similarity scores for agent-selected items
   - Show item names and descriptions (similar to context panel)
   - Group items by type (Rules, References, Tools) in separate columns
3. Modal content structure:
   - Three-column layout matching context panel
   - Each column shows one type (Rules, References, Tools)
   - Each item displays:
     - Include mode badge (Always/Manual/Agent)
     - Item name
     - Similarity score (if agent mode)
     - Item description/tooltip
   - Read-only display (no add/remove functionality)

**Deliverables**:
- Context menu/button on assistant messages
- Request Context Modal component
- Clear visualization of context used for each response
- Include modes and similarity scores displayed

**Testing**:
- Modal opens correctly from assistant messages
- Modal displays all context items from `requestContext`
- Include modes display correctly
- Similarity scores display correctly
- Modal handles missing `requestContext` gracefully
- Modal handles empty context gracefully
- Performance is acceptable with many context items

**Current State**:
- Desktop app already displays active rules, references, and tools from `ChatState.contextItems` in context panel
- Event-driven updates implemented (no `useMemo` dependencies)
- Modal infrastructure exists (ReferencesModal, RulesModal, ToolsModal as examples)
- `requestContext` is available on assistant messages via `ChatMessage.requestContext`

---

## Implementation Notes

### Backward Compatibility Strategy

**Note**: The implementation took a more aggressive approach than originally planned:
1. **Phase 2**: Removed backward-compatible arrays and getters, updated all consumers immediately
2. **Phase 4**: Made `contextItems` required (not optional), removed old arrays entirely
3. **Migration**: All consumers (desktop app, CLI, MCP clients) updated in same phase

This approach was chosen because:
- All consumers are in the same monorepo and can be updated together
- Cleaner API without redundant fields
- No confusion about which fields to use

### Semantic Search Integration

- ✅ Semantic search is optional (system works without it)
- ✅ If semantic indexer is unavailable, agent mode items are simply not included
- ✅ JIT (Just-In-Time) indexing approach: embeddings generated on-demand via `indexContextItems()`
- ✅ Embeddings stored on items (`Rule.embeddings`, `Reference.embeddings`) and clients (`McpClient.toolEmbeddings`)
- ✅ Model initialization deferred until first semantic search
- ✅ Cache invalidation: clear embeddings when items are updated
- ✅ Search parameters implemented: `topK` (default: 20), `topN` (default: 5), `includeScore` (default: 0.7)
- ⏳ Consider making semantic search configurable per agent (future enhancement)
- ⏳ Consider preset modes (Aggressive, Normal, Conservative) for search parameters (future enhancement)

### Performance Considerations

- Request context building should be fast (avoid blocking message handling)
- Semantic search should be async and non-blocking
- Consider caching embeddings to avoid regeneration

### Testing Strategy

- Each phase should have unit tests
- Integration tests for full flow
- Backward compatibility tests for each phase
- Performance tests for semantic search integration

## Dependencies

- **Phase 5a**: Requires `@xenova/transformers` package and semantic indexer code (extract from `apps/semantic-index`)
- **Phase 5b-5d**: Requires Phase 5a complete
- **Phase 6**: Requires desktop app to be updated (separate from agent-api)

## Risk Mitigation

1. **Breaking Changes**: Each phase maintains backward compatibility
2. **Semantic Search Availability**: System works without semantic search
3. **Performance**: Semantic search is async and can be optimized
4. **Complexity**: Phased approach allows incremental complexity

## Success Criteria

- [x] All context items tracked with include modes
- [x] Request context recorded for each request/response pair
- [x] Semantic search automatically selects relevant agent mode items (Phase 5d)
- [x] Context information accessible via APIs (`ChatState.contextItems`, `ChatMessage.requestContext`)
- [ ] Context information visible in UI with full details (Phase 6)
- [x] All consumers updated to use new API
- [x] Performance is acceptable
- [ ] All tests pass (pending test suite updates)

