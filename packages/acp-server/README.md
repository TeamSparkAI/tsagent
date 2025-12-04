# @tsagent/acp-server

An ACP (Agent Client Protocol) server implementation that wraps agents created with the @tsagent/core package. This server provides stdio-based communication following the ACP protocol specification, enabling integration with ACP-compatible code editors (like Zed).

## About TSAgent

This package is part of **TSAgent**, an open-source TypeScript-first platform for building, testing, running, and orchestrating AI agents. 

- **Main Project**: [TSAgent Repository](https://github.com/TeamSparkAI/tsagent)
- **Documentation**: [Full Documentation](https://github.com/TeamSparkAI/tsagent#readme)
- **Issues & Support**: [GitHub Issues](https://github.com/TeamSparkAI/tsagent/issues)

## Features

- **ACP Protocol Compliance**: Implementation of the Agent Client Protocol specification
- **stdio Communication**: JSON-RPC over stdio for subprocess-based communication
- **Agent Integration**: Wraps @tsagent/core agents with ACP protocol interface
- **Session Management**: Handles multiple concurrent client sessions
- **Tool Support**: Supports tool calls between client and agent
- **Graceful Shutdown**: Proper cleanup and resource management
- **CLI Interface**: Command-line interface for easy server invocation

## Installation

```bash
npm install @tsagent/acp-server
```

## Usage

### Command Line Interface

The ACP server is designed to run as a subprocess invoked by ACP-compatible clients (like code editors):

```bash
# Start ACP server with an agent (absolute path)
tsagent-acp-server /path/to/my-agent.yaml

# Or with relative filename
tsagent-acp-server agent.yaml

# Start with debug logging
tsagent-acp-server /path/to/my-agent.yaml --debug
tsagent-acp-server agent.yaml -d

# Show help
tsagent-acp-server --help
```

**Via CLI Launcher:**
```bash
# Launch ACP server via tsagent CLI
tsagent --acp /path/to/agent.yaml
tsagent --acp agent.yaml --debug
```

### Programmatic Usage

```typescript
import { ACPServer } from '@tsagent/acp-server';

// Create and start an ACP server for an agent
const server = new ACPServer('/path/to/agent.yaml', {
  verbose: false  // Use debug flag for verbose logging
});

await server.start();

// Server is now ready to communicate via stdio
// The SDK handles JSON-RPC communication automatically
```

**Command Line Options:**
- `<agent-path>`: Path to the agent file (`.yaml` or `.yml`) - required
  - Absolute path: `/path/to/agent.yaml` - uses path as-is
  - Relative filename: `agent.yaml` - looks in current working directory
- `--debug, -d`: Enable debug/verbose logging
- `--help, -h`: Show help message

## Agent Configuration

Agents are configured using a single YAML file (`.yaml` or `.yml`). All agent content (system prompt, rules, references) is embedded in the file:

```yaml
metadata:
  name: "My Assistant"
  description: "A helpful AI assistant"
  # ... other metadata fields

systemPrompt: |
  You are a helpful AI assistant.
  This is a multi-line system prompt.
  Supports markdown formatting.

rules:
  - name: "example-rule"
    description: "An example rule"
    priorityLevel: 500
    text: |
      Rule content here.
      Supports markdown.
    include: "always"

references:
  - name: "example-reference"
    description: "An example reference"
    priorityLevel: 500
    text: |
      Reference content here.
      Supports markdown.
    include: "manual"

# ... providers, mcpServers, etc.
```


## ACP Protocol Methods

The server implements the following ACP protocol methods:

- `initialize` - Negotiate protocol version and capabilities
- `session/new` - Create a new ACP session (supports client-provided MCP servers)
- `session/prompt` - Send a prompt to the agent within a session
- `session/cancel` - Cancel an in-progress prompt (notification)

## MCP Tool Sharing

ACP enables clients to pass their own MCP servers to agents during session creation, allowing agents to access client-configured tools and context. See [MCP Tool Sharing Documentation](docs/mcp-tool-sharing.md) for details on how this works and the implementation plan.

## Architecture

### Communication Model

- **Protocol**: JSON-RPC over stdio (stdin/stdout)
- **Transport**: Handled automatically by `@agentclientprotocol/sdk`
- **Sessions**: One ACP session = One agent chat session

### Session Management

- Each ACP session maps to a `@tsagent/core` chat session
- Sessions maintain conversation history and context
- Sessions can be created, used for prompts, and closed

### Content Conversion

- **ACP → Agent**: Converts ACP content (Markdown, text, diffs) to agent message format
- **Agent → ACP**: Converts agent responses to ACP content format (Markdown by default)
- Tool calls are handled and forwarded between client and agent

## Integration with Code Editors

### Zed Editor

To use this server with [Zed editor](https://zed.dev):

1. Configure Zed to use the ACP server as an agent
2. Zed will spawn the server as a subprocess
3. Communication happens via stdio (JSON-RPC)

Example Zed configuration (if applicable):
```json
{
  "acp_agents": {
    "tsagent": {
      "command": "tsagent",
      "args": ["--acp", "/path/to/agent.yaml"]
    }
  }
}
```

Or using the server binary directly:
```json
{
  "acp_agents": {
    "tsagent": {
      "command": "tsagent-acp-server",
      "args": ["/path/to/agent.yaml"]
    }
  }
}
```

*Note: Actual configuration format depends on Zed's ACP implementation*

## Development

```bash
# Build the package
npm run build

# Run in development mode
npm run dev /path/to/agent.yaml
npm run dev agent.yaml  # Relative filename

# Start server
npm start /path/to/agent.yaml
npm start agent.yaml  # Relative filename
```

## Implementation Status

⚠️ **Work in Progress**: This package is currently under active development. The core structure is in place, but SDK integration is pending verification of the `@agentclientprotocol/sdk` API.

### Completed
- ✅ Package structure
- ✅ Logger implementation
- ✅ Session manager
- ✅ Agent handler (content conversion)
- ✅ Basic server class structure
- ✅ CLI interface

### Pending
- ⏳ SDK integration (AgentSideConnection setup)
- ⏳ Protocol method handler registration
- ⏳ Transport connection setup
- ⏳ Testing with ACP clients
- ⏳ Tool call handling refinement

## Related Packages

- `@tsagent/core` - Core TypeScript agent framework
- `@tsagent/server` - A2A protocol server (HTTP-based)
- `@tsagent/cli` - Command-line interface for agent operations

## License

MIT License - see [LICENSE](https://github.com/TeamSparkAI/tsagent/blob/main/LICENSE.md) for details.

