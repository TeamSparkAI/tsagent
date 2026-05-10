import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import path from 'path';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { Provider, ProviderInfo } from './types.js';
import { SecretManager } from '../secrets/secret-manager.js';

export abstract class ProviderDescriptor {
  abstract readonly providerId: string;
  abstract readonly info: ProviderInfo;
  abstract readonly configSchema: z.ZodSchema<any>;
  abstract readonly iconPath?: string;
  
  protected packageRoot: string;
  
  constructor(packageRoot: string) {
    this.packageRoot = packageRoot;
  }
  
  /**
   * Extract default values from a Zod schema by parsing an empty object
   * Uses partial() to avoid validation errors for required fields
   */
  static getSchemaDefaults(schema: z.ZodObject<any>): Record<string, string | undefined> {
    const partialSchema = schema.partial();
    const empty = {};
    const parsed = partialSchema.parse(empty);
    return parsed as Record<string, string | undefined>;
  }
  
  /**
   * Get provider information (name, description, config fields, etc.)
   */
  getInfo(): ProviderInfo {
    return this.info;
  }
  
  /**
   * Get the default model ID for this provider (must be implemented by derived classes)
   */
  abstract getDefaultModelId(): string;
  
  /**
   * Validate provider configuration without creating an instance
   * Public interface uses Record<string, string> - descriptor handles internal typing
   */
  async validateConfiguration(
    agent: Agent,
    logger: Logger,
    config: Record<string, string>
  ): Promise<{ isValid: boolean, error?: string }> {
    try {
      // Step 1: Schema validation (applies defaults like env://VAR_NAME)
      // Schema is provider-specific, but we parse from Record<string, string>
      const validatedConfig = this.configSchema.parse(config || {});
      
      // Step 2: Resolve secrets (env://, op:// references)
      // validatedConfig is the provider's typed config, but resolveProviderConfig expects Record<string, string>
      const secretManager = new SecretManager(agent, logger);
      const resolvedConfig = await secretManager.resolveProviderConfig(validatedConfig as Record<string, string>);
      
      // Step 3: Parse resolved config again to ensure it's still valid
      const finalConfig = this.configSchema.parse(resolvedConfig);
      
      // Step 4: Call provider-specific validation hook (if overridden)
      // Pass as Record<string, string> - descriptor will cast internally if needed
      const validationResult = await this.validateProvider(agent, finalConfig as Record<string, string>);
      if (validationResult && !validationResult.isValid) {
        return validationResult;
      }
      
      return { isValid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { 
          isValid: false, 
          error: `Invalid configuration: ${error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}` 
        };
      }
      return { 
        isValid: false, 
        error: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
  
  /**
   * Schema-validate and resolve secrets for installed provider config (shared by {@link create} and {@link createChatModel}).
   */
  async resolveInstalledConfig(
    agent: Agent,
    logger: Logger,
    rawConfig: Record<string, string>
  ): Promise<Record<string, string>> {
    const validatedConfig = this.configSchema.parse(rawConfig || {});
    const secretManager = new SecretManager(agent, logger);
    const resolvedConfig = await secretManager.resolveProviderConfig(validatedConfig as Record<string, string>);
    return this.configSchema.parse(resolvedConfig) as Record<string, string>;
  }

  /**
   * Create a provider instance (for getModels(), etc.)
   * Public interface uses Record<string, string> - descriptor handles internal typing
   */
  async create(
    modelName: string,
    agent: Agent,
    logger: Logger,
    rawConfig: Record<string, string>
  ): Promise<Provider> {
    const finalConfig = await this.resolveInstalledConfig(agent, logger, rawConfig);
    await this.assertRuntimeConfigValid(agent, logger, finalConfig);

    return this.createProvider(modelName, agent, logger, finalConfig as Record<string, string>);
  }

  /** Run {@link validateProvider} and throw if invalid (used by {@link create} and LangChain factory). */
  async assertRuntimeConfigValid(agent: Agent, logger: Logger, finalConfig: Record<string, string>): Promise<void> {
    const validationResult = await this.validateProvider(agent, finalConfig as Record<string, string>);
    if (validationResult && !validationResult.isValid) {
      throw new Error(validationResult.error || 'Provider validation failed');
    }
  }

  /**
   * Build a LangChain {@link BaseChatModel} from installed provider config (schema + secret resolution + runtime validation).
   * Same validation path as {@link create}; does not construct a {@link Provider} instance.
   */
  async createChatModel(
    agent: Agent,
    logger: Logger,
    rawConfig: Record<string, string>,
    modelId?: string
  ): Promise<BaseChatModel> {
    const modelName = modelId ?? this.getDefaultModelId();
    const finalConfig = await this.resolveInstalledConfig(agent, logger, rawConfig);
    await this.assertRuntimeConfigValid(agent, logger, finalConfig);
    return this.buildChatModel(agent, logger, finalConfig, modelName);
  }

  /**
   * Construct the vendor-specific chat model from **already resolved and validated** config.
   */
  protected abstract buildChatModel(
    agent: Agent,
    logger: Logger,
    finalConfig: Record<string, string>,
    modelName: string
  ): Promise<BaseChatModel>;

  /**
   * Hook for provider-specific semantic/live validation (no-op by default)
   * Override in derived classes for API connectivity checks, etc.
   * Receives Record<string, string> - descriptor can cast to typed config internally
   */
  protected async validateProvider(
    agent: Agent,
    config: Record<string, string>
  ): Promise<{ isValid: boolean, error?: string } | null> {
    return null;
  }
  
  /**
   * Create the actual provider instance (must be implemented by derived classes)
   * Receives Record<string, string> - descriptor casts to typed config internally
   */
  protected abstract createProvider(
    modelName: string,
    agent: Agent,
    logger: Logger,
    config: Record<string, string>
  ): Promise<Provider>;
  
  /**
   * Get the fully resolved icon path/URL
   * Returns a file:// URL that can be used by client applications
   */
  getIcon(): string | null {
    if (!this.iconPath) return null;
    const fullPath = path.join(this.packageRoot, this.iconPath);
    return `file://${fullPath}`;
  }
}

