import { SecretResolver, SecretResolutionContext } from '../secret-resolver.js';
import { createOnePasswordClient, parseOpUri } from '@teamsparkai/1password';

/**
 * Resolver for 1Password references (op://vault/item/field)
 * 
 * Uses @teamsparkai/1password package to resolve secrets from 1Password
 */
export class OnePasswordResolver implements SecretResolver {
  private static readonly PREFIX = 'op://';

  canResolve(reference: string): boolean {
    return reference.startsWith(OnePasswordResolver.PREFIX);
  }

  async resolve(reference: string, context: SecretResolutionContext): Promise<string> {
    if (!this.canResolve(reference)) {
      throw new Error(`Invalid 1Password reference: ${reference}`);
    }

    // Check if 1Password is available
    if (!this.is1PasswordAvailable()) {
      context.logger.warn('1Password is not available (OP_SERVICE_ACCOUNT_TOKEN or OP_CONNECT_TOKEN not set)');
      throw new Error('1Password is not available. Please set OP_SERVICE_ACCOUNT_TOKEN or OP_CONNECT_TOKEN environment variable.');
    }

    try {
      
      // Parse op:// reference: op://vault/item/field
      const parsed = parseOpUri(reference);
      
      if (!parsed || !parsed.vault || !parsed.item || !parsed.field) {
        throw new Error(`Invalid 1Password reference format: ${reference}. Expected op://vault/item/field`);
      }

      // Create client with environment variables
      const options: { serviceAccountToken?: string; connectToken?: string; connectHost?: string } = {};
      if (process.env.OP_SERVICE_ACCOUNT_TOKEN) {
        options.serviceAccountToken = process.env.OP_SERVICE_ACCOUNT_TOKEN;
      }
      if (process.env.OP_CONNECT_TOKEN) {
        options.connectToken = process.env.OP_CONNECT_TOKEN;
      }
      if (process.env.OP_CONNECT_HOST) {
        options.connectHost = process.env.OP_CONNECT_HOST;
      }

      const client = await createOnePasswordClient(options);
      
      // Find the item by vault and item title/id
      const itemDetail = await client.findItem(parsed.vault, parsed.item);
      
      if (!itemDetail) {
        throw new Error(`1Password item not found: ${parsed.vault}/${parsed.item}`);
      }

      // Find the field
      const field = itemDetail.fields?.find(f => 
        f.id === parsed.field || 
        f.label === parsed.field ||
        f.purpose === parsed.field
      );
      
      if (!field) {
        throw new Error(`1Password field not found: ${parsed.field} in item ${parsed.vault}/${parsed.item}`);
      }

      if (!field.value) {
        throw new Error(`1Password field has no value: ${parsed.field} in item ${parsed.vault}/${parsed.item}`);
      }

      return field.value;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      context.logger.error(`Failed to resolve 1Password reference ${reference}: ${errorMessage}`);
      throw new Error(`Failed to resolve 1Password secret: ${errorMessage}`);
    }
  }

  getDisplayName(): string {
    return '1Password';
  }

  /**
   * Check if 1Password is available by checking for environment variables
   */
  private is1PasswordAvailable(): boolean {
    return !!(process.env.OP_SERVICE_ACCOUNT_TOKEN || process.env.OP_CONNECT_TOKEN);
  }
}

