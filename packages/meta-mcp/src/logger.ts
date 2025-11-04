import { Logger } from '@tsagent/core';

/**
 * ConsoleLogger for MCP stdio servers
 * 
 * IMPORTANT: All logging must go to stderr (console.error), never stdout.
 * stdout is reserved for MCP protocol communication when using stdio transport.
 */
export class ConsoleLogger implements Logger {
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  info(message: string, ...args: any[]): void {
    if (this.verbose) {
      console.error(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    console.error(`[WARN] ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    // Debug logging is typically disabled in production
    // Only log if explicitly enabled
    if (this.verbose) {
      console.error(`[DEBUG] ${message}`, ...args);
    }
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }
}
