import { 
  Provider, 
  ProviderType, 
  ProviderInfo
} from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { SecretManager } from '../secrets/secret-manager.js';
import { TestProvider } from './test-provider.js';
import { BedrockProvider } from './bedrock-provider.js';
import { ClaudeProvider } from './claude-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { DockerProvider } from './docker-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { OllamaProvider } from './ollama-provider.js';
import { LocalProvider } from './local-provider.js';

export class ProviderFactory {
  private agent: Agent;
  private logger: Logger;

  constructor(agent: Agent, logger: Logger) {
    this.agent = agent;
    this.logger = logger;
  }

  getAvailableProviders(): ProviderType[] {
    return [
      ProviderType.Test,
      ProviderType.Bedrock,
      ProviderType.Claude,
      ProviderType.OpenAI,
      ProviderType.Docker,
      ProviderType.Gemini,
      ProviderType.Ollama,
      ProviderType.Local
    ];
  }

  // Get provider information for all available providers
  getProvidersInfo(): Partial<Record<ProviderType, ProviderInfo>> {
    return {
      [ProviderType.Test]: TestProvider.getInfo(),
      [ProviderType.Bedrock]: BedrockProvider.getInfo(),
      [ProviderType.Claude]: ClaudeProvider.getInfo(),
      [ProviderType.OpenAI]: OpenAIProvider.getInfo(),
      [ProviderType.Docker]: DockerProvider.getInfo(),
      [ProviderType.Gemini]: GeminiProvider.getInfo(),
      [ProviderType.Ollama]: OllamaProvider.getInfo(),
      [ProviderType.Local]: LocalProvider.getInfo(),
    };
  }

  getProviderInfo(providerType: ProviderType): ProviderInfo {
    switch (providerType) {
      case ProviderType.Test:
        return TestProvider.getInfo();
      case ProviderType.Bedrock:
        return BedrockProvider.getInfo();
      case ProviderType.Claude:
        return ClaudeProvider.getInfo();
      case ProviderType.Gemini:
        return GeminiProvider.getInfo();
      case ProviderType.Ollama:
        return OllamaProvider.getInfo();
      case ProviderType.OpenAI:
        return OpenAIProvider.getInfo();
      case ProviderType.Docker:
        return DockerProvider.getInfo();
      case ProviderType.Local:
        return LocalProvider.getInfo();
      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
  }

  async validateConfiguration(type: ProviderType, config: Record<string, string>): Promise<{ isValid: boolean, error?: string }> {
    // Obfuscate secrets for any potential logging - never log raw config
    const obfuscatedConfig = this.obfuscateSecretsInConfig(type, config);
    this.logger.debug(`Validating ${type} provider configuration`, obfuscatedConfig);
    
    // Resolve secrets before validation - providers need actual secret values, not references
    let resolvedConfig: Record<string, string>;
    try {
      // Use the agent's secret manager to resolve secrets
      const secretManager = new SecretManager(this.agent, this.logger);
      resolvedConfig = await secretManager.resolveProviderConfig(config);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to resolve secrets for ${type} provider validation: ${errorMessage}`);
      return { isValid: false, error: `Failed to resolve secrets: ${errorMessage}` };
    }
    
    switch (type) {
      case ProviderType.Test:
        return TestProvider.validateConfiguration(this.agent, resolvedConfig);
      case ProviderType.Bedrock:
        return BedrockProvider.validateConfiguration(this.agent, resolvedConfig);
      case ProviderType.Claude:
        return ClaudeProvider.validateConfiguration(this.agent, resolvedConfig);
      case ProviderType.Gemini:  
        return GeminiProvider.validateConfiguration(this.agent, resolvedConfig);
      case ProviderType.Ollama:
        return OllamaProvider.validateConfiguration(this.agent, resolvedConfig);
      case ProviderType.OpenAI:
        return OpenAIProvider.validateConfiguration(this.agent, resolvedConfig);
      case ProviderType.Docker:
        return DockerProvider.validateConfiguration(this.agent, resolvedConfig);
      case ProviderType.Local:
        return LocalProvider.validateConfiguration(this.agent, resolvedConfig);
      default:
        return { isValid: false, error: `Unsupported provider type: ${type}` };
    }
  }

  /**
   * Obfuscate secret and credential values in a config object for safe logging
   */
  private obfuscateSecretsInConfig(type: ProviderType, config: Record<string, string>): Record<string, string> {
    const info = this.getProviderInfo(type);
    const obfuscated: Record<string, string> = { ...config };
    
    if (info.configValues) {
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

    // Resolve secrets once before creating the provider
    const resolvedConfig = await this.agent.getResolvedProviderConfig(modelType);
    if (!resolvedConfig) {
      throw new Error(`Provider configuration not found for ${modelType}`);
    }

    switch (modelType) {
      case ProviderType.Test:
        this.logger.info('Creating Test Provider instance');
        return new TestProvider('frosty1.0', this.agent, this.logger, resolvedConfig || {});
      case ProviderType.Bedrock:
        this.logger.info('Creating Bedrock Provider instance');
        return new BedrockProvider(modelId || 'amazon.nova-pro-v1:0', this.agent, this.logger, resolvedConfig);
      case ProviderType.Claude:
        this.logger.info('Creating Claude Provider instance');
        return new ClaudeProvider(modelId || 'claude-3-7-sonnet-20250219', this.agent, this.logger, resolvedConfig);
      case ProviderType.Gemini:
        this.logger.info('Creating Gemini Provider instance');
        return new GeminiProvider(modelId || 'gemini-2.0-flash', this.agent, this.logger, resolvedConfig);
      case ProviderType.Ollama:
        this.logger.info('Creating Ollama Provider instance');
        return new OllamaProvider(modelId || 'llama3.2', this.agent, this.logger, resolvedConfig);
      case ProviderType.OpenAI:
        this.logger.info('Creating OpenAI Provider instance');
        return new OpenAIProvider(modelId || 'gpt-3.5-turbo', this.agent, this.logger, resolvedConfig);
      case ProviderType.Docker:
        this.logger.info('Creating Docker Provider instance');
        return new DockerProvider(modelId || 'gpt-3.5-turbo', this.agent, this.logger, resolvedConfig);
      case ProviderType.Local:
        this.logger.info('Creating Local Provider instance');
        return new LocalProvider(modelId || '', this.agent, this.logger, resolvedConfig);
      default:
        throw new Error(`Unsupported provider type: ${modelType}`);
    }
  }
}