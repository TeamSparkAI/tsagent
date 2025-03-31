import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types";

export interface CallToolResultWithElapsedTime extends CallToolResult {
    elapsedTimeMs: number;
}

export interface McpConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpConfigFileServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
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
  callTool(tool: Tool, args?: Record<string, unknown>): Promise<CallToolResultWithElapsedTime>;
  cleanup(): Promise<void>;
  getErrorLog(): string[];
  isConnected(): boolean;
  ping(): Promise<{ elapsedTimeMs: number }>;
}