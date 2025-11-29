import { 
  Provider, 
  ProviderType, 
  ProviderInfo
} from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { ProviderDescriptor } from './provider-descriptor.js';
import { bedrockProviderDescriptor } from './bedrock-provider.js';
import { testProviderDescriptor } from './test-provider.js';
import { claudeProviderDescriptor } from './claude-provider.js';
import { openaiProviderDescriptor } from './openai-provider.js';
import { dockerProviderDescriptor } from './docker-provider.js';
import { geminiProviderDescriptor } from './gemini-provider.js';
import { ollamaProviderDescriptor } from './ollama-provider.js';
import { localProviderDescriptor } from './local-provider.js';

export class ProviderFactory {
  private agent: Agent;
  private logger: Logger;
  private descriptors: Map<ProviderType, ProviderDescriptor>;

  constructor(agent: Agent, logger: Logger) {
    this.agent = agent;
    this.logger = logger;
    this.descriptors = new Map();
    
    // Register all provider descriptors
    this.register(bedrockProviderDescriptor);
    this.register(testProviderDescriptor);
    this.register(claudeProviderDescriptor);
    this.register(openaiProviderDescriptor);
    this.register(dockerProviderDescriptor);
    this.register(geminiProviderDescriptor);
    this.register(ollamaProviderDescriptor);
    this.register(localProviderDescriptor);
  }
  
  /**
   * Register a provider descriptor (for future auto-discovery)
   */
  register(descriptor: ProviderDescriptor): void {
    this.descriptors.set(descriptor.type, descriptor);
  }

  getAvailableProviders(): ProviderType[] {
    return Array.from(this.descriptors.keys());
  }

  // Get provider information for all available providers
  getProvidersInfo(): Partial<Record<ProviderType, ProviderInfo>> {
    const info: Partial<Record<ProviderType, ProviderInfo>> = {};
    for (const [type, descriptor] of this.descriptors.entries()) {
      info[type] = descriptor.getInfo();
    }
    return info;
  }

  getProviderInfo(providerType: ProviderType): ProviderInfo | undefined {
    const descriptor = this.descriptors.get(providerType);
    return descriptor?.getInfo();
  }

  async validateConfiguration(type: ProviderType, config: Record<string, string>): Promise<{ isValid: boolean, error?: string }> {
    // Obfuscate secrets for any potential logging - never log raw config
    const obfuscatedConfig = this.obfuscateSecretsInConfig(type, config);
    this.logger.debug(`Validating ${type} provider configuration`, obfuscatedConfig);
    
    const descriptor = this.descriptors.get(type);
    if (!descriptor) {
      return { isValid: false, error: `Unknown provider: ${type}` };
    }
    
    return descriptor.validateConfiguration(this.agent, this.logger, config);
  }

  /**
   * Obfuscate secret and credential values in a config object for safe logging
   */
  private obfuscateSecretsInConfig(type: ProviderType, config: Record<string, string>): Record<string, string> {
    const info = this.getProviderInfo(type);
    const obfuscated: Record<string, string> = { ...config };
    
    if (info?.configValues) {
      for (const configValue of info.configValues) {
        if ((configValue.secret || configValue.credential) && obfuscated[configValue.key]) {
          const value = obfuscated[configValue.key];
          if (value && value.length > 8) {
            // Show first 4 and last 4 characters, obfuscate the middle
            obfuscated[configValue.key] = `${value.substring(0, 4)}${'*'.repeat(Math.min(value.length - 8, 20))}${value.substring(value.length - 4)}`;
          } else if (value) {
            // For short values, just show asterisks
            obfuscated[configValue.key] = '***';
          }
        }
      }
    }
    
    return obfuscated;
  }

  async create(modelType: ProviderType, modelId?: string): Promise<Provider> {
    if (!this.agent) {
      throw new Error('ProviderFactory not initialized with Agent');
    }

    this.logger.info('ProviderFactory creating model:', modelType, modelId ? `with model ID: ${modelId}` : '');

    const descriptor = this.descriptors.get(modelType);
    if (!descriptor) {
      throw new Error(`Unknown provider type: ${modelType}`);
    }
    
    // Get raw config (descriptor's create method will handle schema validation and secret resolution)
    const rawConfig = await this.agent.getInstalledProviderConfig(modelType) || {};
    const modelName = modelId || descriptor.getDefaultModelId();
    
    return descriptor.create(modelName, this.agent, this.logger, rawConfig);
  }
}