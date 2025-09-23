import { 
  Provider, 
  ProviderType, 
  ProviderInfo
} from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { TestProvider } from './test-provider.js';
import { BedrockProvider } from './bedrock-provider.js';
import { ClaudeProvider } from './claude-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { OllamaProvider } from './ollama-provider.js';

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
      ProviderType.Gemini,
      ProviderType.Ollama
    ];
  }

  // Get provider information for all available providers
  getProvidersInfo(): Partial<Record<ProviderType, ProviderInfo>> {
    return {
      [ProviderType.Test]: TestProvider.getInfo(),
      [ProviderType.Bedrock]: BedrockProvider.getInfo(),
      [ProviderType.Claude]: ClaudeProvider.getInfo(),
      [ProviderType.OpenAI]: OpenAIProvider.getInfo(),
      [ProviderType.Gemini]: GeminiProvider.getInfo(),
      [ProviderType.Ollama]: OllamaProvider.getInfo(),
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
      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
  }

  async validateConfiguration(type: ProviderType, config: Record<string, string>): Promise<{ isValid: boolean, error?: string }> {
    switch (type) {
      case ProviderType.Test:
        return TestProvider.validateConfiguration(this.agent, config);
      case ProviderType.Bedrock:
        return BedrockProvider.validateConfiguration(this.agent, config);
      case ProviderType.Claude:
        return ClaudeProvider.validateConfiguration(this.agent, config);
      case ProviderType.Gemini:  
        return GeminiProvider.validateConfiguration(this.agent, config);
      case ProviderType.Ollama:
        return OllamaProvider.validateConfiguration(this.agent, config);
      case ProviderType.OpenAI:
        return OpenAIProvider.validateConfiguration(this.agent, config);
      default:
        return { isValid: false, error: `Unsupported provider type: ${type}` };
    }
  }

  create(modelType: ProviderType, modelId?: string): Provider {
    if (!this.agent) {
      throw new Error('ProviderFactory not initialized with Agent');
    }

    this.logger.info('ProviderFactory creating model:', modelType, modelId ? `with model ID: ${modelId}` : '');

    switch (modelType) {
      case ProviderType.Test:
        this.logger.info('Creating Test Provider instance');
        return new TestProvider('frosty1.0', this.agent, this.logger);
      case ProviderType.Bedrock:
        this.logger.info('Creating Bedrock Provider instance');
        return new BedrockProvider(modelId || 'amazon.nova-pro-v1:0', this.agent, this.logger);
      case ProviderType.Claude:
        this.logger.info('Creating Claude Provider instance');
        return new ClaudeProvider(modelId || 'claude-3-7-sonnet-20250219', this.agent, this.logger);
      case ProviderType.Gemini:
        this.logger.info('Creating Gemini Provider instance');
        return new GeminiProvider(modelId || 'gemini-2.0-flash', this.agent, this.logger);
      case ProviderType.Ollama:
        this.logger.info('Creating Ollama Provider instance');
        return new OllamaProvider(modelId || 'llama3.2', this.agent, this.logger);
      case ProviderType.OpenAI:
        this.logger.info('Creating OpenAI Provider instance');
        return new OpenAIProvider(modelId || 'gpt-3.5-turbo', this.agent, this.logger);
      default:
        throw new Error(`Unsupported provider type: ${modelType}`);
    }
  }
}