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
import { loadAgent } from '@tsagent/core/runtime';

const logger = console as any; // Any object with info/debug/error is fine

// Load an existing agent
const agent = await loadAgent('./my-agent.yaml', logger);

// Create a chat session
const session = agent.createChatSession('session-1');

// Send a message
const result = await session.handleMessage('Hello, how can you help me?');
console.log(result.updates[1].modelReply);
```

### Create a New Agent

```typescript
import { createAgent } from '@tsagent/core/runtime';

const logger = console as any;

// Create a new agent
await createAgent('./new-agent.yaml', logger, {
  metadata: {
    name: 'My Assistant',
    description: 'A helpful AI assistant'
  }
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
- **Configuration**: Flexible agent configuration with YAML format (`.yaml` or `.yml`)
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
The main agent interface for managing AI agents. Obtain instances via runtime functions (`loadAgent` / `createAgent`), not via `new`.

```typescript
// Obtained from runtime, supports chat sessions among other capabilities
agent.createChatSession(id: string, options?: ChatSessionOptions): ChatSession;
agent.getChatSession(id: string): ChatSession | null;
agent.getAllChatSessions(): ChatSession[];
agent.deleteChatSession(id: string): Promise<boolean>;
```

#### `ChatSession`
Manages chat sessions and conversation history.

```typescript
// Create via: const session = agent.createChatSession('session-1', options)
session.handleMessage(message: string | ChatMessage): Promise<MessageUpdate>;
session.getState(): ChatState;
session.clearModel(): MessageUpdate;
session.switchModel(modelType: ProviderType, modelId: string): MessageUpdate;
session.addReference(name: string): boolean;
session.removeReference(name: string): boolean;
session.addRule(name: string): boolean;
session.removeRule(name: string): boolean;
```

### Provider Management

```typescript
// From an Agent instance
const providersInfo = agent.getAvailableProvidersInfo();
const models = await agent.getProviderModels('openai');
```

### MCP Integration

```typescript
// Via the Agent instance
const clients = await agent.getAllMcpClients();
const client = await agent.getMcpClient('filesystem');
```

## Agent Configuration

Agents are configured using a single YAML file (`.yaml` or `.yml`). All agent content (system prompt, rules, references) is embedded in the file:

> **Note**: For a limited time, the system will automatically convert older JSON-based agents (directory structure with `tsagent.json`) to the new YAML format when you load them. The conversion happens transparently on first load, and the original JSON file is preserved. After conversion, the agent uses the new YAML file.

```yaml
metadata:
  name: "My Assistant"
  description: "A helpful AI assistant"
  version: "1.0.1"
  skills: []
  iconUrl: "https://example.com/icon.png"
  documentationUrl: "https://example.com/docs"
  provider:
    organization: "Example Org"
    url: "https://example.com"
  created: "2025-04-07T17:32:29.081Z"
  lastAccessed: "2025-04-07T17:32:29.081Z"

systemPrompt: |
  You are a helpful AI assistant.
  This is a multi-line system prompt.
  Supports markdown formatting.

settings:
  maxChatTurns: 20
  maxOutputTokens: 1000
  temperature: 0.5
  topP: 0.5
  theme: "light"
  mostRecentModel: "gemini:gemini-2.0-flash"

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

providers:
  anthropic:
    ANTHROPIC_API_KEY: "xxxxx"
  gemini:
    GOOGLE_API_KEY: "xxxxx"
  openai:
    OPENAI_API_KEY: "xxxxx"
  bedrock:
    BEDROCK_ACCESS_KEY_ID: "xxxxx"
    BEDROCK_SECRET_ACCESS_KEY: "xxxxx"
  ollama:
    OLLAMA_HOST: "localhost:11434"  # optional

mcpServers:
  filesystem:
    type: "stdio"
    command: "npx"
    args:
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "./test_files"
    toolPermissionRequired:
      serverDefault: false
      tools:
        read_text_file: true
    toolInclude:
      serverDefault: "agent"
      tools:
        directory_tree: "manual"
    # toolEmbeddings: Automatically managed - contains semantic embeddings for tools
    #   tools:
    #     tool_name:
    #       embeddings: [[...]]
    #       hash: "..."
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
```

## License

MIT License - see [LICENSE](https://github.com/TeamSparkAI/tsagent/blob/main/LICENSE.md) for details.
