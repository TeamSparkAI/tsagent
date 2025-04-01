import { ChatMessage } from './ChatSession';

export interface ModelReply {
  inputTokens: number;
  outputTokens: number;
  timestamp: number;
  turns: Turn[];
}

export interface Turn {
  message?: string;
  toolCalls?: ToolCall[];
  error?: string;
}

export interface ToolCall {
  serverName: string;
  toolName: string;
  args?: Record<string, unknown>;
  toolCallId?: string; // optional, may be provided to correlate tool call with tool result
  elapsedTimeMs: number;
  output: string;
  error?: string;
}