import winston from 'winston';
import type { Logger } from '@tsagent/core';

/**
 * Winston-based logger adapter for the CLI application
 * Provides structured logging with file rotation and console output
 */
export class WinstonLoggerAdapter implements Logger {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        // Console transport with colorized output
        /*
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        */
        // File transport with rotation
        new winston.transports.File({ 
          filename: 'tsagent.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        }),
        // Error file transport
        new winston.transports.File({ 
          filename: 'tsagent-error.log',
          level: 'error',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      ]
    });
  }

  error(message: string, ...args: any[]): void {
    this.logger.error(message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.logger.warn(message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.logger.info(message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.logger.debug(message, ...args);
  }

  /**
   * Set the logging level dynamically
   */
  setLevel(level: string): void {
    this.logger.level = level;
  }

  /**
   * Get the current logging level
   */
  getLevel(): string {
    return this.logger.level;
  }
}
