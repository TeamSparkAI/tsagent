import { ChatMessage } from '../../shared/ChatSession';
import { LLMProviderInfo } from '../../shared/llm';
import { ModelReply } from '../../shared/ModelReply';

export enum LLMType {
  Test = 'test',
  Claude = 'claude',
  OpenAI = 'openai',
  Gemini = 'gemini',
  Ollama = "ollama",
  Bedrock = "bedrock"
}

// Interface for static methods
export interface ILLMStatic {
  getInfo(): LLMProviderInfo;
}

// Interface for instance methods
export interface ILLM {
  getModels(): Promise<ILLMModel[]>;
  generateResponse(messages: ChatMessage[]): Promise<ModelReply>;
} 

// Constructor type with static methods
export type LLMClass = {
  new(modelName: string, appState: any): ILLM;
} & ILLMStatic;

export interface ILLMModel {
  provider: LLMType;
  id: string;
  name: string;
  description?: string;
  modelSource: string;
}