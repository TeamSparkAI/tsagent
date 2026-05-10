import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import OpenAI from 'openai';

import { ProviderModel, ProviderId, ProviderInfo, Provider } from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { BaseProvider } from './base-provider.js';
import { ProviderDescriptor } from './provider-descriptor.js';

const DockerConfigSchema = z.object({
  BASE_URL: z.string(),
});

// Internal type (not exported - provider details stay encapsulated)
type DockerConfig = z.infer<typeof DockerConfigSchema>;

// Provider Descriptor
export default class DockerProviderDescriptor extends ProviderDescriptor {
  readonly providerId = 'docker';
  readonly iconPath = 'assets/providers/docker.png';
  
  readonly info: ProviderInfo = {
    name: "Docker",
    description: "Docker Model Runner — OpenAI-compatible API (set BASE_URL to your Model Runner engines endpoint)",
    configValues: [
      {
        caption: "Base URL",
        key: "BASE_URL",
        hint: "e.g., http://localhost:12434/engines/v1",
        secret: false,
        required: true,
      }
    ]
  };
  
  readonly configSchema = DockerConfigSchema;
  
  constructor(packageRoot: string) {
    super(packageRoot);
  }
  
  getDefaultModelId(): string {
    return 'gpt-3.5-turbo';
  }

  protected async buildChatModel(
    _agent: Agent,
    _logger: Logger,
    finalConfig: Record<string, string>,
    modelName: string
  ): Promise<BaseChatModel> {
    const typedConfig = finalConfig as DockerConfig;
    const baseURL = typedConfig.BASE_URL;
    if (!baseURL) throw new Error('BASE_URL is missing for Docker provider');
    return new ChatOpenAI({
      model: modelName,
      apiKey: 'docker',
      configuration: { baseURL },
    });
  }

  // Override for connectivity check
  protected async validateProvider(
    agent: Agent,
    config: Record<string, string>
  ): Promise<{ isValid: boolean, error?: string } | null> {
    // Cast to typed config for internal use
    const typedConfig = config as DockerConfig;
    const baseUrl = typedConfig.BASE_URL;
    
    if (!baseUrl) {
      return { isValid: false, error: 'BASE_URL is missing or could not be resolved' };
    }
    
    // Live API check
    try {
      const client = new OpenAI({ apiKey: '', baseURL: baseUrl });
      await client.models.list();
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Failed to validate Docker configuration: ' + (error instanceof Error ? error.message : 'Unknown error') };
    }
  }
  
  protected async createProvider(
    modelName: string,
    agent: Agent,
    logger: Logger,
    config: Record<string, string>
  ): Promise<Provider> {
    // Cast to typed config for internal use
    const typedConfig = config as DockerConfig;
    return new DockerProvider(modelName, agent, logger, typedConfig, this.providerId);
  }
}


// Provider implementation
class DockerProvider extends BaseProvider<DockerConfig> {
  private client: OpenAI;

  constructor(modelName: string, agent: Agent, logger: Logger, config: DockerConfig, providerId: ProviderId) {
    super(modelName, agent, logger, config, providerId);
    // config.BASE_URL is typed and available
    this.client = new OpenAI({ apiKey: '', baseURL: config.BASE_URL });
    this.logger.info('Docker Provider initialized successfully');
  }

  async getModels(): Promise<ProviderModel[]> {
    const modelList = await this.client.models.list();
    return modelList.data.map((model) => ({
      provider: this.providerId,
      id: model.id,
      name: model.id,
      modelSource: "Docker"
    }));
  }
}

