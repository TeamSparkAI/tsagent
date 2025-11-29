import { z } from 'zod';
import { ChatMessage, ChatSession } from '../types/chat.js';
import { ProviderModel, ProviderType, ProviderInfo, Provider } from './types.js';
import { ModelReply } from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { BaseProvider } from './base-provider.js';
import { ProviderDescriptor } from './provider-descriptor.js';

const TestConfigSchema = z.object({}).default({});

// Internal type (not exported - provider details stay encapsulated)
type TestConfig = z.infer<typeof TestConfigSchema>;

// Provider Descriptor
export class TestProviderDescriptor extends ProviderDescriptor {
  readonly type = ProviderType.Test;
  
  readonly info: ProviderInfo = {
    name: "Test Provider",
    description: "A simple mock provider implementation for testing purposes",
    configValues: []
  };
  
  readonly configSchema = TestConfigSchema;
  
  getDefaultModelId(): string {
    return 'frosty1.0';
  }
  
  protected async createProvider(
    modelName: string,
    agent: Agent,
    logger: Logger,
    config: Record<string, string>
  ): Promise<Provider> {
    // Cast to typed config for internal use
    const typedConfig = config as TestConfig;
    return new TestProvider(modelName, agent, logger, typedConfig);
  }
}

// Export descriptor instance for registration
export const testProviderDescriptor = new TestProviderDescriptor();

// Provider implementation
class TestProvider extends BaseProvider<TestConfig> {
  constructor(modelName: string, agent: Agent, logger: Logger, config: TestConfig) {
    super(modelName, agent, logger, config);
    this.logger.info('Test Provider initialized successfully');
  }

  async getModels(): Promise<ProviderModel[]> {
    return [{
      provider: ProviderType.Test,
      id: 'frosty1.0',
      name: 'Frosty 1.0',
      description: 'Frosty is a simple mock provider that always responds with "Happy Birthday!"',
      modelSource: 'Test'
    }];
  }

  // Provider's validateConfiguration uses same validation logic as create (without construction)
  static async validateConfiguration(
    agent: Agent,
    logger: Logger,
    config: Record<string, string>
  ): Promise<{ isValid: boolean, error?: string }> {
    // Test provider always validates successfully
    return { isValid: true };
  }

  async generateResponse(session: ChatSession, messages: ChatMessage[]): Promise<ModelReply> {
    this.logger.info('Generating response with Test Provider');
    const state = session.getState();
    return {
      timestamp: Date.now(),
      turns: [
        {
          results: [{
            type: 'text',
            text: `Happy Birthday! (maxChatTurns: ${state.maxChatTurns}, maxOutputTokens: ${state.maxOutputTokens}, temperature: ${state.temperature.toFixed(2)}, topP: ${state.topP.toFixed(2)})`
          }],
          inputTokens: 420,
          outputTokens: 69
        }
      ]
    };
  }
}