import { RulesManager, ReferencesManager, ProvidersManager, McpServerManager, ChatSessionManager } from '../managers/types';
import { MCPClientManager } from '../mcp/types';

export const SETTINGS_KEY_MAX_CHAT_TURNS = 'maxChatTurns';
export const SETTINGS_KEY_MAX_OUTPUT_TOKENS = 'maxOutputTokens';
export const SETTINGS_KEY_TEMPERATURE = 'temperature';
export const SETTINGS_KEY_TOP_P = 'topP';
export const SETTINGS_KEY_SYSTEM_PATH = 'systemPath';
export const SETTINGS_KEY_MOST_RECENT_MODEL = 'mostRecentModel';
export const SETTINGS_KEY_THEME = 'theme';

// Tool Permission Settings
export type SessionToolPermission = 'always' | 'never' | 'tool';

// Constants for session-level permissions
export const SESSION_TOOL_PERMISSION_KEY = 'toolPermission';
export const SESSION_TOOL_PERMISSION_ALWAYS: SessionToolPermission = 'always';
export const SESSION_TOOL_PERMISSION_NEVER: SessionToolPermission = 'never';
export const SESSION_TOOL_PERMISSION_TOOL: SessionToolPermission = 'tool';
export const SESSION_TOOL_PERMISSION_DEFAULT: SessionToolPermission = SESSION_TOOL_PERMISSION_TOOL;

// Default values for settings (Agent or ChatSession)
export const SETTINGS_DEFAULT_MAX_CHAT_TURNS = 20;
export const SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS = 1000;
export const SETTINGS_DEFAULT_TEMPERATURE = 0.5;
export const SETTINGS_DEFAULT_TOP_P = 0.5;

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
      [SETTINGS_KEY_MAX_CHAT_TURNS]: string;
      [SETTINGS_KEY_MAX_OUTPUT_TOKENS]: string;
      [SETTINGS_KEY_TEMPERATURE]: string;
      [SETTINGS_KEY_TOP_P]: string;
      [SETTINGS_KEY_THEME]: string;
      [SESSION_TOOL_PERMISSION_KEY]?: SessionToolPermission;
      [key: string]: string | SessionToolPermission | undefined;
  };
  providers?: Record<string, any>;
  mcpServers?: Record<string, any>;
}