# Tool Context Management

## Overview

Tool context management provides fine-grained control over which tools are available to agents during conversations. This system uses include modes (same as rules and references) to control tool availability, allowing for flexible tool management at both the server and individual tool level.

## Key Concepts

### Include Modes

Tools can operate in three different include modes:

- **`always`**: Tool is always available and automatically loaded in every session
- **`manual`**: Tool is available but must be explicitly included in session context
- **`agent`**: Tool is loaded dynamically when the agent decides it's needed

### Server vs. Tool Level Control

- **Server Level**: Set default behavior for all tools in a server
- **Tool Level**: Override server defaults for individual tools with fine-grained control

### Effective Include Mode

A tool's effective include mode is determined by checking:
1. Tool-specific include mode (if set)
2. Server default include mode
3. Default fallback to `always`

## Architecture

### Tool Initialization

Tools are initialized during agent startup to ensure they're ready when sessions are created:

1. **Agent Preloading**: All MCP clients are preloaded during agent initialization
2. **Session Tool Population**: Session constructor synchronously populates tools array with "always" include tools
3. **Immediate Availability**: Tools are available immediately when session is created

This design ensures that sessions are ready to use when returned from the API, with no timing issues or async initialization delays.

### Session Context

Each chat session maintains its own context of included tools:

- Tools with `include: 'always'` are automatically added to the session
- Tools with `include: 'manual'` must be explicitly added/removed
- Tools with `include: 'agent'` are managed dynamically by the agent

## User Interfaces

### Desktop App

The desktop app provides a unified interface for managing session context.

**Session Panel**:
- 3-column read-only display showing active rules, references, and tools
- Tools grouped by server with collapsible sections
- Tool count display showing "(x of y tools)" or "(all x tools)"
- "Edit" buttons for each context type

**Management Modals**:
- Separate modals for managing each context type (References, Rules, Tools)
- Each modal includes a subtitle explaining session context management
- Tools modal features:
  - Hierarchical display grouped by server
  - Collapsible server sections
  - "Add All" / "Remove All" buttons per server for bulk operations
  - Individual tool add/remove functionality

### CLI

The CLI provides commands for managing session context:

```bash
# Rules - Include/exclude from session context
/rules                          # List all rules (with context indicators)
/rules include <rule-name>      # Include rule in current session context
/rules exclude <rule-name>      # Exclude rule from current session context

# References - Include/exclude from session context  
/references                     # List all references (with context indicators)
/references include <reference-name>  # Include reference in current session context
/references exclude <reference-name>  # Exclude reference from current session context

# Tools - Include/exclude from session context
/tools                          # List all tools (with context indicators)
/tools include --server <server-name> --tool <tool-name>      # Include tool in context
/tools include --server <server-name>                          # Include all tools for server
/tools exclude --server <server-name> --tool <tool-name>      # Exclude tool from context
/tools exclude --server <server-name>                          # Exclude all tools for server
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

### Programmatic Usage

```typescript
// Include a tool in context
await session.addTool('database-server', 'database_query');

// Remove a tool from context
session.removeTool('database-server', 'database_query');

// Get current tool context
const includedTools = session.getIncludedTools();

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

### Configuration

Tools are configured in the agent's MCP server configuration:

```typescript
interface ServerConfig {
  name: string;
  toolInclude?: {
    serverDefault?: 'always' | 'manual' | 'agent';
    tools?: Record<string, 'always' | 'manual' | 'agent'>;
  };
}
```

**Configuration Examples:**

```typescript
// Server with all tools always included
{
  name: 'database-server',
  toolInclude: {
    serverDefault: 'always'
  }
}

// Server with manual control, but one tool always included
{
  name: 'code-server',
  toolInclude: {
    serverDefault: 'manual',
    tools: {
      'read_file': 'always'
    }
  }
}

// Server with agent-controlled tools
{
  name: 'web-server',
  toolInclude: {
    serverDefault: 'agent'
  }
}
```

## How It Works

1. **Agent Initialization**: All MCP clients are preloaded during agent startup
2. **Session Creation**: Session constructor automatically includes tools with `include: 'always'`
3. **Manual Management**: Users can add/remove tools with `include: 'manual'`
4. **Agent Management**: Tools with `include: 'agent'` are managed dynamically by the agent
5. **Context Filtering**: Only tools in the session context are provided to the LLM

This ensures that:
- Sessions are ready to use immediately when created
- Tool availability is clearly controlled and predictable
- The agent only sees tools that are in context
- Both manual and automatic tool management are supported
Implement