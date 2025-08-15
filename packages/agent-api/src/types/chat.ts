import { ModelReply, Provider, ProviderType } from '../providers/types';
import { MAX_CHAT_TURNS_KEY, MAX_OUTPUT_TOKENS_KEY, TOP_P_KEY, SessionToolPermission, TEMPERATURE_KEY, SESSION_TOOL_PERMISSION_KEY } from './agent';

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
  currentModelProvider?: ProviderType;
  currentModelId?: string;
  provider?: Provider;
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

export interface ChatSessionSettings {
    [MAX_CHAT_TURNS_KEY]: string;
    [MAX_OUTPUT_TOKENS_KEY]: string;
    [TEMPERATURE_KEY]: string;
    [TOP_P_KEY]: string;
    [SESSION_TOOL_PERMISSION_KEY]?: SessionToolPermission;
}

export interface ChatSessionOptions {
  modelProvider?: ProviderType;
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

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
  output?: string;
  error?: string;
}

export interface Turn {
  message?: string;
  toolCalls?: ToolCallResult[];
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ToolCallRequest {
  serverName: string;
  toolName: string;
  args?: Record<string, unknown>;
  toolCallId?: string; // optional, may be provided to correlate tool call with tool result
}

export interface ToolCallResult extends ToolCallRequest {
  elapsedTimeMs: number;
  output: string;
  error?: string;
}

export interface ChatSession {
  get id(): string;
  getState(): ChatState;
  handleMessage(message: string | ChatMessage): Promise<MessageUpdate>;

  clearModel(): MessageUpdate;
  switchModel(modelType: ProviderType, modelId: string): MessageUpdate;

  addReference(referenceName: string): boolean;
  removeReference(referenceName: string): boolean;

  addRule(ruleName: string): boolean;
  removeRule(ruleName: string): boolean;

  toolIsApprovedForSession(serverId: string, toolId: string): void;
  isToolApprovalRequired(serverId: string, toolId: string): Promise<boolean>;

  updateSettings(settings: {
    maxChatTurns: number;
    maxOutputTokens: number;
    temperature: number;
    topP: number;
    toolPermission: SessionToolPermission;
  }): boolean;
}
