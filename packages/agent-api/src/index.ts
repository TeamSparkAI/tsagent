// Pure JS types, constants, and factory functions
// Runtime code (that requires node.js) is exported from './runtime'

// Export agent types
export type { Agent, AgentConfig, AgentMetadata, AgentSettings, AgentSkill, AgentTool, AgentMode, SessionToolPermission } from './types/agent.js';

// Export JSON Schema types
export type { JsonSchemaDefinition, ToolInputSchema } from './types/json-schema.js';

// Export common types
export type { Logger } from './types/common.js';

// Export provider types
export { ProviderType } from './providers/types.js';
export type { ProviderInfo, ProviderModel, ModelReply } from './providers/types.js';

// Export rule and reference types
export type { Rule } from './types/rules.js';
export { RuleSchema } from './types/rules.js';
export type { Reference } from './types/references.js';
export { ReferenceSchema } from './types/references.js';

// Export chat types
export type { 
  ChatMessage,
  MessageUpdate,
  ToolCallDecision,
  ToolCallApproval,
  Turn,
  ToolCallResult,
  ToolCallRequest,
  ChatState,
  ChatSessionOptionsWithRequiredSettings,
  ChatSessionResponse
 } from './types/chat.js';

// Export context types
export type { 
  ContextItemBase,
  SessionContextItem,
  RequestContextItem,
  RequestContext
 } from './types/context.js';

// Note: SemanticIndexer class and computeTextHash are NOT exported here
// They are only used internally in AgentImpl and client-manager (main process only)
// Exporting them would pull in Node.js dependencies that can't run in the browser/renderer

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
  ServerToolDefaults,
  ToolConfig,
  // Helper functions
  isToolPermissionServerDefaultRequired,
  getToolPermissionState,
  isToolPermissionRequired,
  getToolIncludeServerDefault,
  getToolIncludeMode,
  getToolEffectiveIncludeMode,
  isToolInContext,
  isToolAvailableForManual,
  isToolAvailableForAgent
} from './mcp/types.js';

// Export constants and validation functions that are needed by implementation
export {
  getDefaultSettings,
  SessionToolPermissionSchema
} from './types/agent.js';

// Export function to populate model from settings
export { populateModelFromSettings, parseModelString, formatModelString } from './types/agent.js';
