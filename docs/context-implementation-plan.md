# Context Management Implementation Plan

This document outlines a phased implementation plan for the context tracking system described in `context.md`. The plan is designed to be incremental, with each phase delivering value and being independently testable.

## Implementation Status

**Completed Phases**: 1, 2, 3, 4  
**Remaining Phases**: 5, 6

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

### ⏳ Phase 5: Semantic Search Integration
**Status**: PENDING  
**Goal**: Integrate semantic search to automatically select agent mode items for each request.

**Prerequisites**:
- Semantic indexer from `apps/semantic-index` must be available as a package or integrated
- Agent must have access to semantic indexer instance

**Tasks**:
1. Create semantic search function:
   - Takes user message, agent, and session
   - Uses semantic indexer to search for relevant rules, references, and tools
   - Returns `RequestContextItem[]` with `includeMode: 'agent'` and `similarityScore`
   - Only searches items with `include: 'agent'` that are NOT in session context
2. Update `buildRequestContext()`:
   - Add semantic search step (if semantic search is available)
   - Merge agent-selected items into request context
   - Ensure no duplicates (agent items already in session context are excluded)
3. Update `handleMessage()`:
   - Pass semantic search function to `buildRequestContext()` (if available)
   - Handle optional semantic search gracefully (works without it)

**Deliverables**:
- Agent mode items automatically selected via semantic search
- Similarity scores recorded in request context
- Works with or without semantic search enabled

**Testing**:
- Agent mode items are selected based on query relevance
- Similarity scores are recorded correctly
- No duplicates between session context and agent-selected items
- System works when semantic search is unavailable

**Current State**:
- `getAgentModeItems()` helper function already exists (prepared for this phase)
- `buildRequestContext()` is ready to integrate semantic search results

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
   - Display similarity scores for agent-selected items (when Phase 5 is complete)
   - Show item names and descriptions (similar to context panel)
   - Group items by type (Rules, References, Tools) in separate columns
3. Modal content structure:
   - Three-column layout matching context panel
   - Each column shows one type (Rules, References, Tools)
   - Each item displays:
     - Include mode badge (Always/Manual/Agent)
     - Item name
     - Similarity score (if agent mode and Phase 5 complete)
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
- Similarity scores display correctly (when Phase 5 complete)
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

- Semantic search should be optional (system works without it)
- If semantic indexer is unavailable, agent mode items are simply not included
- Consider making semantic search configurable per agent

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

- **Phase 5**: Requires semantic indexer to be available as a package or integrated
- **Phase 6**: Requires desktop app to be updated (separate from agent-api)

## Risk Mitigation

1. **Breaking Changes**: Each phase maintains backward compatibility
2. **Semantic Search Availability**: System works without semantic search
3. **Performance**: Semantic search is async and can be optimized
4. **Complexity**: Phased approach allows incremental complexity

## Success Criteria

- [x] All context items tracked with include modes
- [x] Request context recorded for each request/response pair
- [ ] Semantic search automatically selects relevant agent mode items (Phase 5)
- [x] Context information accessible via APIs (`ChatState.contextItems`, `ChatMessage.requestContext`)
- [ ] Context information visible in UI with full details (Phase 6)
- [x] All consumers updated to use new API
- [x] Performance is acceptable
- [ ] All tests pass (pending test suite updates)

