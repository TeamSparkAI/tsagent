#!/usr/bin/env node

import * as path from 'path';
import { pathToFileURL } from 'url';
import { Command } from 'commander';
import { MetaMCPServer } from './server.js';
import { ConsoleLogger } from './logger.js';
import packageJson from '../package.json' with { type: 'json' };

// Export the server class
export { MetaMCPServer } from './server.js';
export { ConsoleLogger } from './logger.js';

// Options interface for run() function
export interface MetaMCPServerOptions {
  agentPaths: string[];  // Always an array, even for single-agent servers
  debug?: boolean;       // Unified: --debug/-d (verbose logging)
  help?: boolean;        // Unified: --help/-h
}

/**
 * Run the meta-mcp server with parsed options
 */
export async function run(options: MetaMCPServerOptions): Promise<void> {
  if (options.agentPaths.length === 0) {
    throw new Error('Agent path is required');
  }
  
  if (options.agentPaths.length > 1) {
    throw new Error('meta-mcp only supports a single agent');
  }

  const agentPath = options.agentPaths[0];
  const debug = options.debug || false;

  // Create logger with verbose enabled during startup only
  const logger = new ConsoleLogger(true);
  const server = new MetaMCPServer(agentPath, logger, debug);
  
  await server.start();
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
function parseArgs(args: string[], programName?: string): MetaMCPServerOptions {
  const cmd = new Command()
    .name(programName || 'tsagent-meta-mcp')
    .description('MCP server that exposes Tools agents as MCP tools')
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

  return {
    agentPaths: [normalizeAgentPath(agentPathArg)],
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
    // Log errors to stderr
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to start Meta MCP server: ${errorMessage}`);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(console.error);
}
