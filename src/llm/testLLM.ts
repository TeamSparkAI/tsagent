import { ChatMessage } from '../types/ChatSession';
import { ILLM } from './types';
import { AppState } from '../state/AppState';
import { ModelReply } from '../types/ModelReply';

export class TestLLM implements ILLM {
  constructor(public appState: AppState) {}

  async generateResponse(messages: ChatMessage[]): Promise<ModelReply> {
    return {
      inputTokens: 0,
      outputTokens: 0,
      timestamp: Date.now(),
      turns: [
        {
          message: 'Happy Birthday!'
        }
      ]
    };
  }
} 