#!/usr/bin/env node

import * as path from 'path';
import { pathToFileURL } from 'url';
import { Command } from 'commander';
import { ACPServer } from './server.js';
import { ConsoleLogger } from './logger.js';
import packageJson from '../package.json' with { type: 'json' };

// Export server class and types
export { ACPServer, type ACPServerOptions } from './server.js';
export { SessionManager, ACPSession } from './session-manager.js';
export { ConsoleLogger } from './logger.js';

// Options interface for run() function
export interface ACPServerRunOptions {
  agentPaths: string[];  // Always an array, even for single-agent servers
  debug?: boolean;       // Unified: --debug/-d (verbose logging)
  help?: boolean;        // Unified: --help/-h
}

/**
 * Run the ACP server with parsed options
 */
export async function run(options: ACPServerRunOptions): Promise<void> {
  if (options.agentPaths.length === 0) {
    throw new Error('Agent path is required');
  }
  
  if (options.agentPaths.length > 1) {
    throw new Error('ACP server only supports a single agent');
  }

  const agentPath = options.agentPaths[0];
  const debug = options.debug || false;

  const logger = new ConsoleLogger();
  if (debug) {
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
      verbose: debug
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
    throw error;
  }
}

/**
 * Normalize agent path - converts relative filenames to absolute paths
 * If path is absolute, use as-is. If relative filename, resolve relative to process.cwd().
 */
function normalizeAgentPath(pathArg: string): string {
  if (path.isAbsolute(pathArg)) {
    return path.resolve(pathArg);
  }
  // Relative path - resolve relative to process.cwd()
  return path.resolve(process.cwd(), pathArg);
}

/**
 * Parse command-line arguments into options using commander
 */
function parseArgs(args: string[], programName?: string): ACPServerRunOptions {
  const cmd = new Command()
    .name(programName || 'tsagent-acp-server')
    .description('ACP (Agent Client Protocol) server for @tsagent/core agents')
    .version(packageJson.version, '-v, --version', 'Display version number')
    .argument('<agent-path>', 'Path to the agent file (.yaml or .yml)')
    .option('--debug, -d', 'Enable debug/verbose logging')
    .helpOption('-h, --help', 'Display help for command')
    .configureOutput({
      writeErr: (str) => {
        // Intercept commander's error output for unknown options
        if (str.includes('unknown option')) {
          const match = str.match(/unknown option ['"]([^'"]+)['"]/);
          const option = match ? match[1] : 'unknown';
          process.stderr.write(`Error: Unknown option: ${option}\n\n`);
          cmd.outputHelp();
          process.exit(1);
        } else {
          process.stderr.write(str);
        }
      }
    });

  cmd.parse(args, { from: 'user' });
  
  const opts = cmd.opts();
  const agentPathArg = cmd.args[0];
  
  if (!agentPathArg) {
    console.error('Error: Agent path is required');
    console.error('');
    cmd.outputHelp();
    process.exit(1);
  }

  const debug = opts.debug || false;

  return {
    agentPaths: [normalizeAgentPath(agentPathArg)],
    debug,
    help: false // commander handles help automatically
  };
}

/**
 * Main entrypoint - parses process.argv and calls run()
 * Can also be called with explicit args for CLI integration
 */
export async function main(args?: string[], programName?: string): Promise<void> {
  // Use provided args or fall back to process.argv
  const argv = args ?? process.argv.slice(2);
  
  try {
    const options = parseArgs(argv, programName);
    await run(options);
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to start ACP server: ${errorMessage}`);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
