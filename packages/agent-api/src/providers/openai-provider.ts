import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import OpenAI from 'openai';

import { ProviderModel, ProviderId, ProviderInfo, Provider } from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { BaseProvider } from './base-provider.js';
import { ProviderDescriptor } from './provider-descriptor.js';

const OpenAIConfigSchema = z.object({
  OPENAI_API_KEY: z.string().default('env://OPENAI_API_KEY'),
});

// Extract defaults from schema
const schemaDefaults = ProviderDescriptor.getSchemaDefaults(OpenAIConfigSchema);

// Internal type (not exported - provider details stay encapsulated)
type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;

// Provider Descriptor
export default class OpenAIProviderDescriptor extends ProviderDescriptor {
  readonly providerId = 'openai';
  readonly iconPath = 'assets/providers/openai.png';
  
  readonly info: ProviderInfo = {
    name: "OpenAI",
    description: "OpenAI models including GPT-3.5, GPT-4, and other advanced language models",
    website: "https://openai.com",
    configValues: [
      {
        caption: "OpenAI API key",
        key: "OPENAI_API_KEY",
        secret: true,
        required: true,
        default: schemaDefaults.OPENAI_API_KEY,
      }
    ]
  };

  readonly configSchema = OpenAIConfigSchema;
  
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
    const typedConfig = finalConfig as OpenAIConfig;
    const apiKey = typedConfig.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is missing');
    return new ChatOpenAI({
      model: modelName,
      apiKey,
    });
  }

  // Override for API connectivity check
  protected async validateProvider(
    agent: Agent,
    config: Record<string, string>
  ): Promise<{ isValid: boolean, error?: string } | null> {
    // Cast to typed config for internal use
    const typedConfig = config as OpenAIConfig;
    const apiKey = typedConfig.OPENAI_API_KEY;
    
    if (!apiKey) {
      return { isValid: false, error: 'OPENAI_API_KEY is missing or could not be resolved' };
    }
    
    // Live API check
    try {
      const client = new OpenAI({ apiKey });
      await client.models.list();
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Failed to validate OpenAI configuration: ' + (error instanceof Error ? error.message : 'Unknown error') };
    }
  }
  
  protected async createProvider(
    modelName: string,
    agent: Agent,
    logger: Logger,
    config: Record<string, string>
  ): Promise<Provider> {
    // Cast to typed config for internal use
    const typedConfig = config as OpenAIConfig;
    return new OpenAIProvider(modelName, agent, logger, typedConfig, this.providerId);
  }
}


// Provider implementation
class OpenAIProvider extends BaseProvider<OpenAIConfig> {
  private client: OpenAI;


  constructor(modelName: string, agent: Agent, logger: Logger, config: OpenAIConfig, providerId: ProviderId) {
    super(modelName, agent, logger, config, providerId);
    // config.OPENAI_API_KEY is typed and available
    this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    this.logger.info('OpenAI Provider initialized successfully');
  }

  async getModels(): Promise<ProviderModel[]> {
    const modelList = await this.client.models.list();
    const killwords = ["dall-e", "tts", "whisper", "embedding", "embed", "audio", "transcribe", "moderation", "babbage", "davinci"];
    const filteredModels = modelList.data.filter(model => 
      !killwords.some(word => model.id.toLowerCase().includes(word))
    );
    //this.logger.info('OpenAI models:', filteredModels);
    return filteredModels.map((model) => ({
      provider: this.providerId,
      id: model.id,
      name: model.id,
      modelSource: "OpenAI"
    }));
  }

}