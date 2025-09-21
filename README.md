# TSAgent: TypeScript Agent Platform

**TSAgent** is an open-source TypeScript-first platform for building, testing, running, and orchestrating AI agents. It provides a complete ecosystem from no-code agent creation to production-ready agent servers.

## What is TSAgent?

TSAgent is a comprehensive platform that enables developers to:

- **Build Agents**: Create AI agents through a no-code interface, with TypeScript integration for custom functionality
- **Manage Context**: Use references (memory, ground truth) and rules (prompt guidance) to give agents persistent knowledge
- **Integrate Tools**: Connect thousands of tools via the Model Context Protocol (MCP)
- **Orchestrate Workflows**: Chain agents together using the A2A (Agent-to-Agent) protocol
- **Deploy at Scale**: Expose agents as A2A endpoints or embed them in applications

## Key Features

- **No-Code Agent Creation**: Build sophisticated agents through a visual interface without writing code
- **TypeScript Integration**: Use TSAgent APIs in your TypeScript applications to drive agents or add agent functionality
- **Multi-Provider Support**: Works with all major LLM providers, cloud, hosted, and local (OpenAI, Anthropic, Google, AWS Bedrock, Ollama)
- **Agent Orchestration**: Built-in A2A protocol support for agent-to-agent communication
- **Desktop & CLI**: Both graphical and command-line interfaces for different workflows
- **Extensible**: Plugin architecture for custom providers and tools
- **Production Ready**: A2A server for exposing agents as HTTP APIs

## Platform Components

| Component | Package Name | Delivery Method | Command Line | Description |
|-----------|-------------|-----------------|--------------|-------------|
| **Core API** | `@tsagent/core` | TypeScript Library | *(library only)* | TypeScript agent framework with LLM providers, MCP integration, agent lifecycle |
| **Foundry** | *(no npm package)* | Desktop App | `tsagent` | No-code desktop application for creating, testing, and managing agents |
| **CLI** | `@tsagent/cli` | CLI Tool | `tsagent-cli` | Command-line interface for agent operations and automation |
| **A2A Server** | `@tsagent/server` | API/CLI | `tsagent-server` | A2A protocol server for exposing agents as HTTP endpoints |
| **A2A Orchestrator** | `@tsagent/orchestrator` | MCP Server | `tsagent-orchestrator` | MCP server for orchestrating A2A agent servers |

## Installation

### CLI and Developer Tools (NPM Packages)

```bash
# Install all developer tools
npm install @tsagent/core @tsagent/cli @tsagent/server @tsagent/orchestrator

# Or install individual components
npm install @tsagent/core  # Just the TypeScript library
npm install @tsagent/cli   # Just the CLI tool
```

### Desktop App (Download)

Download the pre-built installer for your platform:

- [macOS (Intel)](https://storage.googleapis.com/teamspark-workbench/TSAgent-Foundry-latest.dmg)
- [macOS (Apple Silicon)](https://storage.googleapis.com/teamspark-workbench/TSAgent-Foundry-latest-arm64.dmg)
- [Linux (Debian/Ubuntu)](https://storage.googleapis.com/teamspark-workbench/teamspark-workbench_latest_amd64.deb)
- [Linux (AppImage)](https://storage.googleapis.com/teamspark-workbench/TSAgent-Foundry-latest.AppImage)

## Quick Start

### Create Your First Agent

```bash
# Launch the desktop app (after downloading and installing)
tsagent

# Or create an agent via CLI by either running the CLI in the directory of the desired agent (or new agent)
# or passing the agent directory to the CLI as the --agent argument.  Use --create to create a new agent.
npx @tsagent/cli --agent ./my-agent --create
```

### Use Agents Programmatically

```typescript
import { Agent } from '@tsagent/core';

// Load an existing agent
const agent = new Agent('./my-agent');
await agent.load();

// Chat with the agent
const response = await agent.chat('Hello, how can you help me?');
console.log(response);
```

### Deploy Agents as Services

```bash
# Start an A2A server
npx @tsagent/server /path/to/agent --port 3000
# or if installed globally
tsagent-server /path/to/agent --port 3000

# Your agent is now available at http://localhost:3000
```

## Agent Types

TSAgent supports two types of agents:

- **Interactive Agents**: Maintain conversation history and can ask for user permission to use tools
- **Autonomous Agents**: Process requests independently and return complete results without user interaction

## No-Code vs TypeScript Integration

### No-Code Agent Creation
- **Visual Interface**: Build agents through the Foundry desktop app
- **Configuration-Based**: Define agent behavior through prompts, rules, and references
- **Tool Integration**: Connect to thousands of MCP-compatible tools without coding
- **Provider Management**: Configure LLM providers through the UI

### TypeScript Integration
- **API Access**: Use the `@tsagent/core` library to programmatically manage agents from your TypeScript applications
- **Application Integration**: Add agent functionality to existing TypeScript applications
- **Custom Tools**: Build custom MCP servers in TypeScript
- **Agent Orchestration**: Create complex workflows using the A2A protocol

## Architecture

```
 ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
 │   Foundry       │    │   CLI           │    │   TypeScript    │
 │   (Desktop)     │    │   (Terminal)    │    │   Integration   │
 └─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
           │                      │                      │
           └──────────────────────┼──────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │      @tsagent/core        │
                    │    (Agent Framework)      │
                    └─────────────┬─────────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                │                 │                 │
        ┌───────┴───────┐ ┌───────┴───────┐ ┌───────┴───────┐
        │ A2A Server    │ │ A2A Orchestr. │ │ MCP Tools     │
        │ (HTTP API)    │ │ (MCP Server)  │ │ (Integration) │
        └───────────────┘ └───────────────┘ └───────────────┘
```

## Development Workflow

1. **Create Agent**: Use Foundry desktop app for no-code agent creation
2. **Test Agent**: Chat with your agent to refine its behavior
3. **Extend with Code**: Use TypeScript integration for custom functionality
4. **Deploy**: Expose agents as HTTP endpoints or embed in applications
5. **Orchestrate**: Chain agents together using the A2A protocol

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE.md) file for details.

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/TeamSparkAI/tsagent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/TeamSparkAI/tsagent/discussions)
