import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatAnthropic } from '@langchain/anthropic';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';

import { ProviderModel, ProviderId, ProviderInfo, Provider } from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { BaseProvider } from './base-provider.js';
import { ProviderDescriptor } from './provider-descriptor.js';

const ClaudeConfigSchema = z.object({
  ANTHROPIC_API_KEY: z.string().default('env://ANTHROPIC_API_KEY'),
});

// Extract defaults from schema
const schemaDefaults = ProviderDescriptor.getSchemaDefaults(ClaudeConfigSchema);

// Internal type (not exported - provider details stay encapsulated)
type ClaudeConfig = z.infer<typeof ClaudeConfigSchema>;

// Provider Descriptor
export default class ClaudeProviderDescriptor extends ProviderDescriptor {
  readonly providerId = 'claude';
  readonly iconPath = 'assets/providers/anthropic.png';
  
  readonly info: ProviderInfo = {
    name: "Anthropic Claude",
    description: "Claude is a family of AI assistants created by Anthropic to be helpful, harmless, and honest",
    website: "https://www.anthropic.com/claude",
    configValues: [
      {
        caption: "Anthropic API key",
        key: "ANTHROPIC_API_KEY",
        secret: true,
        required: true,
        default: schemaDefaults.ANTHROPIC_API_KEY,
      }
    ]
  };
  
  readonly configSchema = ClaudeConfigSchema;
  
  constructor(packageRoot: string) {
    super(packageRoot);
  }
  
  getDefaultModelId(): string {
    return 'claude-3-7-sonnet-20250219';
  }

  protected async buildChatModel(
    _agent: Agent,
    _logger: Logger,
    finalConfig: Record<string, string>,
    modelName: string
  ): Promise<BaseChatModel> {
    const typedConfig = finalConfig as ClaudeConfig;
    const apiKey = typedConfig.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is missing');
    return new ChatAnthropic({
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
    const typedConfig = config as ClaudeConfig;
    const apiKey = typedConfig.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      return { isValid: false, error: 'ANTHROPIC_API_KEY is missing or could not be resolved' };
    }
    
    // Live API check
    try {
      const client = new Anthropic({ apiKey });
      await client.models.list();
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Failed to validate Claude configuration: ' + (error instanceof Error ? error.message : 'Unknown error') };
    }
  }
  
  protected async createProvider(
    modelName: string,
    agent: Agent,
    logger: Logger,
    config: Record<string, string>
  ): Promise<Provider> {
    // Cast to typed config for internal use
    const typedConfig = config as ClaudeConfig;
    return new ClaudeProvider(modelName, agent, logger, typedConfig, this.providerId);
  }
}


// Provider implementation
class ClaudeProvider extends BaseProvider<ClaudeConfig> {
  private client: Anthropic;

  constructor(modelName: string, agent: Agent, logger: Logger, config: ClaudeConfig, providerId: ProviderId) {
    super(modelName, agent, logger, config, providerId);
    // config.ANTHROPIC_API_KEY is typed and available
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    this.logger.info('Claude Provider initialized successfully');
  }
  
  async getModels(): Promise<ProviderModel[]> {
    const modelList = await this.client.models.list();
    //this.logger.info('Claude models:', modelList.data);
    const models: ProviderModel[] = modelList.data.map((model) => ({
      provider: this.providerId,
      id: model.id!,
      name: model.display_name || model.id!,
      modelSource: 'Anthropic'
    }));
    return models;
  }
}