# Tool Context Management

## Overview

Tool context management provides fine-grained control over which tools are available to agents during conversations. This system replaces the existing `enabled/disabled` tool configuration with a more flexible context-based approach that aligns with the rules and references system.

**Migration from Enabled/Disabled System:**
- The current `enabled/disabled` tool configuration is being replaced with include modes (same as rules/references)
- `enabled: true` becomes `include: 'always'`
- `enabled: false` becomes `include: 'manual'` (available but not in context)
- New `include: 'agent'` provides dynamic tool loading (agent decides when to load)

## Implementation Status

### ✅ **COMPLETED**

#### **Phase 1: Core Type System & ChatSession Integration**
- ✅ **Type System Migration** - Replaced `toolEnabled` with `toolInclude` throughout codebase
- ✅ **ChatSession Interface** - Added `addTool()`, `removeTool()`, `getIncludedTools()` methods
- ✅ **Session Implementation** - All methods implemented with validation, error handling, logging
- ✅ **Provider Integration** - `getIncludedTools()` filters tools based on session context
- ✅ **Auto-initialization** - "Always" include tools automatically loaded on session creation

#### **Phase 2: Internal Tools MCP Server**
- ✅ **McpClientInternalTools** - All placeholder methods implemented in `client-tools.ts`
- ✅ **Session Integration** - All methods access `ChatSession` via `session` parameter
- ✅ **Tool Management** - `listTools()`, `getTool()`, `includeTool()`, `excludeTool()`, etc.
- ✅ **Server Management** - `listToolServers()`, `includeToolServer()`, `excludeToolServer()`, etc.
- ✅ **Configuration Updates** - `saveMcpServer()` calls to persist tool include mode changes
- ✅ **Error Handling** - Comprehensive error handling and validation
- ✅ **Build Verification** - All code compiles successfully with no linting errors

#### **Desktop App UX Updates**
- ✅ **UI Terminology** - Updated from "Tool Enabled" to "Tool Include"
- ✅ **Dropdown Options** - "Always", "Manual", "Agent" (matching rules/references)
- ✅ **Internal Server Support** - Added `'tools'` to internal tool dropdown (installable via UX like `rules`, `references`, `supervision`)

#### **Phase 3: Desktop App IPC Integration & Enhanced UX**
- ✅ **IPC Handlers** - Added `chat:add-tool` and `chat:remove-tool` handlers in main process
- ✅ **Preload API** - Added `addChatTool` and `removeChatTool` methods to preload API
- ✅ **Shared API Interface** - Added tool context methods to shared API interface
- ✅ **ChatAPI Integration** - Added `getActiveTools`, `addTool`, `removeTool` methods to ChatAPI
- ✅ **Enhanced Session Panel** - 3-column read-only view showing active rules/references/tools
- ✅ **Edit Buttons** - Added "Edit" buttons for each context type (References, Rules, Tools)
- ✅ **Separate Modals** - Created dedicated modals for each context type (ReferencesModal, RulesModal, ToolsModal)
- ✅ **Context Refresh** - Implemented callback system to refresh context data after changes
- ✅ **Tool Initialization** - Fixed tool initialization timing with preloading during agent startup
- ✅ **Synchronous Session Creation** - Session constructor now populates tools array synchronously
- ✅ **MCP Client Preloading** - Added `preloadMcpClients()` method to load clients during agent initialization
- ✅ **Synchronous Client Access** - Added `getAllMcpClientsSync()` for synchronous access to preloaded clients
- ✅ **Session Tool Population** - Session constructor synchronously populates tools array with "always" tools

**Final UX Design:**
- **Session Panel**: Read-only 3-column list showing rules/references/tools currently in context
- **Edit Buttons**: Each column has an "Edit" button to open dedicated management modal
- **Separate Modals**: ReferencesModal, RulesModal, and ToolsModal for managing each context type
- **Context Refresh**: Automatic refresh of session panel after modal changes
- **Tool Availability**: Tools are available immediately when session is created (no timing issues)

**Files Modified:**
- `apps/desktop/src/main/main.ts` - Added IPC handlers for tool context
- `apps/desktop/src/preload/preload.ts` - Added tool context methods to API
- `apps/desktop/src/shared/api.ts` - Added tool context methods to API interface
- `apps/desktop/src/renderer/api/ChatAPI.ts` - Added tool context methods
- `apps/desktop/src/renderer/components/ChatTab.tsx` - Enhanced session panel with 3-column layout
- `apps/desktop/src/renderer/components/ReferencesModal.tsx` - New dedicated references modal
- `apps/desktop/src/renderer/components/RulesModal.tsx` - New dedicated rules modal
- `apps/desktop/src/renderer/components/ToolsModal.tsx` - New dedicated tools modal
- `apps/desktop/src/renderer/components/Modal.css` - Styling for new modals
- `apps/desktop/src/renderer/components/ChatTab.css` - Styling for session panel
- `packages/agent-api/src/core/agent-api.ts` - Added MCP client preloading
- `packages/agent-api/src/core/chat-session.ts` - Added synchronous tool initialization
- `packages/agent-api/src/mcp/client-manager.ts` - Added synchronous client access
- `packages/agent-api/src/mcp/types.ts` - Added synchronous client interface

## Technical Implementation Details

### Tool Initialization Architecture

The tool initialization system ensures that tools are available immediately when a chat session is created, maintaining the contract that sessions are ready to use when returned from the API.

**Key Components:**

1. **Agent Preloading** (`packages/agent-api/src/core/agent-api.ts`):
   - `preloadMcpClients()` method loads all MCP clients during agent initialization
   - Called in `load()` method after loading rules/references
   - Ensures clients are ready before any sessions are created

2. **Synchronous Client Access** (`packages/agent-api/src/mcp/client-manager.ts`):
   - `getAllMcpClientsSync()` provides synchronous access to preloaded clients
   - No async operations needed when accessing client data
   - Maintains performance for session creation

3. **Session Tool Population** (`packages/agent-api/src/core/chat-session.ts`):
   - `initializeAlwaysIncludeTools()` method in session constructor
   - Synchronously populates session's `tools` array with "always" include tools
   - Uses preloaded client data for immediate availability

**Flow:**
1. Agent loads → MCP clients preloaded during `agent.load()`
2. Session created → Constructor synchronously populates `tools` array
3. UI displays → Tools immediately available in session panel
4. No timing issues → Everything ready when session is created

### Desktop App UX Architecture

The desktop app implements a clean separation between read-only session overview and management interfaces.

**Session Panel** (`apps/desktop/src/renderer/components/ChatTab.tsx`):
- 3-column read-only layout showing active rules/references/tools
- "Edit" buttons for each context type
- Automatic refresh after modal changes via callback system

**Management Modals**:
- `ReferencesModal.tsx` - Dedicated references management
- `RulesModal.tsx` - Dedicated rules management  
- `ToolsModal.tsx` - Dedicated tools management
- Each modal handles its own context type with full add/remove functionality

**Context Refresh System**:
- Modals call `onContextChange` callback after changes
- Parent component refreshes context data from session state
- UI automatically updates to reflect changes

### 🔄 **REMAINING TASKS**

#### **Phase 4: CLI Support**
*Priority: Low - User experience*

**Goal:** Add CLI commands for managing tool context, parallel to existing rules and references CLI commands.

**What to implement:**
```bash
# List tools in current session context (parallel to rules/references list commands)
tsagent tools list

# Include/exclude tools in current session (parallel to rules/references include/exclude commands)
tsagent tools include --server database-server --tool database_query
tsagent tools exclude --server database-server --tool database_query

# Set include modes for agent configuration (parallel to rules/references set-mode commands)
tsagent tools set-mode --server database-server --mode manual
tsagent tools set-mode --server database-server --tool database_query --mode agent
```

**Files to create/modify:**
- `apps/cli/src/commands/tools.ts` - New CLI commands (following rules/references pattern)
- `apps/cli/src/commands/index.ts` - Register new commands

#### **Phase 5: Testing and Validation**
*Priority: Medium - Quality assurance*

**Goal:** Ensure tool context management works correctly across all scenarios.

**Test scenarios:**
1. **Basic functionality:** Tools can be included/excluded from context
2. **Include modes:** `always`, `manual`, `agent` modes work correctly
3. **Server vs tool level:** Server defaults and tool overrides work
4. **Session persistence:** Tool context persists across messages
5. **Agent requests:** Agent-controlled tool loading works
6. **Error handling:** Graceful handling of invalid tool/server names

**Files to create:**
- `packages/agent-api/src/tests/tool-context.test.ts` - Unit tests
- `packages/agent-api/src/examples/tool-context-example.ts` - Usage examples

## Key Concepts

### Include Modes

Tools can operate in three different include modes (same as rules and references):

- **`always`**: Tool is always available and loaded
- **`manual`**: Tool is available but must be explicitly included in context
- **`agent`**: Tool is loaded dynamically when the agent requests it

### Server vs. Tool Level Control

- **Server Level**: Manage entire tool servers and set defaults for all tools in that server
- **Tool Level**: Fine-grained control over individual tools, with ability to override server defaults

## Configuration

### Server Configuration

```typescript
interface ToolServerConfig {
  name: string;
  enabled: boolean;
  defaultInclude: 'always' | 'manual' | 'agent';
  tools?: Record<string, 'always' | 'manual' | 'agent'>;
}
```

### Tool Configuration

```typescript
interface ToolConfig {
  name: string;
  include: 'always' | 'manual' | 'agent';
  serverDefault?: 'always' | 'manual' | 'agent';
}
```

## Internal Tools MCP Server

The internal tools MCP server provides agents with access to tool context management functionality through a set of tools:

### Tool Listing and Inspection
- `listTools` - List all available tools from all servers
- `getTool` - Get specific tool details
- `listContextTools` - List tools currently in context

### Tool-Level Context Management
- `includeTool` - Include tool in context
- `excludeTool` - Exclude tool from context
- `setToolIncludeMode` - Set tool include mode

### Server-Level Context Management
- `listToolServers` - List all available tool servers
- `getToolServer` - Get server information
- `setServerIncludeMode` - Set server include mode
- `includeToolServer` - Include entire server in context
- `excludeToolServer` - Exclude entire server from context

## Usage Examples

### Basic Tool Context Management

```typescript
// Include a tool in context
await session.addTool('database-server', 'database_query');

// Remove a tool from context
session.removeTool('database-server', 'database_query');

// Get current tool context
const includedTools = session.getIncludedTools();
```

### Using Internal Tools MCP Server

```typescript
// List all available tools
const allTools = await mcpClient.callTool('listTools');

// Include a tool in context
await mcpClient.callTool('includeTool', { 
  serverName: 'database-server', 
  toolName: 'database_query' 
});

// Set tool include mode
await mcpClient.callTool('setToolIncludeMode', { 
  serverName: 'database-server', 
  toolName: 'database_query', 
  mode: 'manual' 
});
```

## Migration Guide

### From Enabled/Disabled to Include Modes

1. **Update server configurations:**
   ```typescript
   // Old
   { enabled: true } → { include: 'always' }
   { enabled: false } → { include: 'manual' }
   ```

2. **Update tool configurations:**
   ```typescript
   // Old
   { enabled: true } → { include: 'always' }
   { enabled: false } → { include: 'manual' }
   ```

3. **Update UI components:**
   - Change "Tool Enabled" to "Tool Include"
   - Update dropdown options to "Always", "Manual", "Agent"
   - Update server default settings to use include modes

### Backward Compatibility

The system maintains backward compatibility during the transition:
- Old `enabled: true` configurations are treated as `include: 'always'`
- Old `enabled: false` configurations are treated as `include: 'manual'`
- New `include: 'agent'` mode provides dynamic tool loading
