import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { ProviderId } from '../providers/types.js';
import { SecretResolver, SecretResolutionContext } from './secret-resolver.js';
import { DirectValueResolver } from './resolvers/direct-value-resolver.js';
import { EnvironmentVariableResolver } from './resolvers/env-var-resolver.js';
import { OnePasswordResolver } from './resolvers/onepassword-resolver.js';

/**
 * Centralized manager for resolving secrets from various sources
 */
export class SecretManager {
  private resolvers: SecretResolver[];
  private context: SecretResolutionContext;

  constructor(agent: Agent, logger: Logger) {
    this.context = { agent, logger };
    this.resolvers = [
      new DirectValueResolver(),
      new EnvironmentVariableResolver(),
      new OnePasswordResolver(),
    ];
  }

  /**
   * Resolve a single secret reference to its actual value
   */
  async resolveSecret(reference: string): Promise<string> {
    for (const resolver of this.resolvers) {
      if (resolver.canResolve(reference)) {
        try {
          return await resolver.resolve(reference, this.context);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.context.logger.error(`Failed to resolve secret reference: ${errorMessage}`);
          throw error;
        }
      }
    }
    throw new Error(`No resolver found for secret reference: ${reference}`);
  }

  /**
   * Resolve all secrets in a provider configuration
   */
  async resolveProviderConfig(
    config: Record<string, string>
  ): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(config)) {
      try {
        resolved[key] = await this.resolveSecret(value);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.context.logger.error(`Failed to resolve secret for key '${key}': ${errorMessage}`);
        throw new Error(`Failed to resolve secret for key '${key}': ${errorMessage}`);
      }
    }
    
    return resolved;
  }

  /**
   * Get all available resolver types
   */
  getAvailableResolvers(): string[] {
    return this.resolvers.map(resolver => resolver.getDisplayName());
  }
}

