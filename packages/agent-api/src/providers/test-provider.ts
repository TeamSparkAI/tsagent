import { ChatMessage, ChatSession } from '../types/chat.js';
import { Provider, ProviderModel, ProviderType, ProviderInfo } from './types.js';
import { ModelReply } from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';

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

  static async validateConfiguration(agent: Agent, config: Record<string, string>): Promise<{ isValid: boolean, error?: string }> {
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