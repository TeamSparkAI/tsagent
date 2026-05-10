import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOllama } from '@langchain/ollama';
import { z } from 'zod';
import { Ollama, Tool as OllamaTool } from 'ollama';

import { ProviderModel, ProviderId, ProviderInfo, Provider } from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { BaseProvider } from './base-provider.js';
import { ProviderDescriptor } from './provider-descriptor.js';

// Schema defined outside class so we can use it for the type
const OllamaConfigSchema = z.object({
  OLLAMA_HOST: z.string().default('http://127.0.0.1:11434'),
});

// Internal type (not exported - provider details stay encapsulated)  
type OllamaConfig = z.infer<typeof OllamaConfigSchema>;

// Provider Descriptor
export default class OllamaProviderDescriptor extends ProviderDescriptor {
  readonly providerId = 'ollama';
  readonly iconPath = 'assets/providers/ollama.png';
  
  readonly info: ProviderInfo = {
    name: "Ollama",
    description: "Run open-source large language models locally on your own hardware",
    website: "https://ollama.ai/",
    configValues: [
      {
        caption: "Ollama host",
        key: "OLLAMA_HOST",
        default: "http://127.0.0.1:11434"
      }
    ]
  };
  
  readonly configSchema = OllamaConfigSchema;
  
  constructor(packageRoot: string) {
    super(packageRoot);
  }
  
  getDefaultModelId(): string {
    return 'llama3.2';
  }

  protected async buildChatModel(
    _agent: Agent,
    _logger: Logger,
    finalConfig: Record<string, string>,
    modelName: string
  ): Promise<BaseChatModel> {
    const typedConfig = finalConfig as OllamaConfig;
    const baseUrl = typedConfig.OLLAMA_HOST || 'http://127.0.0.1:11434';
    return new ChatOllama({
      model: modelName,
      baseUrl,
    });
  }

  // Override for connectivity check
  protected async validateProvider(
    agent: Agent,
    config: Record<string, string>
  ): Promise<{ isValid: boolean, error?: string } | null> {
    // Cast to typed config for internal use
    const typedConfig = config as OllamaConfig;
    const host = typedConfig.OLLAMA_HOST;
    try {
      const client = new Ollama({ host: host });
      await client.list();
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Failed to validate Ollama configuration: ' + (error instanceof Error ? error.message : 'Unknown error') };
    }
  }
  
  protected async createProvider(
    modelName: string,
    agent: Agent,
    logger: Logger,
    config: Record<string, string>
  ): Promise<Provider> {
    // Cast to typed config for internal use
    const typedConfig = config as OllamaConfig;
    return new OllamaProvider(modelName, agent, logger, typedConfig, this.providerId);
  }
}


// Provider implementation
class OllamaProvider extends BaseProvider<OllamaConfig> {
  private client: Ollama;

  constructor(modelName: string, agent: Agent, logger: Logger, config: OllamaConfig, providerId: ProviderId) {
    super(modelName, agent, logger, config, providerId);
    // config.OLLAMA_HOST is typed and available
    this.client = new Ollama({ host: config.OLLAMA_HOST });
    this.logger.info('Ollama Provider initialized successfully');
  }

  async getModels(): Promise<ProviderModel[]> {
    const modelList = await this.client.list();
    // this.logger.info('Ollama models:', modelList.models);
    return modelList.models.map((model) => ({
      provider: this.providerId,
      id: model.model,
      name: model.name,
      modelSource: model.details?.family ?? "Unknown"
    }));
  }
}