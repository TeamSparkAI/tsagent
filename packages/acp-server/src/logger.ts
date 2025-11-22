import { Logger } from '@tsagent/core';

export class ConsoleLogger implements Logger {
  private verbose: boolean = true;

  info(message: string, ...args: any[]): void {
    if (this.verbose) {
      console.error(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.verbose) {
      console.error(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    // Errors should always be logged
    console.error(`[ERROR] ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    if (this.verbose) {
      console.error(`[DEBUG] ${message}`, ...args);
    }
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }
}
