# @tsagent/orchestrator

An MCP (Model Context Protocol) server that bridges to A2A (Agent-to-Agent) servers. This server allows MCP clients to discover and interact with A2A agents through standardized MCP tools.

## About TSAgent

This package is part of **TSAgent**, an open-source TypeScript-first platform for building, testing, running, and orchestrating AI agents. 

- **Main Project**: [TSAgent Repository](https://github.com/TeamSparkAI/tsagent)
- **Documentation**: [Full Documentation](https://github.com/TeamSparkAI/tsagent#readme)
- **Issues & Support**: [GitHub Issues](https://github.com/TeamSparkAI/tsagent/issues)

## Features

- **MCP Protocol Compliance**: Full MCP server implementation with proper tool schemas
- **A2A Server Connection**: Connect to external A2A servers via HTTP endpoints
- **Embedded Agent Support**: Run local agents directly using file paths (via a2a-server)
- **Agent Discovery**: Automatically discover and list available A2A agents
- **Message Routing**: Send messages to specific agents by ID

## Installation

```bash
npm install @tsagent/orchestrator
```

## Usage

### Command Line

```bash
# Connect to external A2A servers
npx @tsagent/orchestrator http://localhost:4000 http://localhost:4001

# Run with local agent files (embedded mode)
npx @tsagent/orchestrator ./agent1 ./agent2

# Mix of HTTP and file paths
npx @tsagent/orchestrator http://remote-agent.com ./local-agent
```

### Programmatically

```typescript
import { A2AMCPServer } from '@tsagent/orchestrator';

// Connect to external A2A servers
const server = new A2AMCPServer(['http://localhost:4000', 'http://localhost:4001']);
await server.start();
```

## Available MCP Tools

### a2a_list_agents
List all available A2A agents and their capabilities.

**Parameters:** None

**Returns:**
```json
{
  "agents": [
    {
      "agentId": "agent_001",
      "name": "Agent Name",
      "description": "Agent description",
      "version": "1.0.0",
      "url": "http://localhost:4000",
      "provider": {
        "organization": "Organization Name",
        "url": "https://organization.com"
      },
      "iconUrl": "https://example.com/icon.png",
      "documentationUrl": "https://docs.example.com",
      "skills": [
        {
          "id": "skill-id",
          "name": "Skill Name",
          "description": "Skill description",
          "examples": ["example1", "example2"],
          "inputModes": ["text", "image"],
          "outputModes": ["text"],
          "tags": ["tag1", "tag2"]
        }
      ],
      "capabilities": {
        "streaming": true,
        "pushNotifications": false,
        "stateTransitionHistory": false
      }
    }
  ]
}
```

### a2a_send_message
Send a message to a specific A2A agent.

**Parameters:**
- `agentId` (required): The unique ID of the A2A agent (from `a2a_list_agents`)
- `message` (required): The message to send to the agent

**Returns:**
```json
{
  "response": "Agent response text",
  "taskId": "task-id-if-applicable",
  "status": "completed|unknown"
}
```

## How It Works

### External A2A Servers
When you provide HTTP URLs (e.g., `http://localhost:4000`), the server:
1. Connects to the A2A server endpoint
2. Fetches the agent card from `/.well-known/agent-card.json`
3. Creates an A2A client for communication
4. Maps the agent to a unique ID for MCP tool calls

### Embedded Agents
When you provide file paths (e.g., `./agent`), the server:
1. Starts an embedded A2A server using the `a2a-server` package
2. Loads agents from the specified file paths
3. Creates HTTP endpoints for the embedded agents
4. Treats them the same as external servers

## Example MCP Client Usage

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Connect to the MCP server
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['@tsagent/orchestrator', 'http://localhost:4000']
});

const client = new Client({
  name: 'a2a-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);

// List available agents
const agents = await client.callTool({
  name: 'a2a_list_agents',
  arguments: {}
});

// Send a message to an agent
const response = await client.callTool({
  name: 'a2a_send_message',
  arguments: {
    agentId: 'agent_001',
    message: 'Hello, how are you?'
  }
});

console.log(response);
```

## Related Packages

- `@tsagent/core` - Core TypeScript agent framework
- `@tsagent/cli` - Command-line interface for agent operations
- `@tsagent/server` - A2A protocol server for exposing agents as HTTP endpoints

## Development

```bash
# Build the package
npm run build

# Run in development mode
npm run dev

# Run tests
npm test
```

## License

MIT License - see [LICENSE](https://github.com/TeamSparkAI/tsagent/blob/main/LICENSE.md) for details.
