# A2A Server

An A2A (Agent-to-Agent) server that wraps our agent using the agent-api package. This server provides HTTP endpoints for interacting with agents through a REST API.

## Features

- HTTP REST API for agent interactions
- Chat session management
- Health check endpoints
- Agent information endpoints
- Express.js based server

## Installation

```bash
npm install
```

## Usage

```typescript
import { A2AServer } from 'a2a-server';
import { createAgent } from 'agent-api/runtime';
import { Logger } from 'agent-api';

// Create an agent instance
const logger: Logger = {
  error: console.error,
  warn: console.warn,
  info: console.log,
  debug: console.debug
};

const agent = await createAgent('/path/to/agent', logger, {
  name: 'My Agent',
  description: 'A helpful agent',
  model: 'claude-3.5-sonnet',
  // ... other config
});

// Start the A2A server (uses port 4000 by default)
const server = new A2AServer(agent);
server.start(4000);
```

## A2A Protocol Endpoints

This server implements the [A2A Protocol](https://github.com/a2aproject/a2a-js) and provides the following endpoints:

### GET /.well-known/agent-card.json
Get the agent card describing the server's capabilities.

**Response:**
```json
{
  "name": "My Agent",
  "description": "Agent powered by agent-api",
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "stateTransitionHistory": false
  },
  "endpoints": {
    "streaming": "/stream",
    "webhooks": "/webhooks"
  }
}
```

### POST /stream
Send a message to the agent and get a streaming response following the A2A protocol.

### POST /webhooks
Webhook endpoint for push notifications (if enabled).

## Development

```bash
# Build the package
npm run build

# Run in development mode
npm run dev

# Run tests
npm test

# Start the server
npm start
```
