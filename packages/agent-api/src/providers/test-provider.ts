import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { z } from 'zod';
import { ProviderModel, ProviderId, ProviderInfo, Provider } from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { BaseProvider } from './base-provider.js';
import { ProviderDescriptor } from './provider-descriptor.js';
import { ScriptedFixtureChatModel } from '../test-fixtures/scripted-fixture-chat-model.js';

const TestConfigSchema = z.object({}).default({});

// Internal type (not exported - provider details stay encapsulated)
type TestConfig = z.infer<typeof TestConfigSchema>;

// Provider Descriptor
export default class TestProviderDescriptor extends ProviderDescriptor {
  readonly providerId = 'test';
  readonly iconPath = 'assets/providers/frosty.png';
  
  readonly info: ProviderInfo = {
    name: "Test Provider",
    description: "A simple mock provider implementation for testing purposes",
    configValues: []
  };
  
  readonly configSchema = TestConfigSchema;
  
  constructor(packageRoot: string) {
    super(packageRoot);
  }
  
  getDefaultModelId(): string {
    return 'frosty1.0';
  }

  protected async buildChatModel(
    _agent: Agent,
    _logger: Logger,
    _finalConfig: Record<string, string>,
    modelName: string
  ): Promise<BaseChatModel> {
    if (modelName.startsWith('fixture:')) {
      const mode = modelName.slice('fixture:'.length);
      if (mode === 'echo_last_human' || mode === 'tool_then_done') {
        return new ScriptedFixtureChatModel({ mode });
      }
      throw new Error(
        `Unknown test fixture model "${modelName}". Use fixture:echo_last_human or fixture:tool_then_done.`
      );
    }
    return new FakeListChatModel({
      responses: [
        'Test provider (LangChain FakeListChatModel): hello from TsAgent.',
        'Second canned reply.',
      ],
    });
  }

  protected async createProvider(
    modelName: string,
    agent: Agent,
    logger: Logger,
    config: Record<string, string>
  ): Promise<Provider> {
    // Cast to typed config for internal use
    const typedConfig = config as TestConfig;
    return new TestProvider(modelName, agent, logger, typedConfig, this.providerId);
  }
}


// Provider implementation
class TestProvider extends BaseProvider<TestConfig> {
  constructor(modelName: string, agent: Agent, logger: Logger, config: TestConfig, providerId: ProviderId) {
    super(modelName, agent, logger, config, providerId);
    this.logger.info('Test Provider initialized successfully');
  }

  async getModels(): Promise<ProviderModel[]> {
    return [{
      provider: this.providerId,
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
}