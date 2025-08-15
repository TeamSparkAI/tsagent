// Pure JS types, constants, and factory functions
// Runtime code (that requires node.js) is exported from './runtime'

// Export agent types
export type { Agent, AgentConfig, SessionToolPermission } from './types/agent';

// Export common types
export type { Logger } from './types/common';

// Export provider types
export { ProviderType } from './providers/types';
export type { ProviderInfo, ProviderModel, ModelReply } from './providers/types';

// Export rule and reference types
export type { Rule } from './types/rules';
export type { Reference } from './types/references';

// Export chat types
export { 
  ChatMessage,
  MessageUpdate,
  ToolCallDecision,
  ToolCallApproval,
  Turn,
  ToolCallResult,
  ToolCallRequest,
  ChatState,
  ChatSessionResponse,
  TOOL_CALL_DECISION_ALLOW_SESSION, 
  TOOL_CALL_DECISION_ALLOW_ONCE, 
  TOOL_CALL_DECISION_DENY
 } from './types/chat';

import { ChatSessionImpl } from './core/chat-session';
import type { ChatSessionOptionsWithRequiredSettings } from './core/chat-session';
import type { Agent } from './types/agent';
import type { ChatSession } from './types/chat';

// Factory function for creating chat sessions
export const createChatSession = (agent: Agent, id: string, options: ChatSessionOptionsWithRequiredSettings): ChatSession => {
  return new ChatSessionImpl(agent, id, options);
};

// Export the type for consumers
export type { ChatSessionOptionsWithRequiredSettings };

// Export MCP types and constants 
export { 
  Tool, 
  CallToolResult, 
  CallToolResultWithElapsedTime, 
  McpConfig, 
  McpConfigFile, 
  McpClient, 
  MCPClientManager,
  ServerDefaultPermission,
  ToolPermissionSetting,
  SERVER_PERMISSION_REQUIRED,
  SERVER_PERMISSION_NOT_REQUIRED,
  TOOL_PERMISSION_SERVER_DEFAULT,
  TOOL_PERMISSION_REQUIRED,
  TOOL_PERMISSION_NOT_REQUIRED
} from './mcp/types';

// Export constants that are needed by implementation
export {
  MAX_CHAT_TURNS_KEY,
  MAX_OUTPUT_TOKENS_KEY,
  TEMPERATURE_KEY,
  TOP_P_KEY,
  THEME_KEY,
  SYSTEM_PATH_KEY,
  MOST_RECENT_MODEL_KEY,
  SESSION_TOOL_PERMISSION_KEY,
  SESSION_TOOL_PERMISSION_ALWAYS,
  SESSION_TOOL_PERMISSION_NEVER,
  SESSION_TOOL_PERMISSION_TOOL,
  SESSION_TOOL_PERMISSION_DEFAULT,
  MAX_CHAT_TURNS_DEFAULT,
  MAX_OUTPUT_TOKENS_DEFAULT,
  TEMPERATURE_DEFAULT,
  TOP_P_DEFAULT
} from './types/agent';
