import { SecretResolver, SecretResolutionContext } from '../secret-resolver.js';

/**
 * Resolver for environment variable references (env://VARIABLE_NAME)
 * 
 * Note: This resolver reads from process.env, which should already contain
 * values loaded from .env files by the agent during initialization.
 */
export class EnvironmentVariableResolver implements SecretResolver {
  private static readonly PREFIX = 'env://';

  canResolve(reference: string): boolean {
    return reference.startsWith(EnvironmentVariableResolver.PREFIX);
  }

  async resolve(reference: string, context: SecretResolutionContext): Promise<string> {
    if (!this.canResolve(reference)) {
      throw new Error(`Invalid environment variable reference: ${reference}`);
    }

    // Extract variable name from env://VARIABLE_NAME
    const variableName = reference.substring(EnvironmentVariableResolver.PREFIX.length);
    
    if (!variableName || variableName.trim().length === 0) {
      throw new Error(`Environment variable name is empty in reference: ${reference}`);
    }

    // Look up in process.env (which should already contain loaded .env values)
    const value = process.env[variableName];
    
    if (value === undefined) {
      context.logger.warn(`Environment variable '${variableName}' not found`);
      throw new Error(`Environment variable '${variableName}' not found`);
    }

    return value;
  }

  getDisplayName(): string {
    return 'Environment Variable';
  }
}

