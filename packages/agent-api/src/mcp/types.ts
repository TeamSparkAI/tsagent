import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

import { ChatSession } from "../types/chat.js";

// Re-export the imported types
export { CallToolResult, Tool };

export interface CallToolResultWithElapsedTime extends CallToolResult {
    elapsedTimeMs: number;
}

// Constants for server-level permissions
export const SERVER_PERMISSION_REQUIRED = 'required';
export const SERVER_PERMISSION_NOT_REQUIRED = 'not_required';
export const TOOL_PERMISSION_SERVER_DEFAULT = 'server_default';
export const TOOL_PERMISSION_REQUIRED = 'required';
export const TOOL_PERMISSION_NOT_REQUIRED = 'not_required';

// Server-level permission settings
export type ServerDefaultPermission = typeof SERVER_PERMISSION_REQUIRED | typeof SERVER_PERMISSION_NOT_REQUIRED;
export type ToolPermissionSetting = typeof TOOL_PERMISSION_SERVER_DEFAULT | typeof TOOL_PERMISSION_REQUIRED | typeof TOOL_PERMISSION_NOT_REQUIRED;


export interface ServerToolPermissionRequiredConfig {
  serverDefault: boolean; // true => required, false => not required
  tools?: Record<string, boolean>; // true => required, false => not required; absence => use server default
}

// Server-level include mode settings
export interface ServerToolIncludeConfig {
    serverDefault: 'always' | 'manual' | 'agent';
    tools?: Record<string, 'always' | 'manual' | 'agent'>;
}

export type McpConfigFileServerConfig = 
  | { type: 'stdio'; command: string; args: string[]; env?: Record<string, string>; cwd?: string; toolInclude?: ServerToolIncludeConfig; toolPermissionRequired?: ServerToolPermissionRequiredConfig }
  | { type: 'sse'; url: string; headers?: Record<string, string>; toolInclude?: ServerToolIncludeConfig; toolPermissionRequired?: ServerToolPermissionRequiredConfig }
  | { type: 'internal'; tool: 'rules' | 'references' | 'supervision' | 'tools'; toolInclude?: ServerToolIncludeConfig; toolPermissionRequired?: ServerToolPermissionRequiredConfig };

export interface McpConfig {
  name: string;
  config: McpConfigFileServerConfig;
}
  
// Type for the MCP configuration file structure
export interface McpConfigFile {
  mcpServers: Record<string, McpConfigFileServerConfig>;
}

// Helper function to determine server type from config
export function determineServerType(config: Omit<McpConfigFileServerConfig, 'type'>): McpConfigFileServerConfig['type'] {
  if ('command' in config) return 'stdio';
  if ('url' in config) return 'sse';
  if ('tool' in config) return 'internal';
  throw new Error('Invalid server configuration');
}

// Helper functions for include mode settings

/**
 * Gets the server default include mode in the configuration
 * @param config Server configuration
 * @returns 'always' | 'manual' | 'agent' (defaults to 'always' if not specified)
 */
export function getToolIncludeServerDefault(config: McpConfigFileServerConfig): 'always' | 'manual' | 'agent' {
  return config.toolInclude?.serverDefault || 'always';
}

/**
 * Gets the tool include mode for UX editing (three states: server_default, always, manual, agent)
 * @param config Server configuration
 * @param toolName Name of the tool to check
 * @returns 'server_default', 'always', 'manual', or 'agent'
 */
export function getToolIncludeMode(config: McpConfigFileServerConfig, toolName: string): 'server_default' | 'always' | 'manual' | 'agent' {
  // If no tool-specific config, it's using server default
  if (!config.toolInclude?.tools || !(toolName in config.toolInclude.tools)) {
    return 'server_default';
  }
  
  // Return the explicit tool setting
  return config.toolInclude.tools[toolName];
}

/**
 * Gets the effective include mode for a tool (resolves server_default to actual mode)
 * @param config Server configuration
 * @param toolName Name of the tool to check
 * @returns 'always', 'manual', or 'agent'
 */
export function getToolEffectiveIncludeMode(config: McpConfigFileServerConfig, toolName: string): 'always' | 'manual' | 'agent' {
  const toolMode = getToolIncludeMode(config, toolName);
  if (toolMode === 'server_default') {
    return getToolIncludeServerDefault(config);
  }
  return toolMode;
}

/**
 * Checks if a tool should be included in context (for runtime logic)
 * @param config Server configuration
 * @param toolName Name of the tool to check
 * @returns true if tool should be included in context
 */
export function isToolInContext(config: McpConfigFileServerConfig, toolName: string): boolean {
  const mode = getToolEffectiveIncludeMode(config, toolName);
  return mode === 'always';
}

/**
 * Checks if a tool is available for manual inclusion
 * @param config Server configuration
 * @param toolName Name of the tool to check
 * @returns true if tool is available for manual inclusion
 */
export function isToolAvailableForManual(config: McpConfigFileServerConfig, toolName: string): boolean {
  const mode = getToolEffectiveIncludeMode(config, toolName);
  return mode === 'manual' || mode === 'always';
}

/**
 * Checks if a tool is available for agent-controlled inclusion
 * @param config Server configuration
 * @param toolName Name of the tool to check
 * @returns true if tool is available for agent-controlled inclusion
 */
export function isToolAvailableForAgent(config: McpConfigFileServerConfig, toolName: string): boolean {
  const mode = getToolEffectiveIncludeMode(config, toolName);
  return mode === 'agent' || mode === 'manual' || mode === 'always';
}

// Helper functions for permission required (new serialization)

/**
 * Checks if the server default is required for tools (permissions)
 * @returns true if server default is required (defaults to true if not specified)
 */
export function isToolPermissionServerDefaultRequired(config: McpConfigFileServerConfig): boolean {
  if (config.toolPermissionRequired && typeof config.toolPermissionRequired.serverDefault === 'boolean') {
    return config.toolPermissionRequired.serverDefault;
  }
  // Default to required
  return true;
}

/**
 * Gets the tool permission state for UX (three states: server_default, required, not_required)
 */
export function getToolPermissionState(
  config: McpConfigFileServerConfig,
  toolName: string
): 'server_default' | 'required' | 'not_required' {
  const overrides = config.toolPermissionRequired?.tools;
  if (overrides && toolName in overrides) {
    return overrides[toolName] ? 'required' : 'not_required';
  }
  return 'server_default';
}

/**
 * Determines if a specific tool is required, honoring overrides and server default
 */
export function isToolPermissionRequired(config: McpConfigFileServerConfig, toolName: string): boolean {
  const overrides = config.toolPermissionRequired?.tools;
  if (overrides && toolName in overrides) {
    return !!overrides[toolName];
  }
  return isToolPermissionServerDefaultRequired(config);
}

export interface ToolParameter {
  type: string;
  description: string;
  required?: boolean;
}

export interface McpClient {
  serverVersion: { name: string; version: string } | null;
  serverTools: Tool[];
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  callTool(tool: Tool, args?: Record<string, unknown>, session?: ChatSession): Promise<CallToolResultWithElapsedTime>;
  cleanup(): Promise<void>;
  getErrorLog(): string[];
  isConnected(): boolean;
  ping(): Promise<{ elapsedTimeMs: number }>;
}

export interface MCPClientManager {
  unloadMcpClient(name: string): Promise<void>;
  unloadMcpClients(): Promise<void>;
  getAllMcpClients(): Promise<Record<string, McpClient>>;
  getAllMcpClientsSync(): Record<string, McpClient>;
  getMcpClient(name: string): Promise<McpClient | undefined>;
}