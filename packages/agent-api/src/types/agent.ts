import { Reference, Rule } from '../index.js';
import { ProvidersManager, McpServerManager, ChatSessionManager } from '../managers/types.js';
import { McpClient, McpConfig } from '../mcp/types.js';
import { Provider, ProviderInfo, ProviderModel, ProviderType } from '../providers/types.js';
import { ChatSession, ChatSessionOptions } from './chat.js';

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

export type AgentMode = 'interactive' | 'autonomous';

// Core agent interface
export interface Agent extends ProvidersManager, McpServerManager, ChatSessionManager {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly description?: string;
  readonly mode: AgentMode;
  
  // Agent lifecycle
  load(): Promise<void>; // strategy required
  create(data?: Partial<AgentConfig>): Promise<void>;
  delete(): Promise<void>;
  
  // Settings
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): Promise<void>;
  
  // System prompt
  getSystemPrompt(): Promise<string>;
  setSystemPrompt(prompt: string): Promise<void>;

  // Agent metadata
  getMetadata(): AgentMetadata;
  updateMetadata(metadata: Partial<AgentMetadata>): Promise<void>;

  // RulesManager methods
  getAllRules(): Rule[];
  getRule(name: string): Rule | null;
  addRule(rule: Rule): Promise<void>;
  deleteRule(name: string): Promise<boolean>;

  // ReferencesManager methods
  getAllReferences(): Reference[];
  getReference(name: string): Reference | null;
  addReference(reference: Reference): Promise<void>;
  deleteReference(name: string): Promise<boolean>;

  // Provider installion/configuraiton methods
  getInstalledProviders(): ProviderType[];
  isProviderInstalled(provider: ProviderType): boolean;
  getInstalledProviderConfig(provider: ProviderType): Record<string, string> | null;
  installProvider(provider: ProviderType, config: Record<string, string>): Promise<void>;
  updateProvider(provider: ProviderType, config: Record<string, string>): Promise<void>;
  uninstallProvider(provider: ProviderType): Promise<void>;

  // Provider factory methods
  validateProviderConfiguration(provider: ProviderType, config: Record<string, string>): Promise<{ isValid: boolean, error?: string }>;
  getAvailableProviders(): ProviderType[];
  getAvailableProvidersInfo(): Partial<Record<ProviderType, ProviderInfo>>;
  createProvider(provider: ProviderType, modelId?: string): Provider; // Not serializable
  getProviderInfo(providerType: ProviderType): ProviderInfo;
  getProviderModels(providerType: ProviderType): Promise<ProviderModel[]>;

  // McpServerManager methods 
  getAllMcpServers(): Promise<Record<string, McpConfig>>;
  getMcpServer(serverName: string): McpConfig | null;
  saveMcpServer(server: McpConfig): Promise<void>;
  deleteMcpServer(serverName: string): Promise<boolean>; 

  // MCP Client access methods
  getAllMcpClients(): Promise<Record<string, McpClient>>;
  getMcpClient(name: string): Promise<McpClient | undefined>;

  // ChatSessionManager methods
  getAllChatSessions(): ChatSession[];
  getChatSession(sessionId: string): ChatSession | null;
  createChatSession(sessionId: string, options?: ChatSessionOptions): ChatSession;
  deleteChatSession(sessionId: string): Promise<boolean>;
}

// This is a subset of the AgentSkill interface from the A2A protocol
export interface AgentSkill {
  id: string;          // A unique identifier for the agent's skill
  name: string;        // A human-readable name for the skill
  description: string; // A detailed description of the skill, intended to help clients or users understand its purpose and functionality
  tags: string[];      // A set of keywords describing the skill's capabilities - ["cooking", "customer support", "billing"]
  examples?: string[]; // Example prompts or scenarios that this skill can handle. Provides a hint to the client on how to use the skill
}

export interface AgentMetadata {
  name: string;
  version?: string;
  description?: string;
  iconUrl?: string;
  documentationUrl?: string;
  provider?: {
    organization: string;
    url: string;
  };
  skills?: AgentSkill[];
  created: string;
  lastAccessed: string;
}

export interface AgentSettings {
  [SETTINGS_KEY_MAX_CHAT_TURNS]: string;
  [SETTINGS_KEY_MAX_OUTPUT_TOKENS]: string;
  [SETTINGS_KEY_TEMPERATURE]: string;
  [SETTINGS_KEY_TOP_P]: string;
  [SETTINGS_KEY_THEME]: string;
  [SESSION_TOOL_PERMISSION_KEY]?: SessionToolPermission;
  [key: string]: string | SessionToolPermission | undefined;
}

export interface AgentConfig {
  metadata: AgentMetadata;
  settings: AgentSettings;
  providers?: Record<string, any>;
  mcpServers?: Record<string, any>;
}

function getProviderByName(name: string): ProviderType | undefined {
  const providerType = Object.values(ProviderType).find(
    p => p.toLowerCase() === name.toLowerCase()
  );
  return providerType;
}

export function populateModelFromSettings(agent: Agent, chatSessionOptions: ChatSessionOptions): void {
  if (chatSessionOptions.modelProvider && chatSessionOptions.modelId) {
    return;
  }

  const mostRecentModel = agent.getSetting(SETTINGS_KEY_MOST_RECENT_MODEL);
  if (mostRecentModel) {
    const colonIndex = mostRecentModel.indexOf(':');
    if (colonIndex !== -1) {
      const providerId = mostRecentModel.substring(0, colonIndex);
      const modelId = mostRecentModel.substring(colonIndex + 1);
      const provider = getProviderByName(providerId);
      if (provider && agent.isProviderInstalled(provider)) {
        chatSessionOptions.modelProvider = provider;
        chatSessionOptions.modelId = modelId;
      }
    }
  }  
}