import { ChatMessage } from './ChatSession';

export interface LlmReply {
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
  args: Record<string, unknown>;
  elapsedTimeMs: number;
  output: string;
  error?: string;
}