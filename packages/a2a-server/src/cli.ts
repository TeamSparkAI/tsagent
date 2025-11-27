#!/usr/bin/env node

import { A2AServer, MultiA2AServer } from './index.js';
import { ConsoleLogger } from './logger.js';

interface CliOptions {
  agentPaths: string[];
  port: number;
  help: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    agentPaths: [],
    port: 4000,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--port' || arg === '-p') {
      const portArg = args[i + 1];
      if (portArg && !isNaN(parseInt(portArg))) {
        options.port = parseInt(portArg);
        i++; // Skip next argument as it's the port value
      } else {
        console.error('Error: --port requires a valid number');
        process.exit(1);
      }
    } else if (!arg.startsWith('-')) {
      // All non-flag arguments are agent paths
      options.agentPaths.push(arg);
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
@tsagent/server - Simple A2A protocol server for @tsagent/core agents

Usage:
  tsagent-server <agent-path> [agent-path...] [options]

Arguments:
  agent-path          Path to the agent file (at least one required)

Options:
  --port, -p <number> Port to run the server on (default: 4000)
  --help, -h          Show this help message

Examples:
  # Single agent (backward compatible)
  tsagent-server /path/to/my-agent
  
  # Multiple agents
  tsagent-server /path/to/agent1 /path/to/agent2 /path/to/agent3
  
  # Multiple agents with custom port
  tsagent-server --port 3000 /path/to/agent1 /path/to/agent2
  
  # Single agent with custom port
  tsagent-server /path/to/my-agent --port 5000

Multi-Agent Mode:
  When multiple agents are provided, each agent will be available at:
  - http://localhost:PORT/agents/{agent-name}/.well-known/agent-card.json
  - http://localhost:PORT/agents/{agent-name}/stream
  - http://localhost:PORT/agents (discovery endpoint)
  
  Agent URLs are deterministic based on the agent's name and path.
  If multiple agents have the same name, numbers will be appended (e.g., my-agent-1, my-agent-2).
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    return;
  }

  if (options.agentPaths.length === 0) {
    console.error('Error: At least one agent path is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  const logger = new ConsoleLogger();
  let server: A2AServer | MultiA2AServer | null = null;
  let isShuttingDown = false;
  
  try {
    logger.info(`Starting @tsagent/server...`);
    logger.info(`Agent paths: ${options.agentPaths.join(', ')}`);
    logger.info(`Port: ${options.port}`);

    if (options.agentPaths.length === 1) {
      // Single agent mode - use original A2AServer for backward compatibility
      logger.info('Running in single-agent mode');
      server = new A2AServer(options.agentPaths[0], options.port);
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
      server = new MultiA2AServer(options.port);
      
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
    process.exit(1);
  }
}

// Run the CLI
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
