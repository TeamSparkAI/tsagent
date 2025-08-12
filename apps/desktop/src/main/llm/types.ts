import { ChatMessage } from '../../shared/ChatSession';
import { LLMProviderInfo } from '../../shared/llm';
import { ModelReply } from '../../shared/ModelReply';
import { ChatSession } from '../state/ChatSession';
import { WorkspaceManager } from '../state/WorkspaceManager';
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
  validateConfiguration(workspace: WorkspaceManager): Promise<{ isValid: boolean, error?: string }>;
}

// Interface for instance methods
export interface ILLM {
  getModels(): Promise<ILLMModel[]>;
  generateResponse(session: ChatSession, messages: ChatMessage[]): Promise<ModelReply>;
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