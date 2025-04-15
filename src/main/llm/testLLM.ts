import { ChatMessage } from '../../shared/ChatSession';
import { ILLM, ILLMModel, LLMType, LLMProviderInfo } from '../../shared/llm';
import { ModelReply } from '../../shared/ModelReply';
import { WorkspaceManager } from '../state/WorkspaceManager';

export class TestLLM implements ILLM {

  static getInfo(): LLMProviderInfo {
    return {
      name: "Test LLM",
      description: "A simple mock LLM implementation for testing purposes",
      configValues: []
    };
  }
  
  constructor(public workspace: WorkspaceManager) {}

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