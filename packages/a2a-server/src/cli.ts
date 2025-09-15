#!/usr/bin/env node

import { A2AServer } from './index';
import { ConsoleLogger } from './logger';

interface CliOptions {
  agentPath: string;
  port: number;
  help: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    agentPath: '',
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
    } else if (!arg.startsWith('-') && !options.agentPath) {
      // First non-flag argument is the agent path
      options.agentPath = arg;
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
A2A Server - Simple A2A protocol server for agent-api agents

Usage:
  a2a-server <agent-path> [options]

Arguments:
  agent-path          Path to the agent directory (required)

Options:
  --port, -p <number> Port to run the server on (default: 4000)
  --help, -h          Show this help message

Examples:
  a2a-server /path/to/my-agent
  a2a-server /path/to/my-agent --port 3000
  a2a-server /path/to/my-agent -p 5000

The agent directory should contain:
  - tspark.json (agent configuration)
  - prompt.md (system prompt)
  - rules/ (optional rules directory)
  - refs/ (optional references directory)
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    return;
  }

  if (!options.agentPath) {
    console.error('Error: Agent path is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  const logger = new ConsoleLogger();
  
  try {
    logger.info(`Starting A2A Server...`);
    logger.info(`Agent path: ${options.agentPath}`);
    logger.info(`Port: ${options.port}`);

    const server = new A2AServer(options.agentPath, options.port);
    await server.start();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start A2A Server:', error);
    process.exit(1);
  }
}

// Run the CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
