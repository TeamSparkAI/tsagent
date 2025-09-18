
import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types";
import { ChatSession } from "../types/chat";
import { Agent } from "../types/agent";

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

// Server-level enabled/disabled settings
export interface ServerToolEnabledConfig {
    serverDefault: boolean;
    tools?: Record<string, boolean>;
}

export type McpConfigFileServerConfig = 
  | { type: 'stdio'; command: string; args: string[]; env?: Record<string, string>; cwd?: string; toolEnabled?: ServerToolEnabledConfig; toolPermissionRequired?: ServerToolPermissionRequiredConfig }
  | { type: 'sse'; url: string; headers?: Record<string, string>; toolEnabled?: ServerToolEnabledConfig; toolPermissionRequired?: ServerToolPermissionRequiredConfig }
  | { type: 'internal'; tool: 'rules' | 'references'; toolEnabled?: ServerToolEnabledConfig; toolPermissionRequired?: ServerToolPermissionRequiredConfig };

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

// Helper functions for enabled/disabled settings

/**
 * Checks if a server default is enabled in the configuration (for UX editing)
 * @param config Server configuration
 * @returns true if server default is enabled (defaults to true if not specified)
 */
export function isToolEnabledServerDefaultEnabled(config: McpConfigFileServerConfig): boolean {
  // Default to true if toolEnabled property is missing or serverDefault is missing/true
  return config.toolEnabled?.serverDefault !== false;
}

/**
 * Gets the tool enabled state for UX editing (three states: server_default, enabled, disabled)
 * @param config Server configuration
 * @param toolName Name of the tool to check
 * @returns 'server_default', 'enabled', or 'disabled'
 */
export function getToolEnabledState(config: McpConfigFileServerConfig, toolName: string): 'server_default' | 'enabled' | 'disabled' {
  // If no tool-specific config, it's using server default
  if (!config.toolEnabled?.tools || !(toolName in config.toolEnabled.tools)) {
    return 'server_default';
  }
  
  // Return the explicit tool setting
  return config.toolEnabled.tools[toolName] ? 'enabled' : 'disabled';
}

/**
 * Checks if a tool is enabled in the configuration (for runtime logic)
 * @param config Server configuration
 * @param toolName Name of the tool to check
 * @returns true if tool is enabled (uses server default if not specified)
 */
export function isToolEnabled(config: McpConfigFileServerConfig, toolName: string): boolean {
  // If no tool-specific config, use server default
  if (!config.toolEnabled?.tools || !(toolName in config.toolEnabled.tools)) {
    return isToolEnabledServerDefaultEnabled(config);
  }
  
  // Return the explicit tool setting
  return config.toolEnabled.tools[toolName];
}

/**
 * Checks if a tool is actually available to the LLM (enabled tool)
 * @param config Server configuration
 * @param toolName Name of the tool to check
 * @returns true if tool is available (tool is enabled)
 */
export function isToolAvailable(config: McpConfigFileServerConfig, toolName: string): boolean {
  // Tool is available if it's enabled (either explicitly or via server default)
  return isToolEnabled(config, toolName);
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
  getMcpClient(name: string): Promise<McpClient | undefined>;
}