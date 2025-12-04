# @tsagent/server

An A2A (Agent-to-Agent) server implementation that wraps agents created with the @tsagent/core package. This server provides HTTP endpoints following the A2A protocol specification, enabling agent-to-agent communication through a standardized REST API.

## About TSAgent

This package is part of **TSAgent**, an open-source TypeScript-first platform for building, testing, running, and orchestrating AI agents. 

- **Main Project**: [TSAgent Repository](https://github.com/TeamSparkAI/tsagent)
- **Documentation**: [Full Documentation](https://github.com/TeamSparkAI/tsagent#readme)
- **Issues & Support**: [GitHub Issues](https://github.com/TeamSparkAI/tsagent/issues)

## Features

- **A2A Protocol Compliance**: Full implementation of the A2A protocol specification
- **Single & Multi-Agent Support**: Run one or multiple agents simultaneously
- **Agent Card Generation**: Automatic generation of agent cards from agent metadata
- **Streaming Support**: [Future] Real-time message streaming with Server-Sent Events
- **Graceful Shutdown**: Proper cleanup and resource management
- **CLI Interface**: Command-line interface for easy server management

## Installation

```bash
npm install @tsagent/server
```

## Usage

### Command Line Interface

```bash
# Single agent
tsagent-server /path/to/my-agent.yaml

# Or with relative filename
tsagent-server agent.yaml

# Multiple agents
tsagent-server /path/to/agent1.yaml /path/to/agent2.yaml /path/to/agent3.yaml

# Multiple agents with custom port
tsagent-server --port 3000 /path/to/agent1.yaml /path/to/agent2.yaml

# Single agent with custom port and debug logging
tsagent-server /path/to/my-agent.yaml --port 5000 --debug

# Show help
tsagent-server --help
```

**Via CLI Launcher:**
```bash
# Launch A2A server via tsagent CLI
tsagent --a2a /path/to/agent.yaml
tsagent --a2a agent1.yaml agent2.yaml --port 3000
tsagent --a2a /path/to/agent.yaml --debug
```

### Programmatically

#### Single Agent Server

```typescript
import { A2AServer } from '@tsagent/server';

// Create and start a server for a single agent
const server = new A2AServer('/path/to/agent.yaml', 4000);
await server.start();

console.log('A2A Server started on port 4000');
```

#### Multi-Agent Server

```typescript
import { MultiA2AServer } from '@tsagent/server';

// Create a multi-agent server
const server = new MultiA2AServer();

// Add agents
await server.addAgent('/path/to/agent1.yaml', 'agent1');
await server.addAgent('/path/to/agent2.yaml', 'agent2');

// Start the server
await server.start(4000);
```

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


## A2A Protocol Endpoints

### Single Agent Mode
When running a single agent, endpoints are available at the server root:

- `GET /.well-known/agent-card.json` - Agent card
- `POST /stream` - Send messages to the agent

### Multi-Agent Mode
When running multiple agents, each agent has its own path:

- `GET /agents/{agent-name}/.well-known/agent-card.json` - Agent card
- `POST /agents/{agent-name}/stream` - Send messages to specific agent
- `GET /agents` - Discovery endpoint listing all agents

## CLI Options

```bash
Usage: tsagent-server <agent-path> [agent-path...] [options]

Arguments:
  agent-path          Path to the agent file (.yaml or .yml) (at least one required)
                      - Absolute path: /path/to/agent.yaml
                      - Relative filename: agent.yaml (looks in current directory)

Options:
  --port, -p <number> Port to run the server on (default: 4000)
  --debug, -d         Enable debug/verbose logging
  --help, -h          Show this help message
```

## Examples

### Basic Single Agent

```bash
# Start server with a single agent (absolute path)
tsagent-server /path/to/my-agent.yaml --port 4000

# Or with relative filename
tsagent-server my-agent.yaml --port 4000

# The agent will be available at:
# - http://localhost:4000/.well-known/agent-card.json
```

### Multi-Agent Setup

```bash
# Start server with multiple agents
tsagent-server assistant-agent.yaml coding-agent.yaml research-agent.yaml --port 4000

# Or with absolute paths
tsagent-server /path/to/assistant-agent.yaml /path/to/coding-agent.yaml /path/to/research-agent.yaml --port 4000

# Each agent will be available at:
# - http://localhost:4000/agents/assistant-agent/.well-known/agent-card.json
# - http://localhost:4000/agents/coding-agent/.well-known/agent-card.json
# - http://localhost:4000/agents/research-agent/.well-known/agent-card.json
```

### Agent Discovery

```bash
# List all available agents
curl http://localhost:4000/agents

# Get specific agent card
curl http://localhost:4000/agents/my-agent/.well-known/agent-card.json
```

## Related Packages

- `@tsagent/core` - Core TypeScript agent framework
- `@tsagent/cli` - Command-line interface for agent operations
- `@tsagent/orchestrator` - MCP server for orchestrating A2A agent servers

## Development

```bash
# Build the package
npm run build

# Run in development mode
npm run dev

# Run tests
npm test

# Start server for testing
npm start
```

## License

MIT License - see [LICENSE](https://github.com/TeamSparkAI/tsagent/blob/main/LICENSE.md) for details.
