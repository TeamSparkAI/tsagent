import { ChatMessage } from '../types/ChatSession';
import { LlmReply } from '../types/LlmReply';

export enum LLMType {
  Test = 'test',
  Claude = 'claude',
  OpenAI = 'openai',
  Gemini = 'gemini'
}

export interface ILLM {
  generateResponse(messages: ChatMessage[]): Promise<LlmReply>;
} 