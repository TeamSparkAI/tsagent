import { ChatMessage } from '../types/ChatSession';
import { ILLM } from './types';

export class TestLLM implements ILLM {
  async generateResponse(messages: ChatMessage[]): Promise<string> {
    return "Happy Birthday!";
  }
} 