import { ChatMessage } from '../types/ChatSession';
import { ModelReply } from '../types/ModelReply';

export enum LLMType {
  Test = 'test',
  Claude = 'claude',
  OpenAI = 'openai',
  Gemini = 'gemini'
}

export interface ILLM {
  generateResponse(messages: ChatMessage[]): Promise<ModelReply>;
} 