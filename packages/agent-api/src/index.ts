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

// Export ChatSession implementation
export { ChatSessionImpl as ChatSession } from './chat-session';
export type { ChatSessionOptionsWithRequiredSettings } from './chat-session';

// Export constants and types from types directory
export * from './types';
