# @tsagent/core

The core TypeScript library for building, testing, and managing AI agents. This package provides the foundational framework for creating intelligent agents with support for multiple LLM providers, MCP integration, and agent lifecycle management.

## About TSAgent

This package is part of **TSAgent**, an open-source TypeScript-first platform for building, testing, running, and orchestrating AI agents. 

- **Main Project**: [TSAgent Repository](https://github.com/TeamSparkAI/tsagent)
- **Documentation**: [Full Documentation](https://github.com/TeamSparkAI/tsagent#readme)
- **Issues & Support**: [GitHub Issues](https://github.com/TeamSparkAI/tsagent/issues)

## Installation

```bash
npm install @tsagent/core
```

## Quick Start

### Basic Agent Usage

```typescript
import { Agent } from '@tsagent/core';

// Load an existing agent
const agent = new Agent('./my-agent');
await agent.load();

// Chat with the agent
const response = await agent.chat('Hello, how can you help me?');
console.log(response);
```

### Create a New Agent

```typescript
import { createAgent } from '@tsagent/core/runtime';

// Create a new agent
await createAgent('./new-agent', {
  name: 'My Assistant',
  description: 'A helpful AI assistant',
  prompt: 'You are a helpful assistant...'
});
```

## Core Features

### Multi-Provider Support
- **OpenAI**: GPT-3.5, GPT-4, and other models
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Haiku, and more
- **Google**: Gemini Pro, Gemini Ultra
- **AWS Bedrock**: Access to various foundation models
- **Ollama**: Local model support
- **Custom Providers**: Extensible provider architecture

### Agent Management
- **Agent Lifecycle**: Create, load, save, and manage agents
- **Configuration**: Flexible agent configuration with `tsagent.json`
- **State Management**: Persistent agent state and conversation history
- **Error Handling**: Robust error handling and recovery

### MCP Integration
- **Model Context Protocol**: Full MCP client implementation
- **Tool Integration**: Connect to thousands of MCP-compatible tools
- **Dynamic Tool Loading**: Load tools at runtime
- **Tool Management**: Manage tool permissions and configurations

### Chat Sessions
- **Conversation Management**: Maintain chat history and context
- **Streaming Support**: Real-time message streaming
- **Tool Calls**: Handle tool calls and user permissions
- **Session State**: Persistent session state across restarts

## API Reference

### Core Classes

#### `Agent`
The main agent class for managing AI agents.

```typescript
class Agent {
  constructor(agentPath: string);
  load(): Promise<void>;
  chat(message: string): Promise<string>;
  chatStream(message: string): AsyncGenerator<string>;
  save(): Promise<void>;
  getConfig(): AgentConfig;
  setConfig(config: Partial<AgentConfig>): void;
}
```

#### `ChatSession`
Manages chat sessions and conversation history.

```typescript
class ChatSession {
  constructor(agent: Agent);
  sendMessage(message: string): Promise<ChatMessage>;
  sendMessageStream(message: string): AsyncGenerator<ChatMessage>;
  getHistory(): ChatMessage[];
  clearHistory(): void;
}
```

### Provider Management

```typescript
import { ProviderFactory } from '@tsagent/core';

// Get available providers
const providers = ProviderFactory.getAvailableProviders();

// Create a provider instance
const openaiProvider = ProviderFactory.createProvider('openai', {
  apiKey: 'your-api-key'
});
```

### MCP Integration

```typescript
import { MCPClientManager } from '@tsagent/core';

// Connect to MCP servers
const mcpManager = new MCPClientManager();
await mcpManager.addServer('http://localhost:3000');

// Get available tools
const tools = await mcpManager.getTools();
```

## Agent Configuration

Agents are configured using a `tsagent.json` file:

```json
{
  "name": "My Assistant",
  "description": "A helpful AI assistant",
  "version": "1.0.0",
  "providers": {
    "openai": {
      "apiKey": "your-api-key",
      "defaultModel": "gpt-4"
    }
  },
  "mcpServers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/path/to/files"]
    }
  ],
  "settings": {
    "temperature": 0.7,
    "maxTokens": 2000,
    "toolPermission": "ask"
  }
}
```

## Advanced Usage

### Custom Providers

```typescript
import { BaseProvider } from '@tsagent/core';

class CustomProvider extends BaseProvider {
  async generateResponse(messages: ChatMessage[]): Promise<string> {
    // Your custom implementation
    return "Custom response";
  }
}

// Register the provider
ProviderFactory.registerProvider('custom', CustomProvider);
```

### Tool Integration

```typescript
import { ToolCall } from '@tsagent/core';

// Handle tool calls in your agent
agent.onToolCall = async (toolCall: ToolCall) => {
  switch (toolCall.name) {
    case 'search':
      return await searchWeb(toolCall.arguments.query);
    case 'calculate':
      return await calculate(toolCall.arguments.expression);
    default:
      throw new Error(`Unknown tool: ${toolCall.name}`);
  }
};
```

## TypeScript Support

This package is written in TypeScript and provides full type definitions:

```typescript
import type { 
  Agent, 
  AgentConfig, 
  ChatMessage, 
  ProviderType,
  ToolCall 
} from '@tsagent/core';
```

## Related Packages

- `@tsagent/cli` - Command-line interface for agent operations
- `@tsagent/server` - A2A protocol server for exposing agents as HTTP endpoints
- `@tsagent/orchestrator` - MCP server for orchestrating A2A agent servers

## Development

```bash
# Build the package
npm run build

# Run tests
npm test

# Run in development mode
npm run dev
```

## License

MIT License - see [LICENSE](https://github.com/TeamSparkAI/tsagent/blob/main/LICENSE.md) for details.
