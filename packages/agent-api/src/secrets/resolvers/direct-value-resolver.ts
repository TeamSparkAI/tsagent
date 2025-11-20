import { SecretResolver, SecretResolutionContext } from '../secret-resolver.js';

/**
 * Resolver for direct values (no prefix, backward compatible)
 */
export class DirectValueResolver implements SecretResolver {
  canResolve(reference: string): boolean {
    // Direct values don't have a prefix, so we check if it's NOT an env:// or op:// reference
    return !reference.startsWith('env://') && !reference.startsWith('op://');
  }

  async resolve(reference: string, context: SecretResolutionContext): Promise<string> {
    // Direct values are returned as-is
    return reference;
  }

  getDisplayName(): string {
    return 'Direct Value';
  }
}

