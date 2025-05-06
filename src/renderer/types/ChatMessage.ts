import { ModelReply } from '../../shared/ModelReply';
import { ToolCallDecision } from '../../shared/ChatSession';

// This is the "Renderer" chat message
export interface RendererChatMessage {
  type: 'user' | 'ai' | 'system' | 'error';
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