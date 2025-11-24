# ACP Server Implementation Plan

## Overview

This document outlines the plan for implementing an **Agent Client Protocol (ACP)** server package (`acp-server`) that serves ACP requests and interfaces with `@tsagent/core` agents. This implementation will follow a similar pattern to the existing `a2a-server` package but adapts to ACP's JSON-RPC over stdio communication model.

## Key Differences from A2A Server

### Communication Protocol
- **A2A**: HTTP REST API (Express-based)
- **ACP**: JSON-RPC over stdio (subprocess-based) - **handled automatically by SDK**

### Architecture
- **A2A**: Server listens on HTTP port, exposes REST endpoints
- **ACP**: Agent runs as subprocess, SDK handles stdio transport automatically
- **ACP**: We only register protocol method handlers, SDK manages JSON-RPC communication

### Session Management
- **A2A**: Request-based with context IDs
- **ACP**: Explicit session creation and management via `session/new` and `session/prompt`

## Package Structure

```
packages/acp-server/
├── src/
│   ├── index.ts              # Main exports (ACPServer class)
│   ├── acp-server.ts         # Core ACP server implementation
│   ├── agent-handler.ts      # Bridge between ACP and @tsagent/core Agent
│   ├── session-manager.ts    # ACP session lifecycle management
│   ├── logger.ts             # Logger implementation (reuse pattern)
│   └── cli.ts                # CLI entry point
├── package.json
├── tsconfig.json
└── README.md
```

## Core Components

### 1. ACPServer Class

**Location**: `src/acp-server.ts`

**Responsibilities**:
- Initialize `AgentSideConnection` from `@agentclientprotocol/sdk` (SDK handles JSON-RPC over stdio automatically)
- Register protocol method handlers: `initialize`, `session/new`, `session/prompt`
- Manage session lifecycle
- Delegate to AgentHandler for agent interactions

**Key Methods**:
```typescript
class ACPServer {
  private connection: AgentSideConnection;
  private agent: Agent;
  private sessionManager: SessionManager;
  private agentHandler: AgentHandler;
  private logger: Logger;
  
  constructor(agentPath: string, options?: ACPServerOptions);
  async start(): Promise<void>;
  async stop(): Promise<void>;
  
  // Handler registration (SDK abstracts JSON-RPC details)
  private setupHandlers(): void;
  private handleInitialize(params: InitializeParams): Promise<InitializeResult>;
  private handleSessionNew(params: SessionNewParams): Promise<SessionNewResult>;
  private handleSessionPrompt(params: SessionPromptParams): Promise<SessionPromptResult>;
}
```

**Note**: The SDK's `AgentSideConnection` automatically handles:
- JSON-RPC message parsing/serialization
- stdio communication (stdin/stdout)
- Transport layer details
- We only need to register method handlers, similar to how MCP servers register tool handlers

### 2. AgentHandler Class

**Location**: `src/agent-handler.ts`

**Responsibilities**:
- Bridge between ACP protocol and `@tsagent/core` Agent interface
- Convert ACP content types to agent messages
- Convert agent responses to ACP content types
- Handle tool calls from agent
- Map ACP sessions to agent chat sessions

**Key Methods**:
```typescript
class AgentHandler {
  private agent: Agent;
  private logger: Logger;
  
  constructor(agent: Agent, logger: Logger);
  async processPrompt(sessionId: string, prompt: ACPPrompt): Promise<ACPResponse>;
  private convertACPContentToMessage(content: ACPContent[]): string;
  private convertAgentResponseToACP(response: MessageUpdate): ACPContent[];
  private handleToolCalls(toolCalls: ToolCall[]): Promise<ToolCallResult[]>;
}
```

### 3. SessionManager Class

**Location**: `src/session-manager.ts`

**Responsibilities**:
- Manage ACP session lifecycle
- Map ACP sessions to agent chat sessions
- Track session state and context
- Handle session cleanup

**Key Methods**:
```typescript
class ACPSession {
  readonly id: string;
  readonly chatSession: ChatSession;
  private context: Map<string, any>;
  
  constructor(sessionId: string, agent: Agent);
  async processPrompt(prompt: ACPPrompt): Promise<ACPResponse>;
  async cancel(): Promise<void>;
  async close(): Promise<void>;
}

class SessionManager {
  private sessions: Map<string, ACPSession>;
  
  createSession(sessionId: string, agent: Agent): ACPSession;
  getSession(sessionId: string): ACPSession | null;
  closeSession(sessionId: string): Promise<void>;
  closeAllSessions(): Promise<void>;
}
```

## Implementation Pattern

The implementation follows a pattern similar to the existing MCP servers in this codebase:

1. **SDK Handles Transport**: The `@agentclientprotocol/sdk` automatically handles:
   - JSON-RPC message parsing and serialization
   - stdio communication (reading from stdin, writing to stdout)
   - Message routing and dispatch

2. **We Register Handlers**: We only need to:
   - Create an `AgentSideConnection` instance
   - Register handlers for ACP protocol methods (likely via something like `connection.setRequestHandler()` or similar)
   - Connect the transport (likely just calling `connection.connect()` or similar)
   - The SDK handles everything else

3. **Similar to MCP Pattern**: 
   - MCP: `server.setRequestHandler(ListToolsRequestSchema, handler)`
   - ACP: Likely similar pattern - register handlers for `initialize`, `session/new`, `session/prompt`

**Example Pattern** (conceptual, exact API to be verified):
```typescript
// Create connection (SDK handles JSON-RPC + stdio)
const connection = new AgentSideConnection({
  // initialization options
});

// Register protocol method handlers
connection.onRequest('initialize', this.handleInitialize.bind(this));
connection.onRequest('session/new', this.handleSessionNew.bind(this));
connection.onRequest('session/prompt', this.handleSessionPrompt.bind(this));

// Connect (SDK sets up stdio transport automatically)
await connection.connect();
// At this point, SDK reads/writes to stdin/stdout automatically
```

## Implementation Details

### ACP Protocol Methods

#### 1. `initialize`
- **Purpose**: Negotiate protocol version and capabilities
- **Implementation**: 
  - Return server capabilities
  - Set up protocol version compatibility
  - Initialize agent metadata

#### 2. `session/new`
- **Purpose**: Create a new ACP session
- **Implementation**:
  - Generate or accept session ID
  - Create corresponding agent chat session via `agent.createChatSession(sessionId)`
  - Store session mapping in SessionManager
  - Return session metadata

#### 3. `session/prompt`
- **Purpose**: Send a prompt to the agent within a session
- **Implementation**:
  - Validate session exists
  - Convert ACP content to agent message format
  - Call `chatSession.handleMessage(message)`
  - Convert `MessageUpdate` response to ACP content format
  - Handle tool calls if present
  - Return ACP response with content

#### 4. `session/cancel` (notification)
- **Purpose**: Cancel an in-progress prompt
- **Implementation**:
  - Mark session as cancelled
  - Interrupt agent processing if possible
  - Clean up resources

### Content Type Conversion

#### ACP → Agent Message
- Extract text from ACP content items
- Support Markdown content (ACP default)
- Handle diff content types
- Combine multiple content items into single message

#### Agent Response → ACP
- Convert agent text response to ACP Markdown content
- Format tool calls as ACP tool call items
- Include metadata (tokens, model info) in response
- Handle streaming responses if supported

### Tool Call Handling

When agent returns tool calls:
1. Convert agent tool calls to ACP tool call format
2. Send tool calls to client via ACP
3. Wait for client tool results
4. Convert tool results back to agent format
5. Continue agent execution with tool results

### Error Handling

- Map agent errors to ACP error codes
- Handle session not found errors
- Handle agent initialization failures
- Graceful degradation when agent methods fail

## Integration Points

### 1. Agent Loading
- Use `loadAgent(agentPath, logger)` from `@tsagent/core/runtime`
- Similar to a2a-server implementation
- Handle agent initialization errors

### 2. Chat Session Management
- Use `agent.createChatSession(sessionId)` for each ACP session
- Use `chatSession.handleMessage(message)` for prompts
- Extract response from `MessageUpdate` object

### 3. Tool Integration
- Map agent tool calls to ACP tool call format
- Forward tool calls to client
- Inject tool results back into agent processing

## Dependencies

```json
{
  "dependencies": {
    "@agentclientprotocol/sdk": "^latest",
    "@tsagent/core": "^1.2.13"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "typescript": "^5.3.0",
    "tsx": "^4.7.0"
  }
}
```

## CLI Interface

### Command Structure
```bash
# Single agent ACP server
npx @tsagent/acp-server /path/to/agent

# With options
npx @tsagent/acp-server /path/to/agent --debug
```

### CLI Features
- Load agent from path
- Start ACP server (stdio communication)
- Handle graceful shutdown (SIGINT, SIGTERM)
- Logging configuration
- Error reporting

## Testing Strategy

### Unit Tests
- Test content type conversions
- Test session management
- Test error handling
- Test agent handler integration

### Integration Tests
- Test with ACP-compatible clients (e.g., Zed editor)
- Test session lifecycle
- Test tool call flow
- Test concurrent sessions

### Manual Testing
- Run server as subprocess
- Connect with ACP client
- Test various agent scenarios
- Test error cases

## Implementation Phases

### Phase 1: Core Server Setup
- [ ] Create package structure
- [ ] Set up dependencies (`@agentclientprotocol/sdk`, `@tsagent/core`)
- [ ] Implement basic ACPServer class with `AgentSideConnection`
- [ ] Load agent using `loadAgent()` from `@tsagent/core/runtime`
- [ ] Set up stdio transport via SDK (automatic)
- [ ] Register protocol method handlers via SDK API
- [ ] Implement `initialize` method handler

### Phase 2: Session Management
- [ ] Implement SessionManager
- [ ] Implement `session/new` method
- [ ] Implement basic session lifecycle
- [ ] Test session creation/destruction

### Phase 3: Agent Integration
- [ ] Implement AgentHandler
- [ ] Implement content type conversion
- [ ] Integrate with agent chat sessions
- [ ] Implement `session/prompt` method

### Phase 4: Tool Support
- [ ] Implement tool call conversion
- [ ] Handle tool call requests/responses
- [ ] Test tool integration

### Phase 5: Polish & Testing
- [ ] Add error handling
- [ ] Implement logging
- [ ] Create CLI interface
- [ ] Write tests
- [ ] Write documentation

### Phase 6: Documentation
- [ ] Write README.md
- [ ] Document API
- [ ] Add usage examples
- [ ] Document integration patterns

## Key Design Decisions

### 1. Leverage SDK Abstractions
- **Don't implement JSON-RPC**: SDK handles all JSON-RPC communication automatically
- **Use SDK's handler registration**: Register protocol method handlers via SDK API (similar to MCP `setRequestHandler()` pattern)
- **SDK manages transport**: `AgentSideConnection` handles stdio communication automatically
- **Focus on protocol logic**: Implement ACP protocol methods, not transport details

### 2. Session Mapping
- One ACP session = One agent chat session
- Use ACP session ID as agent chat session ID
- Maintain bidirectional mapping

### 3. Content Handling
- Default to Markdown for text content
- Extract plain text from Markdown for agent messages
- Preserve Markdown in responses when appropriate

### 4. Tool Calls
- Block on tool calls (wait for client response)
- Map tool names and parameters between formats
- Handle tool errors gracefully

### 5. Error Recovery
- Don't crash on agent errors
- Return proper ACP error responses
- Clean up sessions on errors

## Open Questions / Research Needed

1. **SDK API Details**: Need to verify exact API of `@agentclientprotocol/sdk`
   - `AgentSideConnection` class structure and initialization
   - Handler registration API (similar to MCP's `setRequestHandler()`?)
   - Protocol method handler signatures and return types
   - How to connect transport (likely automatic or simple `connect()` call)

2. **Content Types**: Need to understand ACP content type specifications
   - Diff content format
   - Markdown content format
   - Tool call content format

3. **Streaming**: Determine if/when to implement streaming responses
   - ACP may support streaming
   - Agent may support streaming
   - Integration approach

4. **Session Modes**: Understand ACP session modes if any
   - Different interaction patterns
   - Mode switching support

## References

- [ACP Documentation](https://agentclientprotocol.com/)
- [ACP TypeScript SDK](https://agentclientprotocol.com/libraries/typescript)
- [ACP Protocol Specification](https://agentclientprotocol.com/protocol/overview)
- [Existing a2a-server Implementation](./../packages/a2a-server/src/index.ts)

## Success Criteria

1. ✅ Server can be started as subprocess
2. ✅ Can communicate with ACP-compatible clients
3. ✅ Can load and use `@tsagent/core` agents
4. ✅ Sessions are properly managed
5. ✅ Prompts are processed correctly
6. ✅ Tool calls work end-to-end
7. ✅ Error handling is robust
8. ✅ Documentation is complete

