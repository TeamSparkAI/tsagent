# MCP Tool Sharing via ACP

## Overview

The Agent Client Protocol (ACP) enables clients (like code editors such as Zed) to pass their own MCP (Model Context Protocol) servers to agents during session creation. This allows agents to access tools and context that the client has configured, creating a seamless integration where the agent can use client-provided capabilities.

## How ACP Supports MCP Servers

### Protocol Specification

When a client creates a new ACP session via `session/new`, it can include an array of MCP servers:

```typescript
interface NewSessionRequest {
  cwd: string;  // Working directory for the session
  mcpServers: McpServer[];  // MCP servers from the client
}
```

### MCP Server Types

ACP supports three types of MCP servers:

1. **HTTP**: `{ type: "http", name: string, url: string, headers: HttpHeader[] }`
2. **SSE**: `{ type: "sse", name: string, url: string, headers: HttpHeader[] }`
3. **Stdio**: `{ command: string, args: string[], env: EnvVariable[], name: string }`

### Example: Zed Editor Configuration

A client like Zed might configure MCP servers and pass them to the agent:

```json
{
  "acp_agents": {
    "tsagent": {
      "command": "node",
      "args": ["@tsagent/acp-server", "/path/to/agent"]
    }
  },
  "context_servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git"]
    }
  }
}
```

When Zed creates a session with the agent, it would pass these MCP servers in the `session/new` request, allowing the agent to use filesystem and git tools.

## Current State

### What's Not Implemented

Currently, the `acp-server` implementation **ignores** the `mcpServers` parameter in `newSession`:

```typescript
async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
  // ❌ params.mcpServers is ignored
  const sessionId = this.generateSessionId();
  const session = this.sessionManager.createSession(sessionId);
  return { sessionId: session.id };
}
```

### Why It's Not Implemented

The `@tsagent/core` agent API only supports **agent-level** MCP servers that are:
- Persisted in `tsagent.json`
- Shared across all sessions
- Managed via `saveMcpServer()` / `deleteMcpServer()`

There is **no mechanism** for:
- Session-level, ephemeral MCP servers
- Dynamically adding MCP servers per session
- Client-provided MCP servers

## Implementation Plan

### Phase 1: Agent API Extensions

#### 1.1 Session-Level MCP Client Management

**Location**: `packages/agent-api/src/core/chat-session.ts`

Add session-scoped MCP client management to `ChatSessionImpl`:

```typescript
export class ChatSessionImpl implements ChatSession {
  // Existing properties...
  private sessionMcpClients: Map<string, McpClient> = new Map();
  
  // New methods - session only manages its own clients
  async addSessionMcpServer(config: McpConfig): Promise<void>;
  async removeSessionMcpServer(serverName: string): Promise<void>;
  getSessionMcpClients(): Promise<Record<string, McpClient>>;
}
```

**Implementation Details:**
- Store MCP clients in a `Map<string, McpClient>` keyed by server name
- Create clients using existing `MCPClientManagerImpl.createMcpClientFromConfig()` pattern
- Connect clients eagerly during session creation
- Disconnect and cleanup on session deletion
- **Session only manages its own clients** - merging with agent-level clients happens in `ProviderHelper.getIncludedTools()`

#### 1.2 ChatSessionOptions Extension

**Location**: `packages/agent-api/src/types/chat.ts`

Add support for session-level MCP servers in session options:

```typescript
interface ChatSessionOptions {
  // ... existing options
  sessionMcpServers?: McpConfig[];  // Ephemeral MCP servers for this session
}
```

**Behavior:**
- MCP servers are **not persisted** to `tsagent.json`
- They are **ephemeral** - only exist for the session lifetime
- They are **cleaned up** when the session is deleted

#### 1.3 Tool Inclusion Strategy

**All tools from client MCP servers are treated as `always` include:**

- Automatically added to session context upon connection
- Always available in request context (no semantic filtering)
- Take precedence over agent-level tools with the same name
- Bypass semantic search (already in session context)

**Implementation in `ChatSessionImpl` constructor:**

```typescript
constructor(agent: Agent, id: string, options: ChatSessionOptionsWithRequiredSettings, logger: Logger) {
  // ... existing initialization ...
  
  // Initialize session MCP servers if provided
  if (options.sessionMcpServers) {
    for (const mcpConfig of options.sessionMcpServers) {
      // Create and connect MCP client
      const client = await this.createSessionMcpClient(mcpConfig);
      await client.connect();
      this.sessionMcpClients.set(mcpConfig.name, client);
      
      // Add ALL tools to session context with 'always' mode
      for (const tool of client.serverTools) {
        this.addTool(mcpConfig.name, tool.name, 'always');
      }
    }
  }
}
```

#### 1.4 Tool Resolution Updates

**Location**: `packages/agent-api/src/core/chat-session.ts`

**In `getAgentModeItems()`:**
- Exclude session MCP servers from semantic search
- Only agent-level tools with `include: 'agent'` are considered
- Session MCP tools are already in session context, so they're excluded from this list

**In `buildRequestContext()`:**
- No changes needed - session MCP tools are already in session context
- They automatically flow through to request context (Step 1)

**In `ProviderHelper.getIncludedTools()`:**
- Update to also check `session.getSessionMcpClients()` in addition to `agent.getAllMcpClients()`
- Merge both sources, with session clients taking precedence
- This is the appropriate place for merging logic - it already has access to both agent and session

**Location**: `packages/agent-api/src/providers/provider-helper.ts`

**In `getIncludedTools()`:**
- Currently gets agent MCP clients via `agent.getAllMcpClients()`
- Currently gets session tools via `session.getIncludedTools()`
- **Update**: Also get session MCP clients via `session.getSessionMcpClients()`
- Merge agent-level + session-level MCP clients
- Session-level clients take precedence on name conflicts
- All tools from session-level clients are included (they're in session context)
- This is where the merging logic belongs - the session doesn't need to know about agent-level clients

#### 1.5 Lifecycle Management

**On Session Creation:**
1. Convert ACP `McpServer[]` → tsagent `McpConfig[]` (handled in acp-server)
2. Create and connect MCP clients
3. Add all tools to session context with `always` mode
4. Store clients in `sessionMcpClients` map

**On Session Deletion:**
1. Disconnect all session MCP clients
2. Clean up resources
3. Remove from `sessionMcpClients` map

**Error Handling:**
- If session MCP server fails to connect, log error but don't fail session creation
- Allow session to proceed with agent-level tools only
- Graceful degradation

### Phase 2: ACP Server Implementation

#### 2.1 ACP to TsAgent Format Conversion

**Location**: `packages/acp-server/src/acp-server.ts`

Create a converter function:

```typescript
function convertAcpMcpServerToTsAgentConfig(acpServer: McpServer): McpConfig {
  if (acpServer.type === 'http' || acpServer.type === 'sse') {
    return {
      name: acpServer.name,
      config: {
        type: acpServer.type,
        url: acpServer.url,
        headers: acpServer.headers.reduce((acc, h) => {
          acc[h.name] = h.value;
          return acc;
        }, {} as Record<string, string>),
      },
    };
  } else {
    // Stdio type
    return {
      name: acpServer.name,
      config: {
        type: 'stdio',
        command: acpServer.command,
        args: acpServer.args,
        env: acpServer.env.reduce((acc, e) => {
          acc[e.name] = e.value;
          return acc;
        }, {} as Record<string, string>),
      },
    };
  }
}
```

#### 2.2 Update newSession Handler

**Location**: `packages/acp-server/src/acp-server.ts`

Modify `TsAgentACPAgent.newSession()`:

```typescript
async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
  this.logger.debug('Handling newSession request');

  // Convert ACP MCP servers to tsagent format
  const sessionMcpServers: McpConfig[] = params.mcpServers.map(
    convertAcpMcpServerToTsAgentConfig
  );

  // Generate session ID
  const sessionId = this.generateSessionId();
  
  // Create new session with client MCP servers
  const session = this.sessionManager.createSession(sessionId, {
    sessionMcpServers,  // Pass to ChatSessionOptions
    // Note: params.cwd (working directory) is not used in initial implementation
    // See "Future Enhancements" section for potential uses
  });

  return {
    sessionId: session.id,
  };
}
```
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
read_file

#### 2.3 Update SessionManager

**Location**: `packages/acp-server/src/session-manager.ts`

Modify `SessionManager.createSession()` to accept options:

```typescript
createSession(sessionId: string, options?: ChatSessionOptions): ACPSession {
  const chatSession = this.agent.createChatSession(sessionId, options);
  const acpSession = new ACPSession(sessionId, this.agent, chatSession, this.logger);
  this.sessions.set(sessionId, acpSession);
  return acpSession;
}
```

#### 2.4 Error Handling

**Connection Failures:**
- Log errors to stderr (not stdout - protocol communication)
- Continue session creation even if some MCP servers fail
- Allow agent to use successfully connected servers

**Name Conflicts:**
- If client provides MCP server with same name as agent-level server, client wins
- Log warning about conflict
- Session tools shadow agent tools

### Phase 3: Testing & Validation

#### 3.1 Unit Tests

- Test ACP → TsAgent format conversion
- Test session MCP client creation and connection
- Test tool inclusion in session context
- Test cleanup on session deletion
- Test error handling (failed connections)

#### 3.2 Integration Tests

- Test full flow: ACP client → acp-server → agent API → session
- Test with real MCP servers (filesystem, git, etc.)
- Test semantic search exclusion of session MCP tools
- Test tool resolution priority (session vs agent)

#### 3.3 Manual Testing

- Configure Zed with MCP servers
- Verify tools are available in agent sessions
- Verify tools are always included (not filtered by semantic search)
- Verify cleanup on session close

## Architecture Decisions

### Why Session-Level, Not Agent-Level?

1. **Ephemeral Nature**: Client MCP servers are session-specific, not agent configuration
2. **No Persistence**: Should not be saved to `tsagent.json`
3. **Isolation**: Each session can have different client-provided servers
4. **Cleanup**: Automatic cleanup when session ends

### Why `always` Include Mode?

1. **Client Intent**: Client explicitly provided these servers - they should be available
2. **No Filtering**: Semantic search is for agent-level tools, not client-provided ones
3. **Simplicity**: No need for complex include mode configuration
4. **Performance**: Tools are immediately available, no search overhead

### Why Session Clients Take Precedence?

1. **Client Authority**: Client knows what tools it wants the agent to use
2. **Session Isolation**: Each session can override agent defaults
3. **Predictable Behavior**: Clear priority order (session > agent)

## Future Enhancements

### Working Directory (cwd)

The ACP protocol provides a `cwd` (working directory) parameter in `NewSessionRequest`, but it's not used in the initial implementation. Potential future uses:

- **Session-level working directory**: Set a working directory for the session that affects file operations, tool execution, etc.
- **MCP server cwd**: Already supported in MCP client stdio configuration, but could be overridden per-session
- **File path resolution**: Use cwd as base for relative file paths in prompts and tool calls

This would require:
- Adding `cwd` to `ChatSessionOptions` and `ChatSessionImpl`
- Determining how it affects session behavior (file operations, tool execution, etc.)
- Deciding precedence: session cwd vs agent directory vs process cwd

### Optional: Include Mode Override

If needed in the future, could allow clients to specify include modes:

```typescript
interface SessionMcpServerConfig extends McpConfig {
  toolInclude?: {
    serverDefault?: 'always' | 'manual' | 'agent';
    tools?: Record<string, 'always' | 'manual' | 'agent'>;
  };
}
```

But for now, defaulting to `always` is the right approach.

### Optional: Dynamic Addition

Could support adding MCP servers mid-session via a new ACP method, but this is not in the current ACP spec.

## Related Documentation

- [Context Management System](../../../docs/context-system.md)
- [Tool Context Management](../../../docs/tool-context-management.md)
- [ACP Protocol Specification](https://agentclientprotocol.com/protocol/session-setup#mcp-servers)

