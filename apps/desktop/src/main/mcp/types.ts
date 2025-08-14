import { CallToolResult } from "@modelcontextprotocol/sdk/types";

export interface CallToolResultWithElapsedTime extends CallToolResult {
    elapsedTimeMs: number;
}

export interface McpConfig {
  name: string;
  config: McpConfigFileServerConfig;
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
