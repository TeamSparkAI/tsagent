# TsAgent Architecture

## Overview

TsAgent is a TypeScript-first platform for building, testing, running, and orchestrating AI agents. The platform provides a complete ecosystem from desktop and CLI apps for no-code agent creation, to production-ready agent servers, all supported by TypeScript APIs.

### Core Goals

- **No-Code Agent Creation**: Enable users to build sophisticated AI agents without writing code
- **Multi-Provider Support**: Work seamlessly with all major LLM providers (OpenAI, Anthropic, Google, AWS Bedrock, Ollama, local models)
- **Context Management**: Provide persistent knowledge through rules (prompt guidance) and references (memory, ground truth)
- **Tool Integration**: Connect thousands of tools via Model Context Protocol (MCP) support
- **Agent Orchestration*
*: Chain agents together using the A2A (Agent-to-Agent) protocol
- **Production Ready**: Deploy agents as HTTP endpoints, ACP servers for code editors, or embed them in any TypeScript/JavaScript application

## Platform Components

### Core Library (`@tsagent/core`)

The foundation of the platform, providing:
- Agent lifecycle management (create, load, save, clone)
- Chat session management with conversation history
- Context management (rules, references, tools)
- Provider abstraction layer
- MCP client integration
- Semantic search for context items
- TypeScript-first API with full type safety

### Desktop Application (TsAgent Foundry)

No-code desktop application for:
- Visual agent creation and configuration
- Interactive chat testing
- Agent management (rules, references, tools, providers)
- MCP server configuration
- Session context management

### CLI Tool (`@tsagent/cli`)

Command-line interface for:
- Agent operations and automation
- Interactive chat sessions
- Agent configuration management
- Scripting and automation workflows
- Server launcher for A2A, ACP, and Meta MCP servers (via `--a2a`, `--acp`, `--mcp` flags)

### A2A Server (`@tsagent/server`)

HTTP-based server that exposes agents via the Agent-to-Agent (A2A) protocol:
- RESTful API for autonomous agent interactions
- Multi-agent support (single or multiple agents per server)
- Request/response handling with context IDs
- Production-ready deployment

### ACP Server (`@tsagent/acp-server`)

Agent Client Protocol server for code editor integration:
- JSON-RPC over stdio communication
- Session-based conversation management
- Integration with ACP-compatible code editors (e.g., Zed)
- Full agent capabilities exposed via protocol

### MCP Servers

**Agent Management MCP** (`@tsagent/agent-mcp`): Provides tools to create, configure, and manage TsAgent agents programmatically. Enables external tools (like other agents or management interfaces) to programmatically shape and configure agents.

**Meta MCP** (`@tsagent/meta-mcp`): Exposes Tools agents as MCP tools with a cognitive layer. Each tool call executes a prompt template via a headless chat session.

**A2A Orchestrator** (`@tsagent/orchestrator`): MCP server for orchestrating A2A agent servers, enabling agents to discover and interact with other agents via the A2A protocol.

## Agent Architecture

### Agent Types

TsAgent supports three types of agents:

1. **Interactive Agents**: Maintain conversation history and can ask for user permission to use tools. Designed for human-agent interactions.

2. **Autonomous Agents**: Process requests independently and return complete results without user interaction. Exposed via A2A protocol for agent-to-agent communication.

3. **Tools Agents**: Expose agent capabilities as MCP tools, where each tool call executes a prompt template via a headless chat session. Enables agents to be used as tools by other agents or MCP clients.

### Agent Configuration

Agents are configured using a single YAML file (`.yaml` or `.yml`) containing all agent configuration and content:

- **Metadata**: Name, description, version, timestamps
- **System Prompt**: Core instructions for the agent
- **Settings**: Chat parameters (max turns, tokens, temperature, etc.)
- **Rules**: Prompt guidance items with include modes
- **References**: Memory/ground truth items with include modes
- **Providers**: LLM provider configurations with secret management
- **MCP Servers**: Tool server configurations with fine-grained control

### Agent Lifecycle

1. **Creation**: Agents can be created via desktop app, CLI, or programmatically
2. **Loading**: Agents are loaded from YAML files using `FileBasedAgentStrategy`
3. **Initialization**: Agents initialize MCP clients, load context items, and prepare for sessions
4. **Sessions**: Chat sessions are created from agents, maintaining conversation state
5. **Persistence**: Agent configuration is automatically saved when modified

## Context Management System

The context management system provides a three-layer hierarchy (Agent → Session → Request) that enables transparency about how context items are included and used.

### Context Hierarchy

**Agent Level (Available Context)**: The agent defines a full set of context items (rules, references, and tools) that are available to chat sessions. Each item has an `include` mode:
- `always`: Automatically added to session context when a new session is created
- `manual`: Can be manually added to session context by the user
- `agent`: Available for agent-controlled inclusion via semantic search on a per-request basis

**Session Level (Session Context)**: Items that are actively included in the chat session:
- Items with `include: 'always'` are automatically added
- Any item can be manually added/removed regardless of its include mode
- Session context persists across requests

**Request Level (Request Context)**: Context items actually used for a specific request/response pair:
- All session context items are included
- Agent items (with `include: 'agent'`) are selected via semantic search if relevant to the current request
- Request context is built fresh for each request

### Semantic Search

The system uses semantic embeddings to automatically select relevant context items for each request. This enables agents to dynamically include the most relevant rules, references, and tools based on the user's query.

#### Embedding Generation

**Model**: Uses `Xenova/all-MiniLM-L6-v2` via `@xenova/transformers` library
- Lightweight, fast, pure JavaScript model (~80MB, downloaded on first use)
- Generates 384-dimensional normalized embeddings
- Model is cached locally (typically in `~/.cache/transformers`)
- Quantized model for faster loading

**Just-In-Time (JIT) Indexing**: Embeddings are generated on-demand when needed:
- Model is only loaded when context items actually require indexing
- Avoids unnecessary model loading when all items are already indexed
- Embeddings are generated in batches for efficiency

#### Context Item Indexing

**Text Chunking**: Context items are chunked before indexing:
- **Rules/References**: Split by paragraphs first, then by sentences if paragraphs are too long
- **Tools**: Single chunk (name + description)
- **Max chunk size**: 500 characters (truncated if longer)
- Each chunk is indexed separately, allowing fine-grained matching

**Embedding Storage and Invalidation**:

The system uses different strategies for rules/references vs tools because of who controls the content:

**Rules and References** (agent-controlled content):
- Embeddings stored as `number[][]` (array of embedding vectors) in YAML
- **Invalidation on edit**: When a rule or reference is edited via the agent API, embeddings are explicitly cleared (`embeddings = undefined`)
- **Regeneration**: Embeddings are regenerated JIT when needed (when semantic search is performed)
- **No hash needed**: Since we control when rules/references change, we can clear embeddings at edit time

**Tools** (MCP server-controlled content):
- Embeddings stored in MCP server config with hash validation
- **Hash validation**: SHA-256 hash of tool text (name + description) stored with embeddings
- **Invalidation on load**: When an agent loads, tool embeddings are validated against current tool metadata from MCP servers
- **Hash mismatch detection**: If stored hash doesn't match current tool text, embeddings are cleared from config
- **Regeneration**: Embeddings are regenerated JIT when needed (when semantic search is performed)
- **Why hash is needed**: Since tool metadata comes from MCP servers (not agent config), we can't detect changes at edit time - hash validation on load detects when tools have changed

#### Query Processing

**Query Chunking**: User queries are processed similarly:
- Split by sentences (one chunk per sentence)
- Truncate sentences longer than 500 characters
- Generate embeddings for all query chunks in parallel

**Similarity Search**:
- **Cosine similarity**: Used to compare query embeddings with context item embeddings
- **Normalized vectors**: Embeddings are normalized (unit length), so cosine similarity = dot product
- **Multi-chunk matching**: For multi-chunk queries, uses max score per context chunk (best match across all query chunks)
- **Top-K selection**: Selects top K chunk matches, then groups by context item

**Result Selection**:
- **Grouping**: Multiple chunks from same item are grouped, keeping best score
- **Threshold filtering**: Items with similarity score above threshold are always included
- **Top-N selection**: Remaining slots filled with top N items by score
- **Score inclusion**: Results include `similarityScore` for transparency

#### Performance Optimizations

- **JIT model loading**: Model only loaded when items need indexing
- **Early returns**: If no context chunks available, returns early without loading model
- **Batch processing**: Multiple items indexed in single batch operation
- **Parallel query embedding**: All query chunks processed in parallel
- **Cached embeddings**: Once generated, embeddings reused until content changes

### Tool Context Management

Tools have additional configuration layers:
- **Server-level include mode**: Default behavior for all tools in an MCP server
- **Tool-level include mode**: Override server defaults for individual tools
- **Effective include mode**: Determined by tool-level → server-level → `always` fallback

## Provider System

TsAgent supports multiple LLM providers through a unified abstraction layer:

- **OpenAI**: GPT-4, GPT-3.5, and other OpenAI models
- **Anthropic**: Claude 3.5, Claude 3 Opus, and other Claude models
- **Google**: Gemini 2.0, Gemini 1.5, and other Gemini models
- **AWS Bedrock**: Access to Bedrock models (Claude, Llama, Mistral, etc.)
- **Ollama**: Local models via Ollama
- **Docker**: OpenAI-compatible API running in Docker containers (e.g., LocalAI, vLLM)
- **Local**: Direct integration with local LLM libraries (node-llama-cpp)

### Secret Management

Provider configurations support multiple secret sources:
- **Direct values**: Stored directly in agent configuration
- **Environment variables**: References using `env://` syntax
- **1Password**: References using `op://` syntax (when 1Password is available)

Secrets are resolved at runtime before being passed to providers. Credentials are never logged or stored in plain text.

## Protocols

### A2A (Agent-to-Agent) Protocol

HTTP-based protocol for autonomous agent interactions:
- RESTful API with request/response model
- Context IDs for maintaining conversation state
- Skills definition for autonomous agents
- Multi-agent server support

### ACP (Agent Client Protocol)

JSON-RPC over stdio protocol for code editor integration:
- Session-based conversation management
- Explicit session creation and management
- Full agent capabilities exposed via protocol methods
- Designed for subprocess-based communication

### MCP (Model Context Protocol)

Protocol for tool integration:
- Standard protocol for connecting tools to agents
- Support for stdio, SSE, and internal server types
- Fine-grained tool control (per-server and per-tool)
- Resource and prompt support (future)

## Agent Orchestration

Agents can orchestrate other agents through:
- **A2A Orchestrator MCP Server**: Discovers and interacts with A2A agent servers
- **Meta MCP Server**: Exposes Tools agents as MCP tools
- **Direct API**: Programmatic agent-to-agent communication via `@tsagent/core`

## Agent Supervision

The supervision system provides a middleware layer that can intercept and modify conversations between clients and agents. Supervisors have full access to conversation state and can make decisions about allowing, modifying, or blocking messages.

### Supervision Types

**Traditional Supervisors**: Hardcoded logic supervisors that implement specific supervision behaviors:
- **Architect**: Analyzes conversations, generates rules/references, tests modifications to improve agent performance
- **Guardian**: Implements content filtering, blocks or modifies inappropriate content
- **Collection**: Monitors conversation activity, collects statistics and metadata

**Agent-Based Supervisors**: AI agents that supervise other agents using tools:
- Supervisor agents are regular agents configured with supervision-focused system prompts
- Access to supervision tools that allow observing and modifying the supervised agent's state
- Can dynamically manage rules, references, and tools in the supervised session
- Make supervision decisions (allow/modify/block) based on AI reasoning

### Supervision Flow

1. **Request Processing**: Before the model is called, supervisors receive:
   - Full conversation context (system prompt, references, rules, message history)
   - Complete ChatSession object for access to all session data
   - Can allow, modify, or block the request

2. **Response Processing**: After generating responses, supervisors can:
   - Allow the response unchanged
   - Modify the response content
   - Block the response entirely

### Permission System

Supervisors have configurable permission levels:
- **READ_ONLY**: Can only observe conversations
- **MODIFY_CONTEXT**: Can modify agent context (rules, references, system prompt)
- **MODIFY_MESSAGES**: Can modify message content
- **FULL_CONTROL**: Complete control over the conversation

### Integration

Supervision is integrated into the chat session lifecycle:
- Supervisors are registered per session via the SupervisionManager
- Multiple supervisors can be chained sequentially
- Each supervisor receives the output of the previous supervisor
- Supervision decisions are logged and auditable

See `SUPERVISION.md` for detailed implementation and usage information.

## Design Principles

1. **Type Safety First**: Full TypeScript support with Zod schema validation
2. **Single Source of Truth**: Agent configuration stored in single YAML file
3. **Semantic Search**: Automatic context selection based on relevance
4. **Flexible Context Control**: Three-layer hierarchy with multiple include modes
5. **Provider Agnostic**: Unified abstraction across all LLM providers
6. **Protocol Support**: Native support for A2A, ACP, and MCP protocols
7. **No-Code Focus**: Desktop app enables agent creation without coding
8. **Production Ready**: Server packages ready for deployment

## Key Design Decisions

### YAML-Based Configuration

Agents use a single YAML file instead of directory-based structures:
- **Rationale**: Simpler, more portable, easier to version control
- **Migration**: Automatic migration from legacy JSON/directory formats
- **Benefits**: All agent content in one place, easier to share and manage

### Semantic Embeddings for Context

Context items are indexed with embeddings for semantic search:
- **Rationale**: Enables automatic selection of relevant context
- **Implementation**: JIT (Just-In-Time) indexing - embeddings generated when needed
- **Storage**: Embeddings stored in YAML with hash validation for regeneration

### Three-Layer Context Hierarchy

Agent → Session → Request hierarchy provides:
- **Transparency**: Clear visibility into how context is used
- **Flexibility**: Multiple include modes for different use cases
- **Efficiency**: Session context persists, request context built per-request

### Type-Safe Settings Management

Settings use typed `getSettings()`/`updateSettings()` methods:
- **Rationale**: Compile-time type safety, runtime validation via Zod
- **Benefits**: Prevents type errors, ensures consistency
- **Implementation**: Schema-driven defaults, no string-based key access

### MCP Type Re-Export Strategy

MCP types (`Tool`, `CallToolResult`) are inferred from Zod schemas:
- **Rationale**: Avoids forcing consumers to install MCP SDK
- **Implementation**: Import schemas, infer types, export our own type aliases
- **Benefits**: TypeScript resolves types from our package, not consumer's node_modules

