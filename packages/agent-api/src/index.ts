// Pure JS types, constants, and factory functions
// Runtime code (that requires node.js) is exported from './runtime'

// Export agent types
export type { Agent, AgentConfig, AgentMetadata, AgentSkill, SessionToolPermission } from './types/agent.js';

// Export common types
export type { Logger } from './types/common.js';

// Export provider types
export { ProviderType } from './providers/types.js';
export type { ProviderInfo, ProviderModel, ModelReply } from './providers/types.js';

// Export rule and reference types
export type { Rule } from './types/rules.js';
export type { Reference } from './types/references.js';

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
  ChatSessionOptionsWithRequiredSettings,
  ChatSessionResponse,
  TOOL_CALL_DECISION_ALLOW_SESSION, 
  TOOL_CALL_DECISION_ALLOW_ONCE, 
  TOOL_CALL_DECISION_DENY
 } from './types/chat.js';

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
  ServerToolEnabledConfig,
  ServerToolPermissionRequiredConfig,
  SERVER_PERMISSION_REQUIRED,
  SERVER_PERMISSION_NOT_REQUIRED,
  TOOL_PERMISSION_SERVER_DEFAULT,
  TOOL_PERMISSION_REQUIRED,
  TOOL_PERMISSION_NOT_REQUIRED,
  isToolPermissionServerDefaultRequired,
  getToolPermissionState,
  isToolPermissionRequired,
  isToolEnabledServerDefaultEnabled,
  isToolEnabled,
  isToolAvailable,
  getToolEnabledState
} from './mcp/types.js';

// Export constants that are needed by implementation
export {
  SETTINGS_KEY_MAX_CHAT_TURNS,
  SETTINGS_KEY_MAX_OUTPUT_TOKENS,
  SETTINGS_KEY_TEMPERATURE,
  SETTINGS_KEY_TOP_P,
  SETTINGS_KEY_THEME,
  SETTINGS_KEY_SYSTEM_PATH,
  SETTINGS_KEY_MOST_RECENT_MODEL,
  SESSION_TOOL_PERMISSION_KEY,
  SESSION_TOOL_PERMISSION_ALWAYS,
  SESSION_TOOL_PERMISSION_NEVER,
  SESSION_TOOL_PERMISSION_TOOL,
  SESSION_TOOL_PERMISSION_DEFAULT,
  SETTINGS_DEFAULT_MAX_CHAT_TURNS,
  SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS,
  SETTINGS_DEFAULT_TEMPERATURE,
  SETTINGS_DEFAULT_TOP_P
} from './types/agent.js';

// Export function to populate model from settings
export { populateModelFromSettings } from './types/agent.js';

// Export agent filename constant
export const AGENT_FILE_NAME = 'tsagent.json';