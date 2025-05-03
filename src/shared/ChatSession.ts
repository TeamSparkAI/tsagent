import { LLMType } from './llm';
import { ModelReply } from './ModelReply';
import { SessionToolPermission } from './workspace';

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
  currentModelProvider?: LLMType;
  currentModelId?: string;
  references: string[];
  rules: string[];
  maxChatTurns: number;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  toolPermission: SessionToolPermission;
}

export interface MessageUpdate {
  updates: ChatMessage[];
  lastSyncId: number;
  references: string[];
  rules: string[];
}

export interface ChatSessionOptions {
  modelProvider?: LLMType;
  modelId?: string;
  initialMessages?: ChatMessage[];
  maxChatTurns?: number;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  toolPermission?: SessionToolPermission;
}

export interface ChatSessionResponse {
  success: boolean;
  error?: string;
  updates: ChatMessage[];
  lastSyncId: number;
} 