import log from 'electron-log';
import type { Logger } from 'agent-api';

/**
 * Adapter to bridge electron-log to the AgentAPI Logger interface
 * This allows the desktop app to use its existing electron-log setup
 * while providing the Logger interface that AgentAPI expects
 */
export class ElectronLoggerAdapter implements Logger {
  error(message: string, ...args: any[]): void {
    log.error(message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    log.warn(message, ...args);
  }

  info(message: string, ...args: any[]): void {
    log.info(message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    log.debug(message, ...args);
  }
}
