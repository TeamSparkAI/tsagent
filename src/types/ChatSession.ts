import { LLMType } from '../llm/types';
import { ILLM } from '../llm/types';
import { AppState } from '../state/AppState';
import { ModelReply } from './ModelReply';

// These represent the Electron-side chat history (requests and responses)
export type ChatMessage = {
  role: 'user' | 'system' | 'error';
  content: string;
} | {
  role: 'assistant';
  modelReply: ModelReply;
};

export interface ChatState {
  messages: ChatMessage[];
  lastSyncId: number;
  currentModel: LLMType;
  currentModelId?: string;
  references: string[];
  rules: string[];
}

export interface MessageUpdate {
  updates: ChatMessage[];
  lastSyncId: number;
  references: string[];
  rules: string[];
}

export interface ChatSessionOptions {
  modelType?: LLMType;
  modelId?: string;
  initialMessages?: ChatMessage[];
}

export interface ChatSessionResponse {
  success: boolean;
  error?: string;
  updates: ChatMessage[];
  lastSyncId: number;
} 