# @tsagent/cli

A command-line interface for TSAgent, providing full access to AI agents, providers, and tools through an interactive terminal interface.

## About TSAgent

This package is part of **TSAgent**, an open-source TypeScript-first platform for building, testing, running, and orchestrating AI agents. 

- **Main Project**: [TSAgent Repository](https://github.com/TeamSparkAI/tsagent)
- **Documentation**: [Full Documentation](https://github.com/TeamSparkAI/tsagent#readme)
- **Issues & Support**: [GitHub Issues](https://github.com/TeamSparkAI/tsagent/issues)

## Features

- **Interactive Chat Interface**: Chat with AI models through a terminal-based interface
- **Provider Management**: Install, configure, and switch between AI providers (OpenAI, Anthropic, Google, etc.)
- **Model Selection**: Choose from available models for each provider
- **Settings Management**: Configure temperature, token limits, and other parameters
- **Tool Integration**: Use MCP (Model Context Protocol) tools for enhanced capabilities
- **Agent Management**: Create, load, and manage AI agents
- **Rules and References**: Manage agent rules and reference materials
- **Statistics**: View chat session statistics and token usage

## Installation

```bash
npm install @tsagent/cli
```

### Global Installation

```bash
npm install -g @tsagent/cli
```

### Development

```bash
# Clone the repository
git clone https://github.com/TeamSparkAI/tsagent.git
cd tsagent

# Install dependencies
npm install

# Build the CLI
npm run build:cli

# Run in development mode
npm run dev:cli
```

## Usage

### Basic Usage

```bash
# Start CLI with agent in current directory
npx @tsagent/cli

# Or if installed globally
tsagent-cli

# Start CLI with specific agent path
npx @tsagent/cli --agent /path/to/agent

# Create new agent
npx @tsagent/cli --create

# Create new agent in specific directory
npx @tsagent/cli --agent /path/to/new/agent --create

# Enable verbose logging
npx @tsagent/cli --verbose
```

### Command Line Options

- `--agent <path>`: Specify agent directory path (defaults to current working directory)
- `--create`: Create new agent if it doesn't exist
- `--verbose`: Enable verbose logging
- `--help`: Show help information
- `--version`: Show version information

### Interactive Commands

Once in the CLI, you can use the following commands:

#### General Commands
- `/help` - Show help menu
- `/license` - Show license agreement
- `/quit` or `/exit` - Exit the application
- `/clear` - Clear chat history

#### Provider Commands
- `/providers` - List available providers (* active)
- `/providers add <provider>` - Add a provider
- `/providers remove <provider>` - Remove a provider
- `/provider <provider> <model>` - Switch to specified provider

#### Model Commands
- `/models` - List available models (* active)
- `/model <model>` - Switch to specified model

#### Settings Commands
- `/settings` - List current settings
- `/setting <setting> <value>` - Update setting
- `/settings reset` - Reset settings to agent defaults
- `/settings save` - Save current settings as agent defaults

#### Tool Commands
- `/tools` - List available tools from MCP servers

#### Agent Commands
- `/agent` - Display current agent path
- `/rules` - List all rules (* active, - inactive)
- `/references` - List all references (* active, - inactive)
- `/stats` - Display chat session statistics

## Configuration

### Agent Configuration

Agents are configured using a `tsagent.json` file in the agent directory. This file contains:

- Agent metadata (name, description, etc.)
- Provider configurations
- MCP server configurations
- Rules and references
- Default settings

### Logging

The CLI uses Winston for logging with the following features:

- Console output with colorized formatting
- File logging to `cli.log`
- Error logging to `cli-error.log`
- Log rotation (10MB max file size, 5 files max)
- Configurable log levels

## Development

### Project Structure

```
apps/cli/
├── src/
│   ├── main.ts          # Main entry point
│   ├── cli.ts           # CLI logic and commands
│   ├── logger.ts        # Winston logger adapter
│   ├── commands/        # Command implementations
│   └── utils/           # Utility functions
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
# Build the CLI
npm run build

# Watch mode for development
npm run watch
```

### Testing

```bash
# Run tests
npm test
```

## Related Packages

- `@tsagent/core` - Core TypeScript agent framework
- `@tsagent/server` - A2A protocol server for exposing agents as HTTP endpoints
- `@tsagent/orchestrator` - MCP server for orchestrating A2A agent servers

## Dependencies

- **@tsagent/core**: Core agent functionality
- **chalk**: Terminal colors
- **commander**: Command line argument parsing
- **ora**: Loading spinners
- **read**: Interactive input
- **winston**: Logging

## License

MIT License - see [LICENSE](https://github.com/TeamSparkAI/tsagent/blob/main/LICENSE.md) for details.
