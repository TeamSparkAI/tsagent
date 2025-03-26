import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types";

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

export interface MCPClient {
  serverVersion: { name: string; version: string } | null;
  serverTools: Tool[];
  connectToServer(command: string, args: string[], env?: Record<string, string>): Promise<void>;
  callTool(tool: Tool, args?: Record<string, unknown>): Promise<CallToolResult>;
  cleanup(): Promise<void>;
}