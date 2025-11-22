#!/usr/bin/env node

import { ConsoleLogger } from './logger.js';
import { AgentManagementMCPServer } from './agent-mcp-server.js';

// Parse command-line arguments
const args = process.argv.slice(2);
let debug = false;
for (const arg of args) {
  if (arg === '--debug' || arg === '-d') {
    debug = true;
  }
}

// Create logger with verbose enabled during startup only
const logger = new ConsoleLogger(true);
const server = new AgentManagementMCPServer(logger, debug);

server.start().catch((error) => {
  logger.error('Failed to start Agent Management MCP server:', error);
  process.exit(1);
});
