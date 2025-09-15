# A2A MCP Server

An MCP (Model Context Protocol) server that bridges to A2A servers via the A2A client. This server allows MCP clients to interact with A2A servers through standardized MCP tools.

## Features

- MCP protocol compliance
- Bridge to A2A servers
- Chat functionality
- Health check tools
- Agent information tools

## Installation

```bash
npm install
```

## Usage

### As an MCP Server

```bash
# Run the MCP server
npx a2a-mcp
```

### Programmatically

```typescript
import { A2AMCPServer } from 'a2a-mcp';

const server = new A2AMCPServer();
await server.start();
```

## Available Tools

### a2a_chat
Send a message to an A2A server and get a response.

**Parameters:**
- `message` (required): The message to send to the A2A server
- `serverUrl` (optional): The URL of the A2A server (default: http://localhost:3000)
- `sessionId` (optional): Session ID for maintaining conversation context

### a2a_health_check
Check the health status of an A2A server.

**Parameters:**
- `serverUrl` (optional): The URL of the A2A server (default: http://localhost:3000)

### a2a_agent_info
Get information about the agent running on an A2A server.

**Parameters:**
- `serverUrl` (optional): The URL of the A2A server (default: http://localhost:3000)

## Example MCP Client Usage

```typescript
// List available tools
const tools = await client.listTools();

// Send a chat message
const response = await client.callTool({
  name: 'a2a_chat',
  arguments: {
    message: 'Hello, how are you?',
    serverUrl: 'http://localhost:3000'
  }
});
```

## Development

```bash
# Build the package
npm run build

# Run in development mode
npm run dev

# Run tests
npm test
```

## Configuration

The server can be configured by setting environment variables:

- `A2A_SERVER_URL`: Default A2A server URL (default: http://localhost:3000)
- `MCP_SERVER_NAME`: MCP server name (default: a2a-mcp)
- `MCP_SERVER_VERSION`: MCP server version (default: 1.0.0)

