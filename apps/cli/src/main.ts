#!/usr/bin/env node

import { program } from 'commander';
import path from 'path';
import chalk from 'chalk';
import { agentExists, loadAgent, createAgent } from '@tsagent/core/runtime';
import { Agent } from '@tsagent/core';
import { AGENT_FILE_NAME } from '@tsagent/core';
import { WinstonLoggerAdapter } from './logger.js';
import { setupCLI } from './cli.js';

export const PRODUCT_NAME = 'TsAgent CLI';

async function main() {
  const logger = new WinstonLoggerAdapter();
  
  program
    .name('tsagent')
    .description(PRODUCT_NAME)
    .version('1.2.0')
    .option('--agent <path>', 'Agent directory path (defaults to current working directory)')
    .option('--create', 'Create new agent if it doesn\'t exist')
    .option('--verbose', 'Enable verbose logging')
    .parse();

  const options = program.opts();

  // Set logging level based on verbose flag
  if (options.verbose) {
    logger.setLevel('debug');
  }

  logger.info(`Starting ${PRODUCT_NAME}`);

  // Determine agent path
  let agentPath = process.cwd();
  if (options.agent) {
    // Resolve agent path relative to cwd (unless it's an absolute path)
    agentPath = path.resolve(options.agent);
  }

  logger.info(`Agent path: ${agentPath}`);

  let agent: Agent | null = null;
  
  if (options.create) {
    try {
      logger.info('Creating new agent');
      agent = await createAgent(agentPath, logger);
      console.log(chalk.green(`Created new agent at: ${agentPath}`));
    } catch (error) {
      console.log(chalk.red(`Failed to create agent: ${error}`));
      logger.error('Failed to create agent:', error);
      process.exit(1);
    }
  } else {
    try {
      // First check if agent exists
      if (!(await agentExists(agentPath))) {
        console.log(chalk.red(`${PRODUCT_NAME} failed to locate agent (${AGENT_FILE_NAME}) in directory: `), agentPath);
        console.log(chalk.dim('  Use '), chalk.bold('--agent <path>'), chalk.dim(` absolute or relative path to a agent directory (where ${AGENT_FILE_NAME} will be found or created)`));
        console.log(chalk.dim('  Use '), chalk.bold('--create'), chalk.dim(' to create a new agent in the specified directory, or current working directory if agent path not specified'));
        logger.error(`Agent not found at path: ${agentPath}`);
        process.exit(1);
      }
      
      // Agent exists, try to load it
      logger.info('Loading existing agent');
      agent = await loadAgent(agentPath, logger);
    } catch (error) {
      console.log(chalk.red(`Error loading agent: ${error instanceof Error ? error.message : 'Unknown error'}`));
      logger.error('Error loading agent:', error);
      process.exit(1);
    }
  }

  if (!agent) {
    console.log(chalk.red('Failed to initialize agent'));
    logger.error('Failed to initialize agent');
    process.exit(1);
  }

  logger.info(`Agent loaded successfully: ${agent.path}`);

  // Get version from package.json or environment
  let version = "1.2.0";
  if (process.env.npm_package_version) {
    version = process.env.npm_package_version;
  }

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
