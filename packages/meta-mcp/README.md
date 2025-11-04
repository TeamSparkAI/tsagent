# @tsagent/meta-mcp

MCP server that exposes TsAgent "Tools" agents as MCP tools with a cognitive layer.

## Overview

This package provides an MCP server that takes a TsAgent Tools agent path and exposes the agent's tool definitions as MCP tools. Each tool call processes a prompt template with parameter substitution and executes it via a headless AI chat session.

## Installation

```bash
npm install -g @tsagent/meta-mcp
```

## Usage

```bash
tsagent-meta-mcp <agent-path>
```

The server will:
1. Load the Tools agent from the specified path
2. Verify it's a Tools agent (mode === 'tools')
3. Convert agent tool definitions to MCP tools
4. Start an MCP server on stdio
5. Handle tool calls by processing prompt templates and executing via chat session

## How It Works

1. **Tool Definition Loading**: Loads agent metadata and extracts tool definitions
2. **Tool Adapter**: Converts `AgentTool` definitions to MCP SDK `Tool` type
3. **Prompt Processing**: Substitutes `{}` tokens in prompt templates with tool call parameters
4. **Chat Session Handler**: Creates headless chat sessions with `toolPermission: 'never'` for automatic execution
5. **Response Extraction**: Extracts assistant response text from chat session results

## Tool Template Syntax

Prompt templates support `{}` substitution:
- `{name}` - Tool name
- `{param}` - Parameter value from tool call

Example:
```json
{
  "name": "book_flight",
  "prompt": "The user wants to book a flight to {destination} on {departure_date}, please book accordingly"
}
```

## Architecture

- **Headless Agent Pattern**: Only make tools available to AI chat session that don't require use approval
- **Automatic Tool Execution**: All tools execute without approval prompts
- **Session Isolation**: Each tool call uses a unique context ID
- **Response Processing**: Extracts text from multi-turn conversations

## Development

### Building

```bash
cd packages/meta-mcp
npm install
npm run build
```

This will compile TypeScript to JavaScript in the `dist/` directory.

### Running Locally

#### Development Mode (with tsx)

```bash
npm run dev <agent-path>
```

Example:
```bash
npm run dev /path/to/my-tools-agent
```

#### Production Mode (after building)

```bash
node dist/index.js <agent-path>
```

Or using the binary:
```bash
npm link  # Link the package globally (if you want)
tsagent-meta-mcp <agent-path>
```

### Testing with MCP Clients

#### Using Claude Desktop

1. **Build the package:**
   ```bash
   cd packages/meta-mcp
   npm run build
   ```

2. **Create or update your Claude Desktop MCP config** (usually at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

   ```json
   {
     "mcpServers": {
       "my-tools-agent": {
         "command": "node",
         "args": [
           "/absolute/path/to/tsagent/packages/meta-mcp/dist/index.js",
           "/absolute/path/to/your/tools-agent"
         ]
       }
     }
   }
   ```

3. **Restart Claude Desktop** to load the new MCP server

4. **Test the tools** - The tools from your Tools agent should now be available in Claude Desktop

#### Using MCP Inspector (for testing)

You can use the MCP Inspector to test the server:

```bash
# Install MCP Inspector globally
npm install -g @modelcontextprotocol/inspector

# Run the inspector with the meta-mcp server
npx @modelcontextprotocol/inspector \
  node /path/to/tsagent/packages/meta-mcp/dist/index.js \
  /path/to/your/tools-agent
```

#### Manual Testing

1. **Create a test Tools agent** with at least one tool defined
2. **Start the server:**
   ```bash
   npm run dev /path/to/test-agent
   ```
3. **Send MCP requests via stdio** - The server communicates via stdio following the MCP protocol

### Example: Creating a Test Tools Agent

1. **Create a Tools agent** using the desktop app:
   - Set agent mode to "Tools"
   - Add a tool with:
     - Name: `test_tool`
     - Description: `A test tool`
     - Parameters: Add a parameter `message` (type: string)
     - Prompt: `The user said: {message}. Please respond appropriately.`

2. **Test the agent path** - Note the full path to your agent

3. **Run the meta-mcp server:**
   ```bash
   npm run dev /path/to/your/test-agent
   ```

### Troubleshooting

- **"Agent not loaded" error**: Make sure the agent path is correct and the agent exists
- **"Agent is not a Tools agent"**: Verify the agent mode is set to "Tools" in the agent metadata
- **"No tools defined"**: Ensure the agent has at least one tool defined in its metadata
- **Build errors**: Make sure `@tsagent/core` is built first:
  ```bash
  cd ../agent-api
  npm run build
  cd ../meta-mcp
  npm install ../agent-api  # Link local package
  npm run build
  ```

