# Meta Agent Design & Implementation Plan

## Overview

This document outlines the design and implementation plan for exposing an Agent as an MCP server with a "cognitive layer" - a new "Tools" agent mode that allows agents to be accessed via MCP with dynamically defined tools.

## Agent Mode Changes

### Current Agent Modes
- **Interactive**: Chat-based user interaction
- **Autonomous**: Agent-to-agent (A2A) with skills definition

### New Agent Mode
- **Tools**: MCP server exposing agent capabilities as tools

**Final Agent Mode List:**
- Interactive (Chat)
- Autonomous (A2A)
- Tools (MCP)

## Agent Metadata Structure

### MCP Server Metadata
Tools agents will use existing agent metadata to provide MCP server information:

```json
{
  "serverInfo": {
    "name": "Server Name",
    "version": "1.0.0"
  },
  "instructions": "Server Description"
}
```

**Mapping:**
- `serverInfo.name` ← `agent.metadata.name`
- `serverInfo.version` ← `agent.metadata.version`
- `instructions` ← `agent.metadata.description`

### Tool Definition Structure

Tools agents will define tools similar to how Autonomous agents define skills. Each tool contains:

1. **Tool Description**: JSON Schema fields used in MCP client/server tool descriptions
2. **Prompt Template**: How tool parameters map to a prompt for the agent

**Tool Definition Format:**
```json
{
  "name": "book_flight",
  "description": "Books a flight ticket for a user.",
  "parameters": {
    "type": "object",
    "properties": {
      "destination": {
        "type": "string",
        "description": "The destination city and country (e.g., 'Paris, France')."
      },
      "departure_date": {
        "type": "string",
        "description": "The desired date of departure, in YYYY-MM-DD format."
      }
    },
    "required": [
      "destination",
      "departure_date"
    ]
  },
  "prompt": "The user wants to book a flight to {destination} on {departure_date}, please book accordingly"
}
```

**Prompt Template Syntax:**
- Use `{}` to reference tool object properties or call parameters
- Examples:
  - `{name}` - tool name
  - `{param1}` - parameter value from tool call
  - `{destination}` - parameter value from call args

## TypeScript Type Definitions

### JSON Schema Types

Since Zod types are inadequate and JSONSchema7 is non-discriminated, we'll define our own TypeScript discriminated union types for tool parameters:

```typescript
// Shared base for all schemas
type SchemaBase = {
  title?: string;
  description?: string;
};

// String
type StringSchema = SchemaBase & {
  type: 'string';
  enum?: string[];
  default?: string;
  examples?: string[];
  minLength?: number;
  maxLength?: number;
};

// Number | Integer (single type; discriminate via `type`)
type NumericSchema = SchemaBase & {
  type: 'number' | 'integer';
  enum?: number[];
  default?: number;
  examples?: number[];
  minimum?: number;
  maximum?: number;
};

// Boolean
type BooleanSchema = SchemaBase & {
  type: 'boolean';
  default?: boolean;
};

// Array
type ArraySchema = SchemaBase & {
  type: 'array';
  items: JsonSchemaDefinition | JsonSchemaDefinition[]; // type or types of array members
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
};

// Object (root for MCP tools)
type ObjectSchema = SchemaBase & {
  type: 'object';
  properties?: Record<string, JsonSchemaDefinition>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaDefinition; // boolean or type of allowed additional properties
  minProperties?: number;
  maxProperties?: number;
};

// Union
export type JsonSchemaDefinition =
  | StringSchema
  | NumericSchema
  | BooleanSchema
  | ArraySchema
  | ObjectSchema;

// For MCP tools (inputSchema root must be an object)
export type ToolInputSchema = ObjectSchema;
```

**Type Design Decisions:**
- **Discriminated union**: Uses `type` field for exhaustive narrowing
- **Strict typing**: `default` and `enum` match the schema type (no `any`/`unknown`)
- **Simplified for MCP**: Focuses on properties actually useful for agent tool descriptions
- **First pass limitation**: May restrict to simple object with simple top-level props (no nested objects/arrays initially)

## Runtime Implementation

### MCP Server Project

Create a new MCP server project (similar to `a2a-mcp`) that:

1. **Takes Tools agent path as parameter**
   - Loads agent metadata and tool definitions
   - Uses agent configuration and chat session

2. **Generates MCP tools dynamically**
   - Converts agent tool definitions to MCP SDK `Tool` type
   - Maps `parameters` to MCP `inputSchema`
   - Preserves tool `name` and `description`

3. **Handles tool calls**
   - Receives tool call with parameters
   - Substitutes parameters into prompt template using `{}` syntax
   - Calls chat session with filled prompt (similar to agent-supervisor mechanism)
   - Returns chat session response as tool result

4. **Server structure**
   - Model after `a2a-mcp` project structure
   - Use MCP SDK `Server` class
   - Support stdio transport (and potentially SSE)

### Implementation Components

**1. Tool Definition Loader**
- Reads agent metadata
- Parses tool definitions from agent config
- Validates tool structure

**2. Tool Adapter**
- Converts agent tool definitions to MCP SDK `Tool` type
- Maps `parameters` to `inputSchema`
- Handles type conversion

**3. Prompt Processor**
- Substitutes `{}` tokens in prompt template
- Maps tool call parameters to template variables
- Handles tool object properties (e.g., `{name}`)

**4. Chat Session Handler**
- Creates/manages chat session for tool execution (headless mode)
- Configures chat session for autonomous execution:
  - Sets `toolPermission: 'never'` or `'tool'` with only non-permission-required tools
  - Ensures only tools that don't require approval are available
  - Automatic tool execution without user interaction
- Passes processed prompt to chat session via `handleMessage()`
- Handles tool calls within the chat session automatically:
  - Tools are executed immediately without approval prompts
  - Tool results are incorporated into the conversation context
  - Multiple tool calls can be chained across conversation turns
- Extracts assistant response from chat session:
  - Processes `handleMessage()` response structure
  - Extracts text content from `turn.results` (type: 'text')
  - Handles multi-turn conversations if needed
- Returns final response as tool result (MCP `CallToolResult`)

**Headless Agent Behavior (modeled after A2A server):**
- **Tool Filtering**: Only includes tools that don't require permission:
  - If `toolPermission === 'always'` → no tools qualify (empty array)
  - If `toolPermission === 'never'` → all context tools qualify
  - If `toolPermission === 'tool'` → only tools without permission requirement qualify
- **Automatic Execution**: All tool calls are executed automatically without approval
- **Session Isolation**: Each tool call creates/uses a dedicated chat session with unique context ID
- **Response Extraction**: Extracts text content from assistant turns, handling multi-turn responses

**Executor Pattern (modeled after SimpleAgentExecutor in A2A server):**
```typescript
class McpToolExecutor {
  constructor(private agent: Agent, private logger: Logger) {}

  async executeTool(toolName: string, params: Record<string, unknown>, contextId: string): Promise<string> {
    // 1. Get tool definition from agent metadata
    const toolDef = this.getToolDefinition(toolName);
    
    // 2. Process prompt template with parameters
    const prompt = this.processPromptTemplate(toolDef.prompt, params, toolName);
    
    // 3. Create chat session with headless configuration
    const chatSession = this.agent.createChatSession(contextId, {
      toolPermission: 'never', // or 'tool' with filtered tools
      // ... other settings
    });
    
    // 4. Handle message and get response
    const response = await chatSession.handleMessage(prompt);
    
    // 5. Extract assistant response text
    const assistantText = this.extractAssistantResponse(response);
    
    // 6. Return text as tool result
    return assistantText;
  }
  
  private extractAssistantResponse(response: MessageUpdate): string {
    // Extract text from turn.results (type: 'text')
    // Handle multi-turn responses if needed
    // Similar to A2A server's response extraction
  }
}
```

**Key Implementation Details:**
- **Context ID**: Use unique context ID per tool call (e.g., UUID or tool call ID)
- **Session Configuration**: Configure chat session for headless/autonomous execution
- **Tool Availability**: Ensure only non-permission-required tools are available via `getIncludedTools()`
- **Response Processing**: Extract text from `handleMessage()` response structure:
  - Filter for `role === 'assistant'` updates
  - Extract text from `turn.results` where `type === 'text'`
  - Handle multi-turn conversations if `maxChatTurns > 1`
- **Error Handling**: Handle tool execution errors and return appropriate error messages

## UX/UI Requirements

### Tool Definition Interface

Similar to how Autonomous agents define skills, Tools agents need a UX to define tools:

**Required Fields:**
- **Name**: Tool identifier (used in MCP)
- **Description**: Human-readable tool description (used in MCP tool description)

**Parameters Builder:**
- Visual interface for building JSON Schema parameters
- Support for:
  - String, number, integer, boolean types
  - Arrays (with item type specification)
  - Objects (with nested properties) - may be deferred to later phase
  - Enum values
  - Required fields
  - Min/max constraints
  - Descriptions and examples

**Prompt Template Editor:**
- Text editor for prompt template
- `{}` syntax highlighting
- Parameter reference validation
- Preview of filled template with sample values

### Tool Serialization

Tools will be serialized in agent metadata similar to how skills are serialized for autonomous agents:

```json
{
  "metadata": {
    "name": "My Tools Agent",
    "tools": [
      {
        "name": "book_flight",
        "description": "Books a flight ticket for a user.",
        "parameters": { ... },
        "prompt": "The user wants to book a flight to {destination}..."
      }
    ]
  }
}
```

## Testing Interface

### Tool Test Interface

A tool testing interface that:

1. **Collects tool data**
   - Displays form based on tool parameter schema
   - Validates input against schema
   - Shows required vs optional fields

2. **Fills template**
   - Substitutes collected parameters into prompt template
   - Displays filled prompt for review

3. **Executes test**
   - Passes filled prompt to default chat agent
   - Processes tool calls within the chat session
   - Returns final response

4. **Displays results**
   - Shows tool call history
   - Shows intermediate tool results
   - Shows final agent response

## Future Considerations

### Context Sharing

**Question**: Is there any desire to share context between tool calls?

**Potential Solution**: 
- Agent can pass back any shared context if needed
- Could store context in chat session state
- Could return context in tool result metadata

### Parameter Type Limitations

**Initial Phase**: 
- May restrict to simple object with simple top-level props
- No nested objects or arrays initially

**Future Enhancements**:
- Support nested objects
- Support complex array types
- Support additional JSON Schema features as needed

### Additional Features

**Potential Enhancements**:
- Tool versioning
- Tool dependencies
- Tool execution permissions
- Tool result caching
- Tool execution history/audit

## Implementation Plan

### Phase 1: Core Infrastructure
1. Define TypeScript types for JSON Schema
2. Add "Tools" agent mode to agent metadata
3. Create tool definition structure in agent config
4. Implement tool serialization/deserialization

### Phase 2: MCP Server
1. Create new MCP server project
2. Implement tool definition loader
3. Implement tool adapter (agent → MCP SDK)
4. Implement prompt processor with `{}` substitution
5. Implement chat session handler
6. Test with simple tool definitions

### Phase 3: UX/UI
1. Create tool definition interface in Settings tab
2. Implement parameters builder
3. Implement prompt template editor
4. Add tool validation and preview
5. Test end-to-end tool creation and execution

### Phase 4: Testing Interface
1. Add "Test Tool" button to tool list in Settings tab
2. Create parameter collection form/modal with live preview
3. Implement template filling with collected parameters
4. Show live preview of filled prompt (updates as user types)
5. Create new chat tab programmatically with filled prompt
6. Auto-submit prompt once chat tab initializes
7. Display results in chat tab (tool calls, conversation, stats, context)

**Implementation Approach:**
- Reuse existing ChatTab component for full functionality
- Create chat tab with unique ID (e.g., `test-${toolName}-${timestamp}`)
- Wait for ChatTab initialization, then send filled prompt via `window.api.sendMessage()`
- Chat tab naturally shows: tool calls, conversation history, stats, context panel, model selection
- No need for separate testing UI - leverages full chat functionality

**Parameter Collection Modal:**
- Form fields generated from tool parameter schema
- Live preview pane showing filled prompt template
- Preview updates in real-time as user types parameter values
- Preview shows `{name}` substitution for tool name
- Preview shows all parameter substitutions with current values
- Empty/missing parameters show as `{paramName}` in preview
- Read-only preview area with monospace font for easy reading

### Phase 5: Polish & Enhancements
1. Support nested objects/arrays (if deferred)
2. Add context sharing if needed
3. Performance optimization
4. Documentation and examples

**Note on Tool Permissions**: Tools agents (like Autonomous agents) only execute tools that don't require permission. This is handled automatically via:
- Session configuration: `toolPermission: 'never'` for headless execution
- Tool filtering in `getIncludedTools()`: Only includes tools that don't require permission for `tools` mode (same as `autonomous` mode)

## Notes

- **MCP SDK Integration**: Tools will use MCP SDK `Tool` type from `@modelcontextprotocol/sdk/types.js`
- **Chat Session**: Tool execution uses existing chat session mechanism (similar to agent-supervisor)
- **Type Safety**: Custom JSON Schema types ensure type safety without relying on `any` or `unknown`
- **Backward Compatibility**: Existing Interactive and Autonomous agents remain unchanged

