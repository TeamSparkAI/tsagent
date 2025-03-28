import { ChatMessage } from '../types/ChatSession';
import { ILLM } from './types';
import { AppState } from '../state/AppState';

export class TestLLM implements ILLM {
  constructor(public appState: AppState) {}

  async generateResponse(messages: ChatMessage[]): Promise<string> {
    return "Happy Birthday!";
  }
} 