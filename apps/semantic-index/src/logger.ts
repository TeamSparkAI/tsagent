import type { Logger } from '@tsagent/core';

/**
 * Simple console logger for the semantic index CLI
 */
export class SimpleLogger implements Logger {
  private verbose: boolean = false;

  setVerbose(verbose: boolean): void {
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
    if (this.verbose) {
      console.error(`[DEBUG] ${message}`, ...args);
    }
  }
}

