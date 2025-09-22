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
- **Streaming Support**: Real-time message streaming with Server-Sent Events
- **Graceful Shutdown**: Proper cleanup and resource management
- **CLI Interface**: Command-line interface for easy server management

## Installation

```bash
npm install @tsagent/server
```

## Usage

### Command Line Interface

```bash
# Single agent (backward compatible)
npx @tsagent/server /path/to/my-agent

# Multiple agents
npx @tsagent/server /path/to/agent1 /path/to/agent2 /path/to/agent3

# Multiple agents with custom port
npx @tsagent/server --port 3000 /path/to/agent1 /path/to/agent2

# Single agent with custom port
npx @tsagent/server /path/to/my-agent --port 5000

# Show help
npx @tsagent/server --help
```

### Programmatically

#### Single Agent Server

```typescript
import { A2AServer } from '@tsagent/server';

// Create and start a server for a single agent
const server = new A2AServer('/path/to/agent', 4000);
await server.start();

console.log('A2A Server started on port 4000');
```

#### Multi-Agent Server

```typescript
import { MultiA2AServer } from '@tsagent/server';

// Create a multi-agent server
const server = new MultiA2AServer();

// Add agents
await server.addAgent('/path/to/agent1', 'agent1');
await server.addAgent('/path/to/agent2', 'agent2');

// Start the server
await server.start(4000);
```

## Agent Directory Structure

Each agent directory should contain:

```
/path/to/agent/
├── tsagent.json         # Agent configuration
├── prompt.md            # System prompt
├── rules/               # Optional rules directory
│   ├── rule1.md
│   └── rule2.md
└── refs/                # Optional references directory
    ├── ref1.md
    └── ref2.md
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
Usage: @tsagent/server <agent-path> [agent-path...] [options]

Arguments:
  agent-path          Path to the agent directory (at least one required)

Options:
  --port, -p <number> Port to run the server on (default: 4000)
  --help, -h          Show this help message
```

## Examples

### Basic Single Agent

```bash
# Start server with a single agent
npx @tsagent/server ./my-agent --port 4000

# The agent will be available at:
# - http://localhost:4000/.well-known/agent-card.json
```

### Multi-Agent Setup

```bash
# Start server with multiple agents
npx @tsagent/server ./assistant-agent ./coding-agent ./research-agent --port 4000

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
