# TsAgent: The TypeScript Agent Platform

**TsAgent** is an open-source TypeScript-first platform for building, testing, running, and orchestrating AI agents. It provides a complete ecosystem from desktop and CLI apps for no-code agent creation, to production-ready agent servers, all supported by TypeScript APIs.

For more information, see the [TeamSpark web page for TsAgent](https://www.teamspark.ai/tsagent).

## What is TsAgent?

TsAgent is a comprehensive platform that enables anyone to:

- **Build Agents**: Create no-code AI agents through a visual interface (Foundry), CLI, or via API
- **Support Any Provider**: Work with all major LLM providers, cloud, hosted, and local (OpenAI, Anthropic, Google, AWS Bedrock, Ollama)
- **Manage Context**: Use references (memory, ground truth) and rules (prompt guidance) to give agents persistent knowledge
- **Integrate Tools**: Connect thousands of tools via Model Context Protocol (MCP) support
- **Orchestrate Workflows**: Chain agents together using the A2A (Agent-to-Agent) protocol
- **Deploy at Scale**: Expose agents as A2A endpoints or embed them in any TypeScript/Javascript application


## Platform Components

| Component | Package Name | Delivery Method | Description |
|-----------|-------------|-----------------|-------------|
| **Core API** | `@tsagent/core` | TypeScript Library | TypeScript agent framework for building, testing, and running agents programmatically |
| **Foundry** | *(no npm package)* | Desktop App | No-code desktop application for creating, testing, and managing agents |
| **CLI** | `@tsagent/cli` | CLI Tool | Command-line interface for agent operations and automation <br>`tsagent-cli` |
| **A2A Server** | `@tsagent/server` | API/CLI | A2A protocol server for exposing agents as HTTP endpoints <br>`tsagent-server` |
| **A2A Orchestrator** | `@tsagent/orchestrator` | MCP Server | MCP server for orchestrating A2A agent servers <br>`tsagent-orchestrator` |

| TsAgent Foundry | TsAgent CLI |
|-----------------|-------------|
| [![TsAgent Foundry](docs/images/desktop_sm.png)](docs/images/desktop.png) | [![TsAgent CLI](docs/images/cli_sm.png)](docs/images/cli.png) |

## Installation

### TsAgent Foundry - Desktop Application

Download the pre-built installer for your platform:

- [macOS (Intel)](https://storage.googleapis.com/tsagent/TsAgent%20Foundry-latest.dmg)
- [macOS (Apple Silicon)](https://storage.googleapis.com/tsagent/TsAgent%20Foundry-latest-arm64.dmg)
- [Linux (Debian/Ubuntu)](https://storage.googleapis.com/tsagent/tsagent-foundry_latest_amd64.deb)
- [Linux (AppImage)](https://storage.googleapis.com/tsagent/TsAgent%20Foundry-latest.AppImage)

### TsAgent CLI and Developer Tools (NPM Packages)

```bash
# Install all developer tools
npm install @tsagent/core @tsagent/cli @tsagent/server @tsagent/orchestrator

# Or install individual components
npm install @tsagent/core  # Just the TypeScript library
npm install @tsagent/cli   # Just the CLI tool
```

## Quick Start

### Create Your First Agent

Launch the TsAgent Foundry desktop app (after downloading and installing)

Or create an agent via CLI by either running the CLI in the directory of the desired agent (or new agent)
or passing the agent directory to the CLI as the `--agent` argument.  Use `--create` to create a new agent.

```bash
npx @tsagent/cli --agent ./my-agent --create
```

### Use Agents Programmatically

```typescript
import { loadAgent } from '@tsagent/core';

// Load an existing agent
const agent = await loadAgent('./my-agent', logger);

// Create a chat session
const session = agent.createChatSession('session-1');

// Send a message
const response = await session.handleMessage('Hello, how can you help me?');
console.log(response.updates[1].modelReply);
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

TsAgent supports two types of agents:

- **Interactive Agents**: Maintain conversation history and can ask for user permission to use tools
- **Autonomous Agents**: Process requests independently and return complete results without user interaction

Also, any agent can orchestrate other agents (whether it is interactive or autonomous itself) via the TsAgent Orchestrator MCP server


## Development Workflow

1. **Create Agent** - Use TsAgent Foundry desktop app or CLI for no-code agent creation
2. **Build Agent** - Write prompts, engineer context (rules/references), and add relevant MCP tools
3. **Test Agent** - Chat with your agent to refine its behavior
4. **Orchestrate** - Chain agents together using the A2A protocol
5. **Deploy** - Embed agents in applications via the `@tsagent/core` API or expose agents as A2A servers

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE.md) file for details.

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/TeamSparkAI/tsagent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/TeamSparkAI/tsagent/discussions)
