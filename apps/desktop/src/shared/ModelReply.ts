import { ChatMessage } from './ChatSession';

export interface ModelReply {
  timestamp: number;
  turns: Turn[];
  pendingToolCalls?: ToolCallRequest[];
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