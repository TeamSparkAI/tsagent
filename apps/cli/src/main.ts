#!/usr/bin/env node

import { program } from 'commander';
import path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { agentExists, loadAndInitializeAgent, createAgent } from '@tsagent/core/runtime';
import { Agent } from '@tsagent/core';
import { WinstonLoggerAdapter } from './logger.js';
import { setupCLI } from './cli.js';
import packageJson from '../package.json' with { type: 'json' };

export const PRODUCT_NAME = 'TsAgent CLI';

/**
 * Normalize agent path - converts relative filenames to absolute paths
 * If path is absolute, use as-is. If relative filename, check if exists in cwd and expand.
 */
function normalizeAgentPath(pathArg: string): string {
  if (path.isAbsolute(pathArg)) {
    return path.resolve(pathArg);
  }
  // Relative path - check if exists in cwd
  const cwdPath = path.resolve(process.cwd(), pathArg);
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }
  // If doesn't exist, still resolve to absolute (for --create case)
  return cwdPath;
}

async function main() {
  const logger = new WinstonLoggerAdapter();
  
  // Check for server launcher flags BEFORE parsing - if found, pass all args directly to server
  const rawArgs = process.argv.slice(2);
  
  if (rawArgs.includes('--mcp')) {
    const serverArgs = rawArgs.filter(arg => arg !== '--mcp');
    const { main: metaMCPMain } = await import('@tsagent/meta-mcp');
    await metaMCPMain(serverArgs, 'tsagent --mcp');
    return;
  }
  if (rawArgs.includes('--a2a')) {
    const serverArgs = rawArgs.filter(arg => arg !== '--a2a');
    const { main: a2aMain } = await import('@tsagent/server');
    await a2aMain(serverArgs, 'tsagent --a2a');
    return;
  }
  if (rawArgs.includes('--acp')) {
    const serverArgs = rawArgs.filter(arg => arg !== '--acp');
    const { main: acpMain } = await import('@tsagent/acp-server');
    await acpMain(serverArgs, 'tsagent --acp');
    return;
  }
  
  program
    .name('tsagent')
    .description(PRODUCT_NAME)
    .version(packageJson.version, '-v, --version', 'Display version number')
    .addHelpText('after', `
Server Launcher Options:
  Use --mcp, --a2a, or --acp to launch the respective server. All remaining arguments
  (including agent paths and server-specific options) are passed directly to the server.
  
  To get help for a specific server, use: --mcp -h, --a2a -h, or --acp -h

For more information, visit https://github.com/TeamSparkAI/tsagent`)
    .argument('[agent-path]', 'Agent file path (.yaml or .yml) - required for interactive mode')
    .option('--create', 'Create new agent if it doesn\'t exist')
    .option('--debug, -d', 'Enable debug/verbose logging')
    .option('--mcp', 'Launch MCP server with agent')
    .option('--a2a', 'Launch A2A server with agent(s)')
    .option('--acp', 'Launch ACP server with agent')
    .helpOption('-h, --help', 'Display help for command')
    .configureOutput({
      writeErr: (str) => {
        // Intercept commander's error output
        if (str.includes('unknown option')) {
          const match = str.match(/unknown option ['"]([^'"]+)['"]/);
          const option = match ? match[1] : 'unknown';
          console.error(chalk.red(`Unknown option: ${option}`));
          console.error('');
          program.outputHelp();
          process.exit(1);
        } else {
          console.error(str);
        }
      }
    });

  // Parse arguments - commander will handle help flags and exit automatically
  program.parse();

  const options = program.opts();
  const args = program.args;

  // Set logging level based on debug flag
  if (options.debug) {
    logger.setLevel('debug');
  }

  // Regular CLI mode - requires agent path
  if (args.length === 0) {
    console.error(chalk.red(`${PRODUCT_NAME} requires an agent path`));
    console.error('');
    program.outputHelp();
    process.exit(1);
  }

  logger.info(`Starting ${PRODUCT_NAME}`);

  // Normalize agent path
  const agentPathArg = args[0];
  const agentPath = normalizeAgentPath(agentPathArg);
  
  logger.info(`Agent path: ${agentPath}`);

  let agent: Agent | null = null;
  
  if (options.create) {
    try {
      logger.info('Creating new agent');
      agent = await createAgent(agentPath, logger);
      console.log(chalk.green(`Created new agent at: ${agentPath}`));
    } catch (error) {
      console.error(chalk.red(`Failed to create agent: ${error}`));
      logger.error('Failed to create agent:', error);
      process.exit(1);
    }
  } else {
    try {
      // First check if agent exists
      if (!(await agentExists(agentPath))) {
        console.error(chalk.red(`${PRODUCT_NAME} failed to locate agent at path: ${agentPath}`));
        console.error('');
        program.outputHelp();
        logger.error(`Agent not found at path: ${agentPath}`);
        process.exit(1);
      }
      
      // Agent exists, try to load it
      logger.info('Loading existing agent');
      agent = await loadAndInitializeAgent(agentPath, logger);
    } catch (error) {
      console.error(chalk.red(`Error loading agent: ${error instanceof Error ? error.message : 'Unknown error'}`));
      logger.error('Error loading agent:', error);
      process.exit(1);
    }
  }

  if (!agent) {
    console.error(chalk.red('Failed to initialize agent'));
    logger.error('Failed to initialize agent');
    process.exit(1);
  }

  logger.info(`Agent loaded successfully: ${agent.path}`);

  // Get version from package.json
  const version = packageJson.version;

  // Start the CLI
  setupCLI(agent, version, logger);
}

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
  process.exit(1);
});

// Handle SIGINT (Ctrl+C) gracefully
process.on('SIGINT', () => {
  console.log(chalk.yellow('\nReceived SIGINT, shutting down gracefully...'));
  process.exit(0);
});

// Handle SIGTERM gracefully
process.on('SIGTERM', () => {
  console.log(chalk.yellow('\nReceived SIGTERM, shutting down gracefully...'));
  process.exit(0);
});

main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
