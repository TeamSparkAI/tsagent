import { ChatMessage } from '../types/ChatSession';
import { ModelReply } from '../types/ModelReply';

export enum LLMType {
  Test = 'test',
  Claude = 'claude',
  OpenAI = 'openai',
  Gemini = 'gemini',
  Ollama = "ollama",
  Bedrock = "bedrock"
}

export interface ILLM {
  generateResponse(messages: ChatMessage[]): Promise<ModelReply>;
} 