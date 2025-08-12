import { ChatMessage } from '../../shared/ChatSession';
import { ILLM, ILLMModel, LLMType, LLMProviderInfo } from '../../shared/llm';
import { ModelReply } from '../../shared/ModelReply';
import { ChatSession } from '../state/ChatSession';
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

  static async validateConfiguration(workspace: WorkspaceManager): Promise<{ isValid: boolean, error?: string }> {
    return { isValid: true };
  }

  async generateResponse(session: ChatSession, messages: ChatMessage[]): Promise<ModelReply> {
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