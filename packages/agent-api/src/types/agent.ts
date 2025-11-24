import { z } from 'zod';
import { Reference, Rule } from '../index.js';
import { ProvidersManager, McpServerManager, ChatSessionManager } from '../managers/types.js';
import { McpClient, McpConfig } from '../mcp/types.js';
import { Provider, ProviderInfo, ProviderModel, ProviderType } from '../providers/types.js';
import { ChatSession, ChatSessionOptions } from './chat.js';
import { SupervisionManager, Supervisor, SupervisorConfig, SupervisorConfigSchema } from './supervision.js';
import { ToolInputSchema, ToolInputSchemaSchema } from './json-schema.js';
import { SessionContextItem, RequestContextItem } from './context.js';

export { SupervisorConfig };

export const SETTINGS_KEY_MAX_CHAT_TURNS = 'maxChatTurns';
export const SETTINGS_KEY_MAX_OUTPUT_TOKENS = 'maxOutputTokens';
export const SETTINGS_KEY_TEMPERATURE = 'temperature';
export const SETTINGS_KEY_TOP_P = 'topP';
export const SETTINGS_KEY_SYSTEM_PATH = 'systemPath';
export const SETTINGS_KEY_MOST_RECENT_MODEL = 'mostRecentModel';
export const SETTINGS_KEY_THEME = 'theme';
export const SETTINGS_KEY_CONTEXT_TOP_K = 'contextTopK';
export const SETTINGS_KEY_CONTEXT_TOP_N = 'contextTopN';
export const SETTINGS_KEY_CONTEXT_INCLUDE_SCORE = 'contextIncludeScore';

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
export const SETTINGS_DEFAULT_CONTEXT_TOP_K = 20;
export const SETTINGS_DEFAULT_CONTEXT_TOP_N = 5;
export const SETTINGS_DEFAULT_CONTEXT_INCLUDE_SCORE = 0.7;

// Tool Permission Settings
export const SessionToolPermissionSchema = z.enum(['always', 'never', 'tool']);
export type SessionToolPermission = z.infer<typeof SessionToolPermissionSchema>;

export type AgentMode = 'interactive' | 'autonomous' | 'tools';

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
  getResolvedProviderConfig(provider: ProviderType): Promise<Record<string, string> | null>;
  installProvider(provider: ProviderType, config: Record<string, string>): Promise<void>;
  updateProvider(provider: ProviderType, config: Record<string, string>): Promise<void>;
  uninstallProvider(provider: ProviderType): Promise<void>;

  // Provider factory methods
  validateProviderConfiguration(provider: ProviderType, config: Record<string, string>): Promise<{ isValid: boolean, error?: string }>;
  getAvailableProviders(): ProviderType[];
  getAvailableProvidersInfo(): Partial<Record<ProviderType, ProviderInfo>>;
  createProvider(provider: ProviderType, modelId?: string): Promise<Provider>; // Not serializable
  getProviderInfo(providerType: ProviderType): ProviderInfo;
  getProviderModels(providerType: ProviderType): Promise<ProviderModel[]>;

  // McpServerManager methods 
  getAllMcpServers(): Promise<Record<string, McpConfig>>;
  getMcpServer(serverName: string): McpConfig | null;
  saveMcpServer(server: McpConfig): Promise<void>;
  deleteMcpServer(serverName: string): Promise<boolean>; 

  // MCP Client access methods
  getAllMcpClients(): Promise<Record<string, McpClient>>;
  getAllMcpClientsSync(): Record<string, McpClient>;
  getMcpClient(name: string): Promise<McpClient | undefined>;
  
  // Internal methods for MCP server access
  getAgentMcpServers(): Record<string, any> | null;

  // ChatSessionManager methods
  getAllChatSessions(): ChatSession[];
  getChatSession(sessionId: string): ChatSession | null;
  createChatSession(sessionId: string, options?: ChatSessionOptions): ChatSession;
  deleteChatSession(sessionId: string): Promise<boolean>;

  // Supervision management
  getSupervisionManager(): SupervisionManager | null;
  setSupervisionManager(supervisionManager: SupervisionManager): void;
  addSupervisor(supervisor: Supervisor): Promise<void>;
  removeSupervisor(supervisorId: string): Promise<void>;
  getSupervisor(supervisorId: string): Supervisor | null;
  getAllSupervisors(): Supervisor[];
  
  // Supervisor configuration access (read-only)
  getSupervisorConfigs(): SupervisorConfig[];

  // Semantic search
  searchContextItems(
    query: string,
    items: SessionContextItem[],
    options?: {
      topK?: number;  // Max embedding matches to consider (default: 20)
      topN?: number;  // Target number of results to return after grouping (default: 5)
      includeScore?: number;  // Always include items with this score or higher (default: 0.7)
    }
  ): Promise<RequestContextItem[]>;
}

// This is a subset of the AgentSkill interface from the A2A protocol
/**
 * AgentSkill schema - single source of truth.
 */
export const AgentSkillSchema = z.object({
  id: z.string().min(1, "Skill ID is required"),
  name: z.string().min(1, "Skill name is required"),
  description: z.string(),
  tags: z.array(z.string()),
  examples: z.array(z.string()).optional(),
});

// Type inferred from schema
export type AgentSkill = z.infer<typeof AgentSkillSchema>;

// Tool definition for Tools agent mode (MCP server with cognitive layer)
/**
 * AgentTool schema - single source of truth.
 */
export const AgentToolSchema = z.object({
  name: z.string().min(1, "Tool name is required"),
  description: z.string(),
  parameters: ToolInputSchemaSchema,
  prompt: z.string(),
});

// Type inferred from schema
export type AgentTool = z.infer<typeof AgentToolSchema>;

/**
 * AgentMetadata schema - single source of truth.
 */
export const AgentMetadataSchema = z.object({
  name: z.string().min(1, "Name is required"),
  version: z.string().optional(),
  description: z.string().optional(),
  iconUrl: z.string().optional(),
  documentationUrl: z.string().optional(),
  provider: z.object({
    organization: z.string(),
    url: z.string(),
  }).optional(),
  skills: z.array(AgentSkillSchema).optional(),
  tools: z.array(AgentToolSchema).optional(),
  created: z.string(),
  lastAccessed: z.string(),
});

// Type inferred from schema
export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;

/**
 * AgentSettings schema - single source of truth.
 * Settings are stored as string key-value pairs, with optional toolPermission enum.
 */
export const AgentSettingsSchema = z.object({
  [SETTINGS_KEY_MAX_CHAT_TURNS]: z.string().optional(),
  [SETTINGS_KEY_MAX_OUTPUT_TOKENS]: z.string().optional(),
  [SETTINGS_KEY_TEMPERATURE]: z.string().optional(),
  [SETTINGS_KEY_TOP_P]: z.string().optional(),
  [SETTINGS_KEY_THEME]: z.string().optional(),
  [SETTINGS_KEY_CONTEXT_TOP_K]: z.string().optional(),
  [SETTINGS_KEY_CONTEXT_TOP_N]: z.string().optional(),
  [SETTINGS_KEY_CONTEXT_INCLUDE_SCORE]: z.string().optional(),
  [SESSION_TOOL_PERMISSION_KEY]: SessionToolPermissionSchema.optional(),
}).catchall(z.union([z.string(), SessionToolPermissionSchema]).optional());

// Type inferred from schema
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

/**
 * AgentConfig schema - single source of truth.
 */
export const AgentConfigSchema = z.object({
  metadata: AgentMetadataSchema,
  settings: AgentSettingsSchema,
  providers: z.record(z.string(), z.any()).optional(),
  mcpServers: z.record(z.string(), z.any()).optional(),
  supervisors: z.array(SupervisorConfigSchema).optional(),
});

// Type inferred from schema
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

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