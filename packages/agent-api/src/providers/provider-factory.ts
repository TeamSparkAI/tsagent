import { 
  Provider, 
  ProviderId, 
  ProviderInfo
} from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { ProviderDescriptor } from './provider-descriptor.js';
import BedrockProviderDescriptor from './bedrock-provider.js';
import TestProviderDescriptor from './test-provider.js';
import ClaudeProviderDescriptor from './claude-provider.js';
import OpenAIProviderDescriptor from './openai-provider.js';
import DockerProviderDescriptor from './docker-provider.js';
import GeminiProviderDescriptor from './gemini-provider.js';
import OllamaProviderDescriptor from './ollama-provider.js';
import LocalProviderDescriptor from './local-provider.js';

export class ProviderFactory {
  private agent: Agent;
  private logger: Logger;
  private descriptors: Map<ProviderId, ProviderDescriptor>;

  constructor(agent: Agent, logger: Logger) {
    this.agent = agent;
    this.logger = logger;
    this.descriptors = new Map();
    
    // Determine agent-api package root (for built-in providers)
    const agentApiRoot = (globalThis as any).__TSAGENT_CORE_ROOT as string | undefined;
    if (!agentApiRoot) {
      throw new Error('TSAGENT_CORE_ROOT is not set. Ensure you are using the @tsagent/core/runtime entrypoint.');
    }
    
    // Register all built-in provider descriptors (pass package root to constructor)
    this.register(new BedrockProviderDescriptor(agentApiRoot));
    this.register(new TestProviderDescriptor(agentApiRoot));
    this.register(new ClaudeProviderDescriptor(agentApiRoot));
    this.register(new OpenAIProviderDescriptor(agentApiRoot));
    this.register(new DockerProviderDescriptor(agentApiRoot));
    this.register(new GeminiProviderDescriptor(agentApiRoot));
    this.register(new OllamaProviderDescriptor(agentApiRoot));
    this.register(new LocalProviderDescriptor(agentApiRoot));
  }
  
  /**
   * Register a provider descriptor (for future auto-discovery)
   */
  register(descriptor: ProviderDescriptor): void {
    this.descriptors.set(descriptor.providerId, descriptor);
  }

  getAvailableProviders(): ProviderId[] {
    return Array.from(this.descriptors.keys());
  }

  // Get provider information for all available providers
  getProvidersInfo(): Partial<Record<ProviderId, ProviderInfo>> {
    const info: Partial<Record<ProviderId, ProviderInfo>> = {};
    for (const [type, descriptor] of this.descriptors.entries()) {
      info[type] = descriptor.getInfo();
    }
    return info;
  }

  getProviderInfo(providerId: ProviderId): ProviderInfo | undefined {
    const descriptor = this.descriptors.get(providerId);
    return descriptor?.getInfo();
  }

  /**
   * Get the icon path/URL for a provider
   * Returns a file:// URL that can be used by client applications
   */
  getProviderIcon(providerId: ProviderId): string | null {
    const descriptor = this.descriptors.get(providerId);
    return descriptor?.getIcon() || null;
  }

  async validateConfiguration(id: ProviderId, config: Record<string, string>): Promise<{ isValid: boolean, error?: string }> {
    // Obfuscate secrets for any potential logging - never log raw config
    const obfuscatedConfig = this.obfuscateSecretsInConfig(id, config);
    this.logger.debug(`Validating ${id} provider configuration`, obfuscatedConfig);
    
    const descriptor = this.descriptors.get(id);
    if (!descriptor) {
      return { isValid: false, error: `Unknown provider: ${id}` };
    }
    
    return descriptor.validateConfiguration(this.agent, this.logger, config);
  }

  /**
   * Obfuscate secret and credential values in a config object for safe logging
   */
  private obfuscateSecretsInConfig(id: ProviderId, config: Record<string, string>): Record<string, string> {
    const info = this.getProviderInfo(id);
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

  async create(providerId: ProviderId, modelId?: string): Promise<Provider> {
    if (!this.agent) {
      throw new Error('ProviderFactory not initialized with Agent');
    }

    this.logger.info('ProviderFactory creating model:', providerId, modelId ? `with model ID: ${modelId}` : '');

    const descriptor = this.descriptors.get(providerId);
    if (!descriptor) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    
    // Get raw config (descriptor's create method will handle schema validation and secret resolution)
    const rawConfig = await this.agent.getInstalledProviderConfig(providerId) || {};
    const modelName = modelId || descriptor.getDefaultModelId();
    
    return descriptor.create(modelName, this.agent, this.logger, rawConfig);
  }
}