import { LLMType } from './llm';
import { ModelReply, ToolCallRequest } from './ModelReply';
import { SessionToolPermission } from './workspace';

// These represent the Electron-side chat history (requests and responses)

export const TOOL_CALL_DECISION_ALLOW_SESSION = 'allow-session';
export const TOOL_CALL_DECISION_ALLOW_ONCE = 'allow-once';
export const TOOL_CALL_DECISION_DENY = 'deny';

export type ToolCallDecision = typeof TOOL_CALL_DECISION_ALLOW_SESSION | typeof TOOL_CALL_DECISION_ALLOW_ONCE | typeof TOOL_CALL_DECISION_DENY;

export interface ToolCallApproval extends ToolCallRequest {
  decision: ToolCallDecision;
}

export type ChatMessage = {
  role: 'user' | 'system' | 'error';
  content: string;
} | {
  role: 'approval';
  toolCallApprovals: ToolCallApproval[];
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

export interface ChatSessionResponse {
  success: boolean;
  error?: string;
  updates: ChatMessage[];
  lastSyncId: number;
} 