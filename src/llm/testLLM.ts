import { ChatMessage } from '../types/ChatSession';
import { ILLM } from './types';
import { AppState } from '../state/AppState';
import { LlmReply } from '../types/LlmReply';

export class TestLLM implements ILLM {
  constructor(public appState: AppState) {}

  async generateResponse(messages: ChatMessage[]): Promise<LlmReply> {
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