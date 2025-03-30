import { LLMType } from '../llm/types';
import { ILLM } from '../llm/types';
import { AppState } from '../state/AppState';
import { LlmReply } from './LlmReply';

// These represent the Electron-side chat history (requests and responses)
export type ChatMessage = {
  role: 'user' | 'system' | 'error';
  content: string;
} | {
  role: 'assistant';
  llmReply: LlmReply;
};

export interface ChatSession {
  messages: ChatMessage[];
  lastSyncId: number;
  currentModel: LLMType;
  llm: ILLM;
  appState: AppState;
  rules: string[];
  references: string[];
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
  initialMessages?: ChatMessage[];
}

export interface ChatSessionResponse {
  success: boolean;
  error?: string;
  updates: ChatMessage[];
  lastSyncId: number;
} 