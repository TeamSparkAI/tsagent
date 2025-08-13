import { ChatMessage } from '../types/chat';
import { Provider, ProviderModel, ProviderType, ProviderInfo } from './types';
import { ModelReply } from './types';
import { Agent } from '../types/agent';
import { Logger } from '../types/common';

export class TestProvider implements Provider {
  private readonly agent: Agent;
  private readonly modelName: string;
  private readonly logger: Logger;

  static getInfo(): ProviderInfo {
    return {
      name: "Test Provider",
      description: "A simple mock provider implementation for testing purposes",
      configValues: []
    };
  }
  
  constructor(modelName: string, agent: Agent, logger: Logger) {
    this.modelName = modelName;
    this.agent = agent;
    this.logger = logger;
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

  static async validateConfiguration(agent: Agent): Promise<{ isValid: boolean, error?: string }> {
    return { isValid: true };
  }

  async generateResponse(session: any, messages: ChatMessage[]): Promise<ModelReply> {
    this.logger.info('Generating response with Test Provider');
    return {
      timestamp: Date.now(),
      turns: [
        {
          message: `Happy Birthday! (maxChatTurns: ${session.maxChatTurns}, maxOutputTokens: ${session.maxOutputTokens}, temperature: ${session.temperature.toFixed(2)}, topP: ${session.topP.toFixed(2)})`,
          inputTokens: 420,
          outputTokens: 69
        }
      ]
    };
  }
}

