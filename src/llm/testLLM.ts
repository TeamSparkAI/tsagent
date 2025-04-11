import { ChatMessage } from '../types/ChatSession';
import { ILLM, ILLMModel, LLMType, LLMProviderInfo } from './types';
import { AppState } from '../state/AppState';
import { ModelReply } from '../types/ModelReply';

export class TestLLM implements ILLM {

  static getInfo(): LLMProviderInfo {
    return {
      name: "Test LLM",
      description: "A simple mock LLM implementation for testing purposes",
      requiresApiKey: false,
      configKeys: []
    };
  }
  
  constructor(public appState: AppState) {}

  async getModels(): Promise<ILLMModel[]> {
    return [{
      provider: LLMType.Test,
      id: 'frosty1.0',
      name: 'Frosty 1.0',
      description: 'Frosty is a simple mock LLM that always responds with "Happy Birthday!"',
      modelSource: 'Test'
    }];
  }

  async generateResponse(messages: ChatMessage[]): Promise<ModelReply> {
    return {
      timestamp: Date.now(),
      turns: [
        {
          message: 'Happy Birthday!',
          inputTokens: 420,
          outputTokens: 69
        }
      ]
    };
  }
}