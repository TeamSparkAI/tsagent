import { ModelReply, ToolCallDecision } from 'agent-api';

// This is the "Renderer" chat message
export interface RendererChatMessage {
  type: 'user' | 'ai' | 'system' | 'error' | 'approval';
  content: string;
  modelReply?: ModelReply;
  toolCallApprovals?: Array<{
    toolCallId: string;
    decision: ToolCallDecision;
    serverName: string;
    toolName: string;
    args?: Record<string, unknown>;
  }>;
}