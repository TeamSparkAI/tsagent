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

## Demo

MCP Optimizer
- list_tools
  - "List tools most relevant to the prompt that follows: {prompt}"
- call_tool
  - "Call the tool {toolname} with the parameters that follow: {parameters}"

Tool manager
- Later: Install server (elicitation for config?)

ToolVault
- MCP Servers
  - Refs (about ToolVault)
  - filesystem pointing at source (maybe grep also)
  - github pointing at repo
  - next.js MCP
  - Something to enumerate, call REST API endpoints (maybe openapi spec is a ref?)
  - sqlite pointing at local db
- External tools
  - ???

### Servers

REST API as MCP

https://github.com/ivo-toby/mcp-openapi-server
https://www.npmjs.com/package/@mcp-apps/api-tools-mcp-server

### Prompt

I have a feature of my agent platform that allows a user to create an agent that exports tools. The user can define a tool by name, description, parameters, and prompt. An MCP server provides those tools to clients, where the client sees the tools and calls them, and the MCP server does substituition of paramter values in the prompt and the lets the agent process that prompt, returning a result. The agent can use internal references or rules or call it's own MCP tools in service of responding to the prompt. 

I'm trying to come up with a demo to showcase the power of this functionality (essentiallly MCP tools that are implemented as full agents), highlighting situations where this would be better than just adding the agents mcp servers to the calling client and letting it's agent handle it. So it needs to be something that "functional" (a function call with parameters) and that relies on the combination if rules, references, and tools in the provuding agent to solve the problem.  Ideally these would be develper scenarios with five functions that would leverage the same set of agent references, rules, and tools (using only those appropriate for each use case), and be targeted at the same persona.

As a possible basis for such a demo, I have product (MCP ToolVault) that is implemented in Next.js, has a full REST API (documented via an openapi spec), with its database in sqlite.  It renders a Web UX.  I have MCP servers that an access the filesystem (the source code of the project), the github repo of the product, can enumerate and call the REST API endpoints, can access the sqlite database (which contains clients, servers, policies, messages, and alerts), and can interact with the web ux (via Playright?).  I can collect product and project information and rules in rules and references as appropriate.

The database can tell us things like how the product is being used (which clients and servers, which policies, and also things like whether any recent messages exist for given clients/servers to see who is using the product and how, and alerts by policy to see which policies are being violated).  That being said, much of that can be seen in the product itself or determined by call it's APIs.  Using the db on concert with other context would be good, but only if it is truly complimentary.

Present scenarios for a demo that satisfy the above, whether using MCP ToolVault or something else.


System health
- product/server running, reponding to API
- for ToolVault - recent messages passing through
- github open issues and PRs

Data element tracking
- Show flow from db->model->API->UX

NPM pubishing - determine if pubishing is required
- Is version later than published version?
- If not, has code been touched since verson published?