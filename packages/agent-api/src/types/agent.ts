import { RulesManager, ReferencesManager, ProvidersManager, McpServerManager, ChatSessionManager } from '../managers/types';
import { MCPClientManager } from '../mcp/types';

export const MAX_CHAT_TURNS_KEY = 'maxChatTurns';
export const MAX_OUTPUT_TOKENS_KEY = 'maxOutputTokens';
export const TEMPERATURE_KEY = 'temperature';
export const TOP_P_KEY = 'topP';
export const SYSTEM_PATH_KEY = 'systemPath';
export const MOST_RECENT_MODEL_KEY = 'mostRecentModel';
export const THEME_KEY = 'theme';

// Tool Permission Settings
export type SessionToolPermission = 'always' | 'never' | 'tool';

// Constants for session-level permissions
export const SESSION_TOOL_PERMISSION_KEY = 'toolPermission';
export const SESSION_TOOL_PERMISSION_ALWAYS: SessionToolPermission = 'always';
export const SESSION_TOOL_PERMISSION_NEVER: SessionToolPermission = 'never';
export const SESSION_TOOL_PERMISSION_TOOL: SessionToolPermission = 'tool';
export const SESSION_TOOL_PERMISSION_DEFAULT: SessionToolPermission = SESSION_TOOL_PERMISSION_TOOL;

export const MAX_CHAT_TURNS_DEFAULT = 20;
export const MAX_OUTPUT_TOKENS_DEFAULT = 1000;
export const TEMPERATURE_DEFAULT = 0.5;
export const TOP_P_DEFAULT = 0.5;

// Core agent interface
export interface Agent {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly description?: string;
  
  // Settings
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): Promise<void>;
  
  // System prompt
  getSystemPrompt(): Promise<string>;
  setSystemPrompt(prompt: string): Promise<void>;
  
  // Sub-managers
  readonly rules: RulesManager;
  readonly references: ReferencesManager;
  readonly providers: ProvidersManager;
  readonly mcpServers: McpServerManager;
  readonly mcpManager: MCPClientManager;
  readonly chatSessions: ChatSessionManager;
  
  // Lifecycle
  save(): Promise<void>;
  delete(): Promise<void>;
  clone(targetPath: string): Promise<Agent>;
}

export interface AgentMetadata {
  name: string;
  created: string;
  lastAccessed: string;
  version: string;
}

export interface AgentConfig {
  metadata: AgentMetadata;
  settings: {
      [MAX_CHAT_TURNS_KEY]: string;
      [MAX_OUTPUT_TOKENS_KEY]: string;
      [TEMPERATURE_KEY]: string;
      [TOP_P_KEY]: string;
      [THEME_KEY]: string;
      [SESSION_TOOL_PERMISSION_KEY]?: SessionToolPermission;
      [key: string]: string | SessionToolPermission | undefined;
  };
}