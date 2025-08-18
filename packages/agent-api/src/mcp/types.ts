
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

export type McpConfigFileServerConfig = 
  | { type: 'stdio'; command: string; args: string[]; env?: Record<string, string>; permissions?: ServerPermissionConfig }
  | { type: 'sse'; url: string; headers?: Record<string, string>; permissions?: ServerPermissionConfig }
  | { type: 'internal'; tool: 'rules' | 'references'; permissions?: ServerPermissionConfig };

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
  loadMcpClients(agent: Agent): Promise<void>;
  updateMcpClient(agent: Agent, name: string, clientConfig: McpConfig): Promise<void>;
  deleteMcpClient(name: string): Promise<void>;
  getAllMcpClients(): Record<string, McpClient>;
  getMcpClient(name: string): McpClient | undefined;
}