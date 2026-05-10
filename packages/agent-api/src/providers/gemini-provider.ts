import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';

import { ProviderModel, ProviderId, ProviderInfo, Provider } from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { BaseProvider } from './base-provider.js';
import { ProviderDescriptor } from './provider-descriptor.js';

const GeminiConfigSchema = z.object({
  GOOGLE_API_KEY: z.string().default('env://GOOGLE_API_KEY'),
});

// Extract defaults from schema
const schemaDefaults = ProviderDescriptor.getSchemaDefaults(GeminiConfigSchema);

// Internal type (not exported - provider details stay encapsulated)
type GeminiConfig = z.infer<typeof GeminiConfigSchema>;

// Provider Descriptor
export default class GeminiProviderDescriptor extends ProviderDescriptor {
  readonly providerId = 'gemini';
  readonly iconPath = 'assets/providers/gemini.png';
  
  readonly info: ProviderInfo = {
    name: "Google Gemini",
    description: "Google's Gemini models are multimodal AI systems that can understand and combine different types of information",
    website: "https://deepmind.google/technologies/gemini/",
    configValues: [
      {
        caption: "Google API key",
        key: "GOOGLE_API_KEY",
        secret: true,
        required: true,
        default: schemaDefaults.GOOGLE_API_KEY,
      }
    ]
  };
  
  readonly configSchema = GeminiConfigSchema;
  
  constructor(packageRoot: string) {
    super(packageRoot);
  }
  
  getDefaultModelId(): string {
    return 'gemini-2.0-flash';
  }

  protected async buildChatModel(
    _agent: Agent,
    _logger: Logger,
    finalConfig: Record<string, string>,
    modelName: string
  ): Promise<BaseChatModel> {
    const typedConfig = finalConfig as GeminiConfig;
    const apiKey = typedConfig.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_API_KEY is missing');
    return new ChatGoogleGenerativeAI({
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
    const typedConfig = config as GeminiConfig;
    const apiKey = typedConfig.GOOGLE_API_KEY;
    
    if (!apiKey) {
      return { isValid: false, error: 'GOOGLE_API_KEY is missing or could not be resolved' };
    }
    
    // Live API check
    try {
      const genAI = new GoogleGenAI({ apiKey });
      await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: 'ping'
      });
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Failed to validate Gemini configuration: ' + (error instanceof Error ? error.message : 'Unknown error') };
    }
  }
  
  protected async createProvider(
    modelName: string,
    agent: Agent,
    logger: Logger,
    config: Record<string, string>
  ): Promise<Provider> {
    // Cast to typed config for internal use
    const typedConfig = config as GeminiConfig;
    return new GeminiProvider(modelName, agent, logger, typedConfig, this.providerId);
  }
}


// Provider implementation
class GeminiProvider extends BaseProvider<GeminiConfig> {
  private genAI: GoogleGenAI;

  constructor(modelName: string, agent: Agent, logger: Logger, config: GeminiConfig, providerId: ProviderId) {
    super(modelName, agent, logger, config, providerId);
    // config.GOOGLE_API_KEY is typed and available
    this.genAI = new GoogleGenAI({ apiKey: config.GOOGLE_API_KEY });
    this.logger.info('Gemini Provider initialized successfully');
  }

  async getModels(): Promise<ProviderModel[]> {
    const theModels = await this.genAI.models.list();

    // Convert async iterable to array and filter for models with supportedActions that include "generateContent"
    const modelsArray: any[] = [];
    for await (const model of theModels) {
      modelsArray.push(model);
    }
    const filteredModels = modelsArray.filter(model => model.supportedActions?.includes('generateContent'));

    // Models look like this:
    /*
    {
      "name": "models/gemini-2.5-flash-lite",
      "displayName": "Gemini 2.5 Flash-Lite",
      "description": "Stable verion of Gemini 2.5 Flash-Lite, released in July of 2025",
      "version": "001",
      "tunedModelInfo": {},
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 65536,
      "supportedActions": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ]
    }
    */

    const models: ProviderModel[] = filteredModels.map(model => ({
      provider: this.providerId,
      id: model.name.replace('models/', ''), // Extract just the model name from the full path
      name: model.displayName,
      description: model.description,
      modelSource: "Google"
    }));

    // this.logger.info('Gemini models', JSON.stringify(theModels, null, 2));

    return models;
  }
}