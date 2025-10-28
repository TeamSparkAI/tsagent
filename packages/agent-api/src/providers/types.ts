import { Agent } from '../types/agent.js';
import { ChatSession, ChatMessage, ToolCallRequest, ToolCallResult, Turn } from '../types/chat.js';

// Provider types
export enum ProviderType {
  Test = 'test',
  Claude = 'claude',
  OpenAI = 'openai',
  Gemini = 'gemini',
  Ollama = 'ollama',
  Bedrock = 'bedrock',
  Local = 'local'
}

export interface ProviderConfigValue {
  caption?: string;
  hint?: string;
  key: string;
  secret?: boolean;
  required?: boolean;
  default?: string;
}

export interface ProviderInfo {
  name: string;
  description: string;
  website?: string;
  configValues?: ProviderConfigValue[];
}

// Interface for static methods
export interface ProviderStatic {
  getInfo(): ProviderInfo;
}

// Interface for instance methods
export interface Provider {
  getModels(): Promise<ProviderModel[]>;
  generateResponse(session: ChatSession, messages: ChatMessage[]): Promise<ModelReply>;
}

// Constructor type with static methods
export type ProviderClass = {
  new(modelName: string, agent: Agent): Provider;
} & ProviderStatic;

export interface ProviderModel {
  provider: ProviderType;
  id: string;
  name: string;
  description?: string;
  modelSource: string;
}

// Model reply interface
export interface ModelReply {
  timestamp: number;
  turns: Turn[];
  pendingToolCalls?: ToolCallRequest[];
}

// Re-export types from chat for convenience (used by Providers)
export type { Turn, ToolCallRequest, ToolCallResult } from '../types/chat.js';