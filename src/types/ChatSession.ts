import { LLMType } from '../llm/types';
import { ILLM } from '../llm/types';

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
}

export interface ChatSession {
  messages: Message[];
  lastSyncId: number;
  currentModel: LLMType;
  systemPrompt: string;
  llm: ILLM;
}

export interface ChatState {
  messages: Message[];
  lastSyncId: number;
  currentModel: LLMType;
}

export interface MessageUpdate {
  updates: Message[];
  lastSyncId: number;
}

export interface ChatSessionOptions {
  modelType?: LLMType;
  systemPrompt?: string;
  initialMessages?: Message[];
}

export interface ChatSessionResponse {
  success: boolean;
  error?: string;
  updates: Message[];
  lastSyncId: number;
} 