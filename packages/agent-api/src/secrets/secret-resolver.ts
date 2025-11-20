import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';

/**
 * Context passed to secret resolvers for resolution
 */
export interface SecretResolutionContext {
  agent: Agent;
  logger: Logger;
}

/**
 * Interface for secret resolvers that can resolve secret references to actual values
 */
export interface SecretResolver {
  /**
   * Check if this resolver can handle the given secret reference
   */
  canResolve(reference: string): boolean;
  
  /**
   * Resolve the secret reference to its actual value
   */
  resolve(reference: string, context: SecretResolutionContext): Promise<string>;
  
  /**
   * Get the display name for this resolver type
   */
  getDisplayName(): string;
}

