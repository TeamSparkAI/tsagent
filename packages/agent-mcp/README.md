# @tsagent/agent-mcp

MCP server for managing TsAgent agents. Provides tools to create, configure, and manage agents including rules, references, tools, providers, and MCP servers.

## Overview

This package provides an MCP server that exposes a comprehensive set of tools for managing TsAgent agents. All tools use an `agentTarget` parameter to identify which agent to operate on (specified as the directory path containing `tsagent.json`).

## Installation

```bash
npm install -g @tsagent/agent-mcp
```

## Usage

```bash
tsagent-agent-mcp [--debug|-d]
```

**Options:**
- `--debug` or `-d`: Enable debug mode for verbose logging

**Note:** Unlike `meta-mcp`, this server doesn't require an agent path at startup. Agents are loaded on-demand when tools are called with an `agentTarget` parameter.

## Available Tools

### Agent Discovery & Lifecycle

- **`agent_list`**: List all available agents. If `basePath` is provided, recursively searches for directories containing `tsagent.json`. Otherwise, returns agents from the internal registry.
- **`agent_get_info`**: Get detailed information about a specific agent
- **`agent_create`**: Create a new agent
- **`agent_delete`**: Delete an agent and all its associated files (requires `confirm: true`)
- **`agent_clone`**: Clone an existing agent to a new location

### Agent Configuration

- **`agent_get_settings`**: Get all settings for an agent (currently returns empty object - agent API doesn't provide a method to retrieve all settings)
- **`agent_set_setting`**: Set a single setting value
- **`agent_get_system_prompt`**: Get the system prompt for an agent
- **`agent_set_system_prompt`**: Set the system prompt for an agent
- **`agent_get_metadata`**: Get agent metadata
- **`agent_update_metadata`**: Update agent metadata

### Rules Management

- **`agent_list_rules`**: List all rules for an agent
- **`agent_get_rule`**: Get a specific rule by name
- **`agent_add_rule`**: Add a new rule to an agent
- **`agent_update_rule`**: Update an existing rule
- **`agent_delete_rule`**: Delete a rule from an agent

### References Management

- **`agent_list_references`**: List all references for an agent
- **`agent_get_reference`**: Get a specific reference by name
- **`agent_add_reference`**: Add a new reference to an agent
- **`agent_update_reference`**: Update an existing reference
- **`agent_delete_reference`**: Delete a reference from an agent

### Tools Management (for Tools Mode Agents)

- **`agent_list_tools`**: List all exported tools for a tools-mode agent
- **`agent_get_tool`**: Get a specific tool by name
- **`agent_add_tool`**: Add a new exported tool to a tools-mode agent
- **`agent_update_tool`**: Update an existing tool
- **`agent_delete_tool`**: Delete a tool from a tools-mode agent

### Provider Management

- **`agent_list_providers`**: List all installed and available providers
- **`agent_get_provider_config`**: Get configuration for a specific provider
- **`agent_install_provider`**: Install and configure a provider
- **`agent_update_provider`**: Update provider configuration
- **`agent_uninstall_provider`**: Uninstall a provider from an agent
- **`agent_validate_provider_config`**: Validate a provider configuration without installing it

### MCP Server Management

- **`agent_list_mcp_servers`**: List all MCP servers configured for an agent
- **`agent_get_mcp_server`**: Get configuration for a specific MCP server
- **`agent_add_mcp_server`**: Add a new MCP server configuration
- **`agent_update_mcp_server`**: Update an existing MCP server configuration
- **`agent_delete_mcp_server`**: Remove an MCP server from an agent

## Agent Target Identification

All tools that operate on an agent require an `agentTarget` parameter. This parameter should be the **directory path** containing the `tsagent.json` file (not including the filename itself).

Examples:
- `./agents/my-agent`
- `/absolute/path/to/agent`
- `../relative/path/to/agent`

The server maintains an internal registry of loaded agents to avoid repeated file I/O. Agents are loaded on-demand when first accessed.

## Agent Metadata vs Settings

**Agent Metadata** (`agent_get_metadata` / `agent_update_metadata`):
- **Purpose**: Describes the agent's identity, capabilities, and mode
- **Contains**: 
  - Identity: `name`, `description`, `version`
  - Presentation: `iconUrl`, `documentationUrl`, `provider` info
  - Mode-specific: `skills` (for autonomous agents), `tools` (for tools mode agents)
  - Timestamps: `created`, `lastAccessed`
- **Usage**: Used to describe what the agent is and what it can do

**Agent Settings** (`agent_get_settings` / `agent_set_setting`):
- **Purpose**: Runtime configuration parameters for agent behavior
- **Contains**:
  - Model settings: `temperature`, `topP`, `mostRecentModel`
  - Conversation limits: `maxChatTurns`, `maxOutputTokens`
  - Context settings: `contextTopK`, `contextTopN`, `contextIncludeScore`
  - UI settings: `theme`
  - Tool permissions: `toolPermission`
- **Usage**: Used to configure how the agent behaves during conversations
- **Note**: `agent_get_settings` currently returns an empty object because the agent API doesn't provide a method to retrieve all settings at once without knowing all possible keys. Use `agent_set_setting` to set individual settings.

## Example Usage

### Creating and Configuring a New Agent

```json
{
  "name": "agent_create",
  "arguments": {
    "agentPath": "./agents/my-new-agent",
    "name": "My New Agent",
    "description": "A helpful assistant",
    "mode": "interactive",
    "initialPrompt": "You are a helpful AI assistant."
  }
}
```

### Adding a Rule to an Agent

```json
{
  "name": "agent_add_rule",
  "arguments": {
    "agentTarget": "./agents/my-agent",
    "rule": {
      "name": "be-polite",
      "description": "Always be polite",
      "text": "Always use polite language and be respectful.",
      "priorityLevel": 1,
      "include": "always"
    }
  }
}
```

### Installing a Provider

```json
{
  "name": "agent_install_provider",
  "arguments": {
    "agentTarget": "./agents/my-agent",
    "providerType": "openai",
    "config": {
      "OPENAI_API_KEY": "op://vault/item/field"
    }
  }
}
```

## Architecture

### BaseMCPServer

This package includes `BaseMCPServer`, a reusable abstract base class for building MCP servers. It handles:
- MCP protocol communication
- Tool registration and routing
- JSON Schema validation of tool arguments
- Error handling and structured responses

Subclasses implement:
- `toolHandlersArray`: Array of tool definitions with co-located handlers
- `serverInfo`: Server name and version
- `serverInstructions`: Server description

See the source code in `src/base-mcp-server.ts` for details on extending it for your own MCP servers.

### Agent Registry

The server maintains an in-memory registry of loaded agents keyed by normalized file paths. This allows:
- Fast access to already-loaded agents
- Lazy loading of agents on first access
- Automatic path normalization

### Error Handling

All tools return structured JSON responses. On error:
```json
{
  "success": false,
  "error": {
    "code": "TOOL_EXECUTION_ERROR",
    "message": "Error description"
  }
}
```

On success, tools return their specific result format.

### Distinction from Agent's Own Tools

This MCP server provides **management tools** (prefixed with `agent_*`) that operate on **other agents**. This is distinct from an agent's own tools (like `add_rule`, `create_reference`) which operate on the agent itself without needing an `agentTarget` parameter.

## Development

### Building

```bash
cd packages/agent-mcp
npm install
npm run build
```

This will compile TypeScript to JavaScript in the `dist/` directory.

### Running Locally

#### Development Mode (with tsx)

```bash
npm run dev
```

#### Production Mode (after building)

```bash
node dist/index.js
```

Or using the binary:
```bash
npm link  # Link the package globally (if you want)
tsagent-agent-mcp
```

### Testing with MCP Clients

#### Using Claude Desktop

1. **Build the package:**
   ```bash
   cd packages/agent-mcp
   npm run build
   ```

2. **Create or update your Claude Desktop MCP config** (usually at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

   ```json
   {
     "mcpServers": {
       "agent-management": {
         "command": "node",
         "args": [
           "/absolute/path/to/tsagent/packages/agent-mcp/dist/index.js"
         ]
       }
     }
   }
   ```

3. **Restart Claude Desktop** to load the new MCP server

4. **Test the tools** - The agent management tools should now be available in Claude Desktop

#### Using MCP Inspector

You can use the MCP Inspector to test the server:

```bash
# Install MCP Inspector globally
npm install -g @modelcontextprotocol/inspector

# Run the inspector with the agent-mcp server
npx @modelcontextprotocol/inspector \
  node /path/to/tsagent/packages/agent-mcp/dist/index.js
```

## Troubleshooting

- **"Failed to load agent" error**: Make sure the agent path is correct and the agent exists
- **"Agent is not in tools mode"**: Some tools (like tool management) only work for agents in "tools" mode
- **Build errors**: Make sure `@tsagent/core` is built first:
  ```bash
  cd ../agent-api
  npm run build
  cd ../agent-mcp
  npm install ../agent-api  # Link local package
  npm run build
  ```

## Related Documentation

- [Agent Management MCP Design](../docs/agent-management-mcp-design.md) - Full design document
- [TsAgent Core API](../agent-api/README.md) - Core agent API documentation

