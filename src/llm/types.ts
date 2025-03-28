import { AppState } from '../state/AppState';
import { ChatMessage } from '../types/ChatSession';

export enum LLMType {
  Test = 'test',
  Claude = 'claude',
  OpenAI = 'openai',
  Gemini = 'gemini'
}

export interface ILLM {
  generateResponse(messages: ChatMessage[]): Promise<string>;
} 