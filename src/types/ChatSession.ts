import { LLMType } from '../llm/types';
import { ILLM } from '../llm/types';

// These represent the Electron-side chat history (requests and responses)
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
}

export interface ChatSession {
  messages: ChatMessage[];
  lastSyncId: number;
  currentModel: LLMType;
  systemPrompt: string;
  llm: ILLM;
}

export interface ChatState {
  messages: ChatMessage[];
  lastSyncId: number;
  currentModel: LLMType;
}

export interface MessageUpdate {
  updates: ChatMessage[];
  lastSyncId: number;
}

export interface ChatSessionOptions {
  modelType?: LLMType;
  systemPrompt?: string;
  initialMessages?: ChatMessage[];
}

export interface ChatSessionResponse {
  success: boolean;
  error?: string;
  updates: ChatMessage[];
  lastSyncId: number;
} 