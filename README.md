[![npm version](https://img.shields.io/npm/v/@tsagent/core.svg)](https://www.npmjs.com/package/@tsagent/core)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/TeamSparkAI/tsagent/blob/main/LICENSE.md)
[![GitHub stars](https://img.shields.io/github/stars/TeamSparkAI/tsagent.svg)](https://github.com/TeamSparkAI/tsagent/stargazers)
[![Discord](https://img.shields.io/discord/1401626396584968234?label=Discord&logo=discord)](https://discord.gg/Z2dh4ATXnB)

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
- **Deploy at Scale**: Expose agents as A2A endpoints, ACP servers for code editors, or embed them in any TypeScript/Javascript application


## Platform Components

| Component | Package Name | Delivery Method | Description |
|-----------|-------------|-----------------|-------------|
| **Core API** | [`@tsagent/core`](https://www.npmjs.com/package/@tsagent/core) | TypeScript Library | TypeScript agent framework for building, testing, and running agents programmatically |
| **Foundry** | *(no npm package)* | Desktop App | No-code desktop application for creating, testing, and managing agents |
| **CLI** | [`@tsagent/cli`](https://www.npmjs.com/package/@tsagent/cli) | CLI Tool | Command-line interface for agent operations and automation <br>`tsagent` |
| **A2A Server** | [`@tsagent/server`](https://www.npmjs.com/package/@tsagent/server) | API/CLI | A2A protocol server for exposing agents as HTTP endpoints <br>`tsagent-server` |
| **ACP Server** | [`@tsagent/acp-server`](https://www.npmjs.com/package/@tsagent/acp-server) | ACP Server | ACP (Agent Client Protocol) server for exposing agents via stdio for code editors <br>`tsagent-acp-server` |
| **A2A Orchestrator** | [`@tsagent/orchestrator`](https://www.npmjs.com/package/@tsagent/orchestrator) | MCP Server | MCP server for orchestrating A2A agent servers <br>`tsagent-orchestrator` |
| **Meta MCP** | [`@tsagent/meta-mcp`](https://www.npmjs.com/package/@tsagent/meta-mcp) | MCP Server | MCP server that exposes agents with exported tools as MCP tools with cognitive layer <br>`tsagent-meta-mcp` |
| **Agent Management MCP** | [`@tsagent/agent-mcp`](https://www.npmjs.com/package/@tsagent/agent-mcp) | MCP Server | MCP server for managing TsAgent agents (create, configure, manage rules, references, tools, providers, and MCP servers) <br>`tsagent-agent-mcp` |

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
npm install @tsagent/core @tsagent/cli @tsagent/server @tsagent/acp-server @tsagent/orchestrator @tsagent/meta-mcp @tsagent/agent-mcp

# Or install individual components
npm install @tsagent/core  # Just the TypeScript library
npm install @tsagent/cli   # Just the CLI tool
npm install @tsagent/server  # A2A protocol server (HTTP)
npm install @tsagent/acp-server  # ACP server (stdio for code editors)
npm install @tsagent/meta-mcp  # MCP server for Tools agents
npm install @tsagent/agent-mcp  # MCP server for agent management
```

## Quick Start

### Create Your First Agent

Launch the TsAgent Foundry desktop app (after downloading and installing)

Or create an agent via CLI by passing the agent file path as a positional argument. Use `--create` to create a new agent.

```bash
npx @tsagent/cli ./my-agent.yaml --create
# or with the tsagent command if installed globally
tsagent ./my-agent.yaml --create
```

### Use Agents Programmatically

```typescript
import { loadAgent } from '@tsagent/core';

// Load an existing agent
const agent = await loadAgent('./my-agent.yaml', logger);

// Create a chat session
const session = agent.createChatSession('session-1');

// Send a message
const response = await session.handleMessage('Hello, how can you help me?');
console.log(response.updates[1].modelReply);
```

### Deploy Agents as Services

```bash
# Start an A2A server (for Autonomous agents)
# Option 1: Direct server binary
npx @tsagent/server /path/to/agent.yaml --port 3000
# or if installed globally
tsagent-server /path/to/agent.yaml --port 3000

# Option 2: Via CLI launcher
tsagent --a2a /path/to/agent.yaml --port 3000
# or with npx
npx @tsagent/cli --a2a /path/to/agent.yaml --port 3000

# Your agent is now available at http://localhost:3000
```

### Expose Agents via ACP (Agent Client Protocol)

```bash
# Start an ACP server for code editor integration (like Zed)
# Option 1: Direct server binary
npx @tsagent/acp-server /path/to/agent.yaml
# or if installed globally
tsagent-acp-server /path/to/agent.yaml

# Option 2: Via CLI launcher
tsagent --acp /path/to/agent.yaml
# or with npx
npx @tsagent/cli --acp /path/to/agent.yaml

# The agent is now available via stdio for ACP-compatible code editors
# Configure in your code editor's ACP settings
```

### Expose Tools Agents as MCP Tools

```bash
# Start a Meta MCP server (for Tools agents)
# Option 1: Direct server binary
npx @tsagent/meta-mcp /path/to/tools-agent.yaml
# or if installed globally
tsagent-meta-mcp /path/to/tools-agent.yaml

# Option 2: Via CLI launcher
tsagent --mcp /path/to/tools-agent.yaml
# or with npx
npx @tsagent/cli --mcp /path/to/tools-agent.yaml

# The agent's tools are now available as MCP tools
# Configure in Claude Desktop or other MCP clients
```

### Manage Agents via MCP

```bash
# Start the Agent Management MCP server
npx @tsagent/agent-mcp
# or if installed globally
tsagent-agent-mcp

# Provides tools to create, configure, and manage agents
# Configure in Claude Desktop or other MCP clients
```

### Secret Management & 1Password Support

- Secret fields (and “credential” fields such as API key IDs) can store direct values, environment variables, or 1Password references.
- `.env` files are loaded from both the current working directory and the agent directory (agent directory `.env` takes priority over CWD `.env`, both override initial `process.env` values), so you can keep provider-specific secrets near each agent if desired.
- 1Password support is automatically enabled when either `OP_SERVICE_ACCOUNT_TOKEN` or `OP_CONNECT_TOKEN` is present in the environment (you can also set `OP_CONNECT_HOST` when using Connect to override the default value of localhost:8080). These values can also live in the same `.env` files.
- When 1Password is available, the desktop UI lets you choose **Direct**, **Environment Variable**, or **1Password** for each secret field, and provides a picker to browse vaults/items/fields (returning standard `op://` references).
- At runtime and during provider validation TsAgent resolves `env://` and `op://` values before passing configs to providers
- Credentials are never logged or stored in plain text.

## Agent Properties and Capabilities

Agents have an `autonomous` property that determines their behavior:

- **Interactive Agents** (`autonomous: false`): Maintain conversation history and can ask for user permission to use tools. Sessions can be switched between interactive and autonomous modes.
- **Autonomous Agents** (`autonomous: true`): Process requests independently and return complete results without user interaction. All sessions must be autonomous. Exposed via A2A protocol for agent-to-agent communication.

Agents can also export capabilities:
- **Exported Skills**: Makes the agent available via the A2A protocol for agent-to-agent communication
- **Exported Tools**: Makes the agent's capabilities available as MCP tools via the Meta MCP server (each tool call executes a prompt template via a headless chat session)

Any agent can orchestrate other agents (whether it is interactive or autonomous itself) via the TsAgent Orchestrator MCP server. Agents with exported tools can be exposed via the Meta MCP server to make them available as tools to other agents or MCP clients.


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
