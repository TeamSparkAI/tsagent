// Main API - export factory functions
import { FileBasedAgent } from './agent-api';
import type { Logger } from './types';

// Factory functions for easier usage
export const createAgent = (path: string, logger: Logger, data?: any) => FileBasedAgent.createAgent(path, logger, data);
export const loadAgent = (path: string, logger: Logger) => FileBasedAgent.loadAgent(path, logger);
export const agentExists = FileBasedAgent.agentExists;

// Export provider factory for direct access
export { ProviderFactory } from './providers/provider-factory';

// Export ProviderType as a value (not just type)
export { ProviderType } from './providers/types';

// Export all types from types directory (including Agent interface)
export type * from './types';

// Export MCP types
export type * from './mcp/types';

// Export provider types
export type * from './providers/types';

// Export manager types
export type * from './managers/types';
