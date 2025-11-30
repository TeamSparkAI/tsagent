import { CallToolResultSchema, ToolSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { ChatSession } from "../types/chat.js";

// Generate our own types from the MCP SDK Zod schemas
// This ensures TypeScript resolves these types from our package, not from the consumer's node_modules
export type Tool = z.infer<typeof ToolSchema>;
export type CallToolResult = z.infer<typeof CallToolResultSchema>;

export interface CallToolResultWithElapsedTime extends CallToolResult {
    elapsedTimeMs: number;
}

// Server-level permission settings
export type ServerDefaultPermission = 'required' | 'not_required';
export type ToolPermissionSetting = 'server_default' | 'required' | 'not_required';


// Zod schemas for validation
export const ServerToolDefaultsSchema = z.object({
  permissionRequired: z.boolean().optional(),
  include: z.enum(['always', 'manual', 'agent']).optional(),
});

export const ToolConfigSchema = z.object({
  permissionRequired: z.boolean().optional(),
  include: z.enum(['always', 'manual', 'agent']).optional(),
  embeddings: z.array(z.array(z.number())).optional(),
  hash: z.string().optional(),
});

// Server-level defaults for all tools
export type ServerToolDefaults = z.infer<typeof ServerToolDefaultsSchema>;

// Individual tool configuration
export type ToolConfig = z.infer<typeof ToolConfigSchema>;

export const McpServerConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stdio'),
    command: z.string(),
    args: z.array(z.string()),
    env: z.record(z.string(), z.string()).optional(),
    cwd: z.string().optional(),
    serverToolDefaults: ServerToolDefaultsSchema.optional(),
    tools: z.record(z.string(), ToolConfigSchema).optional(),
  }),
  z.object({
    type: z.literal('sse'),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    serverToolDefaults: ServerToolDefaultsSchema.optional(),
    tools: z.record(z.string(), ToolConfigSchema).optional(),
  }),
  z.object({
    type: z.literal('streamable-http'),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    serverToolDefaults: ServerToolDefaultsSchema.optional(),
    tools: z.record(z.string(), ToolConfigSchema).optional(),
  }),
  z.object({
    type: z.literal('internal'),
    tool: z.enum(['rules', 'references', 'supervision', 'tools']),
    serverToolDefaults: ServerToolDefaultsSchema.optional(),
    tools: z.record(z.string(), ToolConfigSchema).optional(),
  }),
]);

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export interface McpServerEntry {
  name: string;
  config: McpServerConfig;
}
  
// Type for the MCP configuration file structure
export interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>;
}

// Helper function to determine server type from config
export function determineServerType(config: Omit<McpServerConfig, 'type'>): McpServerConfig['type'] {
  if ('command' in config) return 'stdio';
  if ('tool' in config) return 'internal';
  // Can't distinguish between 'sse' and 'streamable-http' from structure alone
  // Both have 'url'. Default to 'sse' for backward compatibility.
  if ('url' in config) return 'sse';
  throw new Error('Invalid server configuration');
}

// Helper functions for include mode settings

/**
 * Gets the server default include mode in the configuration
 * @param config Server configuration
 * @returns 'always' | 'manual' | 'agent' (defaults to 'always' if not specified)
 */
export function getToolIncludeServerDefault(config: McpServerConfig): 'always' | 'manual' | 'agent' {
  if (config.serverToolDefaults?.include !== undefined) {
    return config.serverToolDefaults.include;
  }
  return 'always';
}

/**
 * Gets the tool include mode for UX editing (three states: server_default, always, manual, agent)
 * @param config Server configuration
 * @param toolName Name of the tool to check
 * @returns 'server_default', 'always', 'manual', or 'agent'
 */
export function getToolIncludeMode(config: McpServerConfig, toolName: string): 'server_default' | 'always' | 'manual' | 'agent' {
  if (config.tools?.[toolName]?.include !== undefined) {
    return config.tools[toolName].include!;
  }
  return 'server_default';
}

/**
 * Gets the effective include mode for a tool (resolves server_default to actual mode)
 * @param config Server configuration
 * @param toolName Name of the tool to check
 * @returns 'always', 'manual', or 'agent'
 */
export function getToolEffectiveIncludeMode(config: McpServerConfig, toolName: string): 'always' | 'manual' | 'agent' {
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
export function isToolInContext(config: McpServerConfig, toolName: string): boolean {
  const mode = getToolEffectiveIncludeMode(config, toolName);
  return mode === 'always';
}

/**
 * Checks if a tool is available for manual inclusion
 * @param config Server configuration
 * @param toolName Name of the tool to check
 * @returns true if tool is available for manual inclusion
 */
export function isToolAvailableForManual(config: McpServerConfig, toolName: string): boolean {
  const mode = getToolEffectiveIncludeMode(config, toolName);
  return mode === 'manual' || mode === 'always';
}

/**
 * Checks if a tool is available for agent-controlled inclusion
 * @param config Server configuration
 * @param toolName Name of the tool to check
 * @returns true if tool is available for agent-controlled inclusion
 */
export function isToolAvailableForAgent(config: McpServerConfig, toolName: string): boolean {
  const mode = getToolEffectiveIncludeMode(config, toolName);
  return mode === 'agent' || mode === 'manual' || mode === 'always';
}

// Helper functions for permission required (new serialization)

/**
 * Checks if the server default is required for tools (permissions)
 * @returns true if server default is required (defaults to true if not specified)
 */
export function isToolPermissionServerDefaultRequired(config: McpServerConfig): boolean {
  if (config.serverToolDefaults?.permissionRequired !== undefined) {
    return config.serverToolDefaults.permissionRequired;
  }
  return true;
}

/**
 * Gets the tool permission state for UX (three states: server_default, required, not_required)
 */
export function getToolPermissionState(
  config: McpServerConfig,
  toolName: string
): 'server_default' | 'required' | 'not_required' {
  if (config.tools?.[toolName]?.permissionRequired !== undefined) {
    return config.tools[toolName].permissionRequired ? 'required' : 'not_required';
  }
  return 'server_default';
}

/**
 * Determines if a specific tool is required, honoring overrides and server default
 */
export function isToolPermissionRequired(config: McpServerConfig, toolName: string): boolean {
  if (config.tools?.[toolName]?.permissionRequired !== undefined) {
    return config.tools[toolName].permissionRequired!;
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
  toolEmbeddings?: Map<string, { embeddings: number[][]; hash: string }>;  // Semantic embeddings for JIT indexing (embeddings + hash)
}

export interface MCPClientManager {
  unloadMcpClient(name: string): Promise<void>;
  unloadMcpClients(): Promise<void>;
  getAllMcpClients(): Promise<Record<string, McpClient>>;
  getAllMcpClientsSync(): Record<string, McpClient>;
  getMcpClient(name: string): Promise<McpClient | undefined>;
}