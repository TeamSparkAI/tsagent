import { ModelReply, Provider, ProviderId } from '../providers/types.js';
import { SessionToolPermission } from './agent.js';
import { RequestContext, SessionContextItem } from './context.js';

// These represent the Electron-side chat history (requests and responses)

export type ToolCallDecision = 'allow-session' | 'allow-once' | 'deny';

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
  requestContext?: RequestContext;  // Context used for this request/response pair
};

export interface ChatState {
  messages: ChatMessage[];
  lastSyncId: number;
  currentModelProvider?: ProviderId;
  currentModelId?: string;
  contextItems: SessionContextItem[];  // Tracked context items with include modes
  maxChatTurns: number;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  toolPermission: SessionToolPermission;
  contextTopK: number;
  contextTopN: number;
  contextIncludeScore: number;
}

export interface MessageUpdate {
  updates: ChatMessage[];
  lastSyncId: number;
}

export interface ChatSessionSettings {
  maxChatTurns: string;
  maxOutputTokens: string;
  temperature: string;
  topP: string;
  contextTopK: string;
  contextTopN: string;
  contextIncludeScore: string;
  toolPermission?: SessionToolPermission;
}

export interface ChatSessionOptions {
  modelProvider?: ProviderId;
  modelId?: string;
  initialMessages?: ChatMessage[];
  maxChatTurns?: number;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  toolPermission?: SessionToolPermission;
  contextTopK?: number;
  contextTopN?: number;
  contextIncludeScore?: number;
}

type RequiredSettings = Required<Pick<ChatSessionOptions, 'maxChatTurns' | 'maxOutputTokens' | 'temperature' | 'topP' | 'toolPermission' | 'contextTopK' | 'contextTopN' | 'contextIncludeScore'>>;
export type ChatSessionOptionsWithRequiredSettings = Omit<ChatSessionOptions, keyof RequiredSettings> & RequiredSettings;

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

// TurnResult is a discriminated union of type where 'text' has text value and 'toolCall' has toolCall value
export type TurnResult = {
  type: 'text';
  text: string;
} | {
  type: 'toolCall';
  toolCall: ToolCallResult;
};

export interface Turn {
  results?: Array<TurnResult>;
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
  getLastRequestContext(): RequestContext | undefined;
  handleMessage(message: string | ChatMessage): Promise<MessageUpdate>;

  clearModel(): MessageUpdate;
  switchModel(modelType: ProviderId, modelId: string): MessageUpdate;

  addReference(referenceName: string): boolean;
  removeReference(referenceName: string): boolean;

  addRule(ruleName: string): boolean;
  removeRule(ruleName: string): boolean;

  addTool(serverName: string, toolName: string): Promise<boolean>;
  removeTool(serverName: string, toolName: string): boolean;
  getIncludedTools(): Array<{serverName: string, toolName: string}>;

  toolIsApprovedForSession(serverId: string, toolId: string): void;
  isToolApprovalRequired(serverId: string, toolId: string): Promise<boolean>;

  updateSettings(settings: {
    maxChatTurns: number;
    maxOutputTokens: number;
    temperature: number;
    topP: number;
    toolPermission: SessionToolPermission;
    contextTopK: number;
    contextTopN: number;
    contextIncludeScore: number;
  }): boolean;
}
