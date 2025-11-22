# Agent Management MCP Server Design

## Overview

This document describes the design for an MCP server that provides tools to create, configure, and manage TsAgent agents using the agent core API. This server enables external tools (like other agents or management interfaces) to programmatically shape and configure agents.

**Implementation**: This design is implemented in the `@tsagent/agent-mcp` package.

## Objectives

1. **Agent Lifecycle Management**: Create, load, delete, and list agents
2. **Agent Configuration**: Modify agent settings, system prompts, and metadata
3. **Rules Management**: Create, read, update, and delete rules for target agents
4. **References Management**: Create, read, update, and delete references for target agents
5. **Tools Management**: Export and manage tools for agents in "tools" mode
6. **Provider Management**: Install, configure, and manage LLM providers for agents
7. **MCP Server Management**: Configure MCP servers that agents connect to
8. **Clear Target Identification**: Distinguish between managing external agents vs. an agent managing itself

## Key Design Principle: Target Agent Identification

### The Problem

There's a critical distinction between:
- **Agent's own tools**: Tools that an agent uses to modify its own rules/references (self-modification)
- **Management tools**: Tools that operate on other agents (external management)

### The Solution: Explicit Agent Target Parameter

Every tool that operates on an agent must include an **`agentTarget`** parameter that identifies which agent to operate on. This parameter can be specified as:

1. **Agent Path** (string): The file system path to the agent directory
   - Example: `"./agents/my-agent"` or `"/absolute/path/to/agent"`
   - Most reliable for file-based agents
   
2. **Agent ID** (string): The unique identifier of the agent
   - Example: `"agent-123"` or `"my-agent-id"`
   - Useful when agents are loaded in memory or managed by a registry

3. **Agent Name** (string): The human-readable name of the agent
   - Example: `"My Assistant"`
   - Less reliable (names can change), but user-friendly

### Tool Naming Convention

To clearly distinguish management tools from an agent's own tools, all management tools use a prefix pattern:

- **Management tools**: `agent_*` prefix (e.g., `agent_create`, `agent_add_rule`)
- **Agent's own tools**: No prefix or different prefix (e.g., `add_rule`, `create_reference`)

This makes it immediately clear in tool listings which tools are for managing other agents vs. managing the current agent.

## Tool Categories

### 1. Agent Discovery & Lifecycle

#### `agent_list`
List all available agents in the system.

**Parameters:**
- `basePath?` (string, optional): Base directory to search for agents. If not provided, returns agents from the in-memory registry (empty list if no agents have been loaded).

**Returns:**
```typescript
{
  agents: Array<{
    id: string;
    name: string;
    path: string;
    description?: string;
    mode: 'interactive' | 'autonomous' | 'tools';
    metadata: AgentMetadata;
  }>;
  count: number;
}
```

#### `agent_get_info`
Get detailed information about a specific agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name

**Returns:**
```typescript
{
  id: string;
  name: string;
  path: string;
  description?: string;
  mode: 'interactive' | 'autonomous' | 'tools';
  metadata: AgentMetadata;
  settings: Record<string, string>;
  installedProviders: string[];
  mcpServerCount: number;
  ruleCount: number;
  referenceCount: number;
  toolCount?: number; // For tools mode agents
}
```

#### `agent_create`
Create a new agent.

**Parameters:**
- `agentPath` (string, required): File system path where agent should be created
- `name` (string, required): Agent name
- `description?` (string, optional): Agent description
- `mode?` ('interactive' | 'autonomous' | 'tools', optional): Agent mode. Defaults to 'interactive'
- `initialSettings?` (Record<string, string>, optional): Initial settings
- `initialPrompt?` (string, optional): Initial system prompt

**Returns:**
```typescript
{
  success: boolean;
  agentId: string;
  agentPath: string;
  message?: string;
}
```

#### `agent_delete`
Delete an agent and all its associated files.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `confirm` (boolean, required): Confirmation flag (safety measure). Must be `true` to proceed with deletion.

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

#### `agent_clone`
Clone an existing agent to a new location.

**Parameters:**
- `sourceAgent` (string, required): Source agent path, ID, or name
- `targetPath` (string, required): Target path for cloned agent
- `newName?` (string, optional): New name for cloned agent

**Returns:**
```typescript
{
  success: boolean;
  agentId: string;
  agentPath: string;
  message?: string;
}
```

### 2. Agent Configuration

#### `agent_get_settings`
Get all settings for an agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name

**Returns:**
```typescript
{
  settings: Record<string, string>; // Currently returns empty object as agent API doesn't provide a method to get all settings
}
```

**Note**: Currently returns an empty object. The agent API doesn't provide a method to retrieve all settings at once without knowing all possible keys.

#### `agent_set_setting`
Set a single setting value.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `key` (string, required): Setting key
- `value` (string, required): Setting value

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

#### `agent_get_system_prompt`
Get the system prompt for an agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name

**Returns:**
```typescript
{
  prompt: string;
}
```

#### `agent_set_system_prompt`
Set the system prompt for an agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `prompt` (string, required): New system prompt

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

#### `agent_get_metadata`
Get agent metadata.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name

**Returns:**
```typescript
{
  metadata: AgentMetadata;
}
```

#### `agent_update_metadata`
Update agent metadata.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `metadata` (Partial<AgentMetadata>, required): Metadata updates

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

### 3. Rules Management

#### `agent_list_rules`
List all rules for an agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name

**Returns:**
```typescript
{
  rules: Rule[];
  count: number;
}
```

#### `agent_get_rule`
Get a specific rule by name.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `ruleName` (string, required): Name of the rule

**Returns:**
```typescript
{
  rule: Rule | null;
}
```

#### `agent_add_rule`
Add a new rule to an agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `rule` (Rule, required): Rule object with name, description, text, priorityLevel, include mode

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

#### `agent_update_rule`
Update an existing rule.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `ruleName` (string, required): Name of the rule to update
- `rule` (Partial<Rule>, required): Rule updates

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

#### `agent_delete_rule`
Delete a rule from an agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `ruleName` (string, required): Name of the rule to delete

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

### 4. References Management

#### `agent_list_references`
List all references for an agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name

**Returns:**
```typescript
{
  references: Reference[];
  count: number;
}
```

#### `agent_get_reference`
Get a specific reference by name.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `referenceName` (string, required): Name of the reference

**Returns:**
```typescript
{
  reference: Reference | null;
}
```

#### `agent_add_reference`
Add a new reference to an agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `reference` (Reference, required): Reference object with name, description, text, priorityLevel, include mode

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

#### `agent_update_reference`
Update an existing reference.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `referenceName` (string, required): Name of the reference to update
- `reference` (Partial<Reference>, required): Reference updates

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

#### `agent_delete_reference`
Delete a reference from an agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `referenceName` (string, required): Name of the reference to delete

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

### 5. Tools Management (for Tools Mode Agents)

#### `agent_list_tools`
List all exported tools for a tools-mode agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name

**Returns:**
```typescript
{
  tools: AgentTool[];
  count: number;
}
```

#### `agent_get_tool`
Get a specific tool by name.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `toolName` (string, required): Name of the tool

**Returns:**
```typescript
{
  tool: AgentTool | null;
}
```

#### `agent_add_tool`
Add a new exported tool to a tools-mode agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `tool` (AgentTool, required): Tool definition with name, description, parameters (JSON Schema), and prompt template

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

#### `agent_update_tool`
Update an existing tool.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `toolName` (string, required): Name of the tool to update
- `tool` (Partial<AgentTool>, required): Tool updates

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

#### `agent_delete_tool`
Delete a tool from a tools-mode agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `toolName` (string, required): Name of the tool to delete

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

### 6. Provider Management

#### `agent_list_providers`
List all installed providers for an agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name

**Returns:**
```typescript
{
  installed: string[];
  available: string[];
  providerInfo: Record<string, ProviderInfo>;
}
```

#### `agent_get_provider_config`
Get configuration for a specific provider.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `providerType` (string, required): Provider type (e.g., 'openai', 'anthropic')

**Returns:**
```typescript
{
  installed: boolean;
  config: Record<string, string> | null;
  resolvedConfig?: Record<string, string> | null; // With secrets resolved
}
```

#### `agent_install_provider`
Install and configure a provider.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `providerType` (string, required): Provider type
- `config` (Record<string, string>, required): Provider configuration (may include secret references)

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

#### `agent_update_provider`
Update provider configuration.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `providerType` (string, required): Provider type
- `config` (Record<string, string>, required): Updated configuration

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

#### `agent_uninstall_provider`
Uninstall a provider from an agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `providerType` (string, required): Provider type to uninstall

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

#### `agent_validate_provider_config`
Validate a provider configuration without installing it.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `providerType` (string, required): Provider type
- `config` (Record<string, string>, required): Configuration to validate

**Returns:**
```typescript
{
  isValid: boolean;
  error?: string;
}
```

### 7. MCP Server Management

#### `agent_list_mcp_servers`
List all MCP servers configured for an agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name

**Returns:**
```typescript
{
  servers: Record<string, McpConfig>;
  count: number;
}
```

#### `agent_get_mcp_server`
Get configuration for a specific MCP server.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `serverName` (string, required): Name of the MCP server

**Returns:**
```typescript
{
  server: McpConfig | null;
}
```

#### `agent_add_mcp_server`
Add a new MCP server configuration.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `serverName` (string, required): Name for the MCP server
- `config` (McpConfig, required): MCP server configuration (type, command, args, url, headers, etc.)

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

**Note**: If a server with the same name already exists, this will return an error. Use `agent_update_mcp_server` to update an existing server.

#### `agent_update_mcp_server`
Update an existing MCP server configuration.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `serverName` (string, required): Name of the MCP server to update
- `config` (McpConfig, required): Updated MCP server configuration (type, command, args, url, headers, etc.)

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

**Note**: If the server doesn't exist, this will return an error. Use `agent_add_mcp_server` to create a new server.

#### `agent_delete_mcp_server`
Remove an MCP server from an agent.

**Parameters:**
- `agentTarget` (string, required): Agent path, ID, or name
- `serverName` (string, required): Name of the MCP server to remove

**Returns:**
```typescript
{
  success: boolean;
  message?: string;
}
```

## Agent Target Resolution

The MCP server needs to resolve `agentTarget` parameters to actual `Agent` instances. This requires:

1. **Agent Registry**: Maintain a registry of loaded agents keyed by:
   - Path (most reliable)
   - ID (if available)
   - Name (fallback, less reliable)

2. **Lazy Loading**: If an agent isn't loaded, load it on-demand using `loadAgent(path, logger)`

3. **Path Resolution**: 
   - If `agentTarget` is a relative path, resolve against a configured base directory
   - If `agentTarget` is an absolute path, use it directly
   - If `agentTarget` is an ID or name, look up in registry

4. **Error Handling**: Return clear errors when:
   - Agent not found
   - Agent path is invalid
   - Agent cannot be loaded

## Distinction from Agent's Own Tools

### Agent's Own Tools (Self-Modification)

When an agent uses tools to modify itself, those tools would be:
- Named without the `agent_*` prefix (e.g., `add_rule`, `create_reference`)
- Operate on the agent's own state (no `agentTarget` parameter needed)
- Available through the agent's own MCP client tools or session context

Example: An agent might have a tool called `add_rule` that adds a rule to itself:
```typescript
{
  name: "add_rule",
  description: "Add a rule to my knowledge base",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      text: { type: "string" },
      // ... no agentTarget needed
    }
  }
}
```

### Management Tools (External Modification)

The MCP server tools use:
- `agent_*` prefix to clearly indicate they manage other agents
- `agentTarget` parameter to specify which agent to operate on
- Can operate on any agent, not just the current one

Example: The management tool `agent_add_rule`:
```typescript
{
  name: "agent_add_rule",
  description: "Add a rule to a target agent",
  parameters: {
    type: "object",
    properties: {
      agentTarget: { 
        type: "string",
        description: "Agent path, ID, or name"
      },
      rule: { 
        type: "object",
        // Rule definition
      }
    }
  }
}
```

## Implementation Considerations

### 1. Agent Lifecycle Management

- The MCP server should maintain a cache of loaded agents to avoid repeated file I/O
- Implement agent unloading/cleanup when not in use
- Handle concurrent access to agents (read-only operations can be concurrent, writes need locking)

### 2. Error Handling

All tools should return structured error responses:
```typescript
{
  success: false,
  error: {
    code: string; // e.g., "AGENT_NOT_FOUND", "INVALID_CONFIGURATION"
    message: string;
    details?: any;
  }
}
```

### 3. Validation

- Validate agent mode before allowing mode-specific operations (e.g., tools management only for "tools" mode)
- Validate rule/reference/tool names for uniqueness and format
- Validate provider configurations before installation

### 4. Security Considerations

- Consider access control: should all agents be manageable, or only certain ones?
- Validate file paths to prevent directory traversal attacks
- Sanitize user inputs before file operations

### 5. Performance

- Batch operations where possible (e.g., `agent_list_rules` returns all rules at once)
- Cache agent metadata to avoid repeated loads
- Use async operations throughout

## Example Usage Scenarios

### Scenario 1: Creating and Configuring a New Agent

```typescript
// 1. Create agent
await callTool('agent_create', {
  agentPath: './agents/my-new-agent',
  name: 'My New Agent',
  description: 'A helpful assistant',
  mode: 'interactive'
});

// 2. Set system prompt
await callTool('agent_set_system_prompt', {
  agentTarget: './agents/my-new-agent',
  prompt: 'You are a helpful assistant...'
});

// 3. Add a rule
await callTool('agent_add_rule', {
  agentTarget: './agents/my-new-agent',
  rule: {
    name: 'be-polite',
    description: 'Always be polite',
    text: 'Always use polite language...',
    priorityLevel: 1,
    include: 'always'
  }
});

// 4. Install a provider
await callTool('agent_install_provider', {
  agentTarget: './agents/my-new-agent',
  providerType: 'openai',
  config: {
    OPENAI_API_KEY: 'op://vault/item/field'
  }
});
```

### Scenario 2: Agent Modifying Another Agent

An agent (Agent A) uses the management MCP server to configure another agent (Agent B):

```typescript
// Agent A calls management tool
await callTool('agent_add_reference', {
  agentTarget: './agents/agent-b',
  reference: {
    name: 'api-docs',
    description: 'API documentation',
    text: '...',
    priorityLevel: 1,
    include: 'manual'
  }
});
```

### Scenario 3: Agent Modifying Itself

Agent A uses its own tools (not the management server) to modify itself:

```typescript
// Agent A calls its own tool (no agentTarget needed)
await callTool('add_reference', {
  reference: {
    name: 'api-docs',
    // ...
  }
});
```

## Future Enhancements

1. **Bulk Operations**: Tools for batch operations (e.g., `agent_bulk_add_rules`)
2. **Agent Templates**: Create agents from templates
3. **Agent Validation**: Validate agent configuration completeness
4. **Agent Migration**: Tools for migrating agents between versions
5. **Agent Backup/Restore**: Export and import agent configurations
6. **Agent Analytics**: Get usage statistics and metrics for agents

