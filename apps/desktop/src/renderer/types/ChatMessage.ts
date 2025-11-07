import { ModelReply, ToolCallDecision, RequestContext } from '@tsagent/core';

// This is the "Renderer" chat message
export interface RendererChatMessage {
  type: 'user' | 'ai' | 'system' | 'error' | 'approval';
  content: string;
  modelReply?: ModelReply;
  requestContext?: RequestContext;  // Context used for this request/response pair (assistant messages only)
  toolCallApprovals?: Array<{
    toolCallId: string;
    decision: ToolCallDecision;
    serverName: string;
    toolName: string;
    args?: Record<string, unknown>;
  }>;
}