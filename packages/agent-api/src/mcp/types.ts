
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

export interface ToolPermissionConfig {
    permission: ToolPermissionSetting;
}

export interface ServerPermissionConfig {
    defaultPermission: ServerDefaultPermission;
    toolPermissions?: Record<string, ToolPermissionConfig>;
}

// Server-level enabled/disabled settings
export interface ServerEnabledConfig {
    serverDefault: boolean;
    tools?: Record<string, boolean>;
}

export type McpConfigFileServerConfig = 
  | { type: 'stdio'; command: string; args: string[]; env?: Record<string, string>; cwd?: string; permissions?: ServerPermissionConfig; toolEnabled?: ServerEnabledConfig }
  | { type: 'sse'; url: string; headers?: Record<string, string>; permissions?: ServerPermissionConfig; toolEnabled?: ServerEnabledConfig }
  | { type: 'internal'; tool: 'rules' | 'references'; permissions?: ServerPermissionConfig; toolEnabled?: ServerEnabledConfig };

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