import { ChatMessage } from './ChatSession';
import { ModelReply } from './ModelReply';
import { WorkspaceManager } from '../main/state/WorkspaceManager';
import { ChatSession } from '../main/state/ChatSession';
export enum LLMType {
  Test = 'test',
  Claude = 'claude',
  OpenAI = 'openai',
  Gemini = 'gemini',
  Ollama = "ollama",
  Bedrock = "bedrock"
}

export interface ILLMConfigValue {
  caption?: string;
  hint?: string;
  key: string;
  secret?: boolean;
  required?: boolean;
  default?: string;
}

export interface LLMProviderInfo {
  name: string;
  description: string;
  website?: string;
  configValues?: ILLMConfigValue[];
}

// Interface for static methods
export interface ILLMStatic {
  getInfo(): LLMProviderInfo;
}

// Interface for instance methods
export interface ILLM {
  getModels(): Promise<ILLMModel[]>;
  generateResponse(session: ChatSession, messages: ChatMessage[]): Promise<ModelReply>;
} 

// Constructor type with static methods
export type LLMClass = {
  new(modelName: string, workspace: WorkspaceManager): ILLM;
} & ILLMStatic;

export interface ILLMModel {
  provider: LLMType;
  id: string;
  name: string;
  description?: string;
  modelSource: string;
}