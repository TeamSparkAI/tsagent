#!/usr/bin/env node

import { AGENT_FILE_NAME } from '@tsagent/core';
import { ACPServer } from './acp-server.js';
import { ConsoleLogger } from './logger.js';

export { ACPServer, type ACPServerOptions } from './acp-server.js';
export { SessionManager, ACPSession } from './session-manager.js';
export { ConsoleLogger } from './logger.js';

// Main entrypoint when executed directly
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let agentPath: string | undefined;
  let verbose = false;

  // Parse command-line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      console.error(`
@tsagent/acp-server - ACP (Agent Client Protocol) server for @tsagent/core agents

Usage:
  tsagent-acp-server <agent-path> [options]

Arguments:
  agent-path          Path to the agent directory (required)

Options:
  --verbose, -v       Enable verbose logging
  --debug             Alias for --verbose
  --help, -h          Show this help message

Examples:
  # Start ACP server with an agent
  tsagent-acp-server /path/to/my-agent
  
  # Start with verbose logging
  tsagent-acp-server /path/to/my-agent --verbose
`);
      process.exit(0);
    } else if (arg === '--verbose' || arg === '-v' || arg === '--debug') {
      verbose = true;
    } else if (!arg.startsWith('-')) {
      // First non-flag argument is the agent path
      if (!agentPath) {
        agentPath = arg;
      }
    }
  }

  if (!agentPath) {
    console.error('Error: Agent path is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  const logger = new ConsoleLogger();
  if (verbose) {
    logger.setVerbose(true);
  }

  let server: ACPServer | null = null;
  let isShuttingDown = false;
  
  try {
    logger.info(`Starting @tsagent/acp-server...`);
    logger.info(`Agent path: ${agentPath}`);

    // Create and start the ACP server
    server = new ACPServer(agentPath, {
      logger,
      verbose
    });

    await server.start();
    
    logger.info('ACP server started successfully');
    logger.info('Communicating via stdio (stdin/stdout)');
    logger.info('Waiting for ACP client connections...');

    // Handle graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      if (isShuttingDown) {
        logger.warn(`Received ${signal} but shutdown is already in progress, ignoring`);
        return;
      }
      
      isShuttingDown = true;
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      if (server) {
        try {
          await server.stop();
          logger.info('ACP server shutdown complete');
        } catch (error) {
          logger.error('Error during shutdown:', error);
        }
      }
      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Keep the process running - the SDK handles stdio communication
    // The process will exit when the client closes the connection

  } catch (error: any) {
    logger.error(`Failed to start ACP server: ${error.message}`, error);
    if (server && !isShuttingDown) {
      try {
        await server.stop();
      } catch (shutdownError) {
        logger.error('Error during shutdown after startup failure:', shutdownError);
      }
    }
    process.exit(1);
  }
}

// Run main function when executed directly
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
