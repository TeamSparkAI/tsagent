#!/usr/bin/env node

import * as path from 'path';
import { pathToFileURL } from 'url';
import { Command } from 'commander';
import { A2AServer, MultiA2AServer } from './server.js';
import { ConsoleLogger } from './logger.js';
import packageJson from '../package.json' with { type: 'json' };

// Export server classes
export { A2AServer, MultiA2AServer, SimpleAgentExecutor } from './server.js';
export { ConsoleLogger } from './logger.js';

// Options interface for run() function
export interface A2AServerOptions {
  agentPaths: string[];  // Always an array (supports multi-agent mode)
  debug?: boolean;       // Unified: --debug/-d (verbose logging)
  help?: boolean;        // Unified: --help/-h
  port?: number;         // --port/-p (default: 4000)
}

/**
 * Run the A2A server with parsed options
 */
export async function run(options: A2AServerOptions): Promise<void> {
  if (options.agentPaths.length === 0) {
    throw new Error('At least one agent path is required');
  }

  const logger = new ConsoleLogger();
  // Note: ConsoleLogger doesn't have verbose mode, debug flag is for future use

  let server: A2AServer | MultiA2AServer | null = null;
  let isShuttingDown = false;
  
  try {
    logger.info(`Starting @tsagent/server...`);
    logger.info(`Agent paths: ${options.agentPaths.join(', ')}`);
    logger.info(`Port: ${options.port || 4000}`);

    if (options.agentPaths.length === 1) {
      // Single agent mode - use original A2AServer for backward compatibility
      logger.info('Running in single-agent mode');
      server = new A2AServer(options.agentPaths[0], options.port || 4000);
      const result = await server.start();
      
      // Display agent URLs
      console.log('\n🚀 @tsagent/server Started Successfully!');
      console.log('═'.repeat(50));
      console.log(`📡 Server running on port: ${result.port}`);
      console.log(`🤖 Agent: ${(server as A2AServer)['agent'].name}`);
      console.log(`🔗 Agent URL: ${result.baseUrl}`);
      console.log('');
    } else {
      // Multi-agent mode - use new MultiA2AServer
      logger.info(`Running in multi-agent mode with ${options.agentPaths.length} agents`);
      server = new MultiA2AServer(options.port || 4000);
      
      // Register all agents
      for (const agentPath of options.agentPaths) {
        await (server as MultiA2AServer).registerAgent(agentPath);
      }
      
      const result = await (server as MultiA2AServer).start();
      
      // Display agent URLs
      console.log('\n🚀 @tsagent/server (multi) Started Successfully!');
      console.log('═'.repeat(50));
      console.log(`📡 Server running on port: ${result.port}`);
      console.log(`🔍 Discovery endpoint: ${result.discoveryUrl}`);
      console.log(`🤖 Registered agents: ${result.agents.length}`);
      console.log('');
      console.log('🔗 Available Agents:');
      
      result.agents.forEach((agent, index) => {
        console.log(`   ${index + 1}. ${agent.name} (ID: ${agent.id})`);
        console.log(`      Agent URL: ${agent.baseUrl}`);
      });
      
      console.log('');
      console.log('💡 Tip: Use the discovery endpoint to list all agents programmatically');
      console.log(`   GET ${result.discoveryUrl}`);
      console.log('');
    }

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
          await server.shutdown();
          logger.info('Server shutdown complete');
        } catch (error) {
          logger.error('Error during shutdown:', error);
        }
      }
      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  } catch (error) {
    logger.error('Failed to start A2A Server:', error);
    if (server && !isShuttingDown) {
      try {
        await server.shutdown();
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
function parseArgs(args: string[], programName?: string): A2AServerOptions {
  const cmd = new Command()
    .name(programName || 'tsagent-server')
    .description('Simple A2A protocol server for @tsagent/core agents')
    .version(packageJson.version, '-v, --version', 'Display version number')
    .argument('<agent-path...>', 'Path to agent file(s) (.yaml or .yml) - at least one required')
    .option('--port, -p <number>', 'Port to run the server on', '4000')
    .option('--debug, -d', 'Enable debug/verbose logging')
    .helpOption('-h, --help', 'Display help for command')
    .addHelpText('after', `
Examples:
  # Single agent (backward compatible)
  tsagent-server /path/to/my-agent.yaml
  
  # Multiple agents
  tsagent-server /path/to/agent1.yaml /path/to/agent2.yaml /path/to/agent3.yaml
  
  # Multiple agents with custom port
  tsagent-server --port 3000 /path/to/agent1.yaml /path/to/agent2.yaml
  
  # Single agent with custom port and debug
  tsagent-server /path/to/my-agent.yaml --port 5000 --debug

Multi-Agent Mode:
  When multiple agents are provided, each agent will be available at:
  - http://localhost:PORT/agents/{agent-name}/.well-known/agent-card.json
  - http://localhost:PORT/agents/{agent-name}/stream
  - http://localhost:PORT/agents (discovery endpoint)
  
  Agent URLs are deterministic based on the agent's name and path.
  If multiple agents have the same name, numbers will be appended (e.g., my-agent-1, my-agent-2).
`)
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
  const agentPathArgs = cmd.args;
  
  if (agentPathArgs.length === 0) {
    console.error('Error: At least one agent path is required');
    console.error('');
    cmd.outputHelp();
    process.exit(1);
  }

  // Parse port (commander uses the long option name as the key)
  // If port is undefined, use default 4000
  const portValue = opts.port;
  const port = portValue !== undefined ? parseInt(String(portValue), 10) : 4000;
  if (isNaN(port)) {
    console.error('Error: --port requires a valid number');
    console.error('');
    cmd.outputHelp();
    process.exit(1);
  }

  // Normalize all agent paths
  const agentPaths = agentPathArgs
    .filter(arg => arg.endsWith('.yaml') || arg.endsWith('.yml'))
    .map(arg => normalizeAgentPath(arg));

  if (agentPaths.length === 0) {
    console.error('Error: At least one valid agent path (.yaml or .yml) is required');
    console.error('');
    cmd.outputHelp();
    process.exit(1);
  }

  return {
    agentPaths,
    port,
    debug: opts.debug || false,
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(errorMessage);
    if (errorMessage.includes('--port') || errorMessage.includes('agent path')) {
      console.error('Use --help for usage information');
    }
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
