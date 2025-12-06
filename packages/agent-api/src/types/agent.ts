import { z } from 'zod';
import { Rule, RuleSchema } from '../types/rules.js';
import { Reference, ReferenceSchema } from '../types/references.js';
import { ProvidersManager, McpServerManager, ChatSessionManager } from '../managers/types.js';
import { McpClient, McpServerEntry, McpServerConfig, McpServerConfigSchema } from '../mcp/types.js';
import { Provider, ProviderInfo, ProviderModel, ProviderId } from '../providers/types.js';
import { ChatSession, ChatSessionOptions } from './chat.js';
import { SupervisionManager, Supervisor, SupervisorConfig, SupervisorConfigSchema } from './supervision.js';
import { ToolInputSchemaSchema } from './json-schema.js';
import { SessionContextItem, RequestContextItem } from './context.js';

export { SupervisorConfig };

// Provider configuration schema
// Currently just string key-value pairs, but structured as a schema for future evolution
export const ProviderConfigSchema = z.record(z.string(), z.string());
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// Tool Permission Settings
export const SessionToolPermissionSchema = z.enum(['always', 'never', 'tool']);
export type SessionToolPermission = z.infer<typeof SessionToolPermissionSchema>;

// Core agent interface
export interface Agent extends ProvidersManager, McpServerManager, ChatSessionManager {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly description?: string;
  readonly autonomous: boolean;
  
  // Agent lifecycle
  load(): Promise<void>; // strategy required
  create(data?: Partial<AgentConfig>): Promise<void>;
  delete(): Promise<void>;
  
  // Settings
  getSettings(): AgentSettings;
  updateSettings(settings: Partial<AgentSettings>): Promise<void>;
  
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
  getInstalledProviders(): ProviderId[];
  isProviderInstalled(provider: ProviderId): boolean;
  getInstalledProviderConfig(provider: ProviderId): Record<string, string> | null;
  getResolvedProviderConfig(provider: ProviderId): Promise<Record<string, string> | null>;
  installProvider(provider: ProviderId, config: Record<string, string>): Promise<void>;
  updateProvider(provider: ProviderId, config: Record<string, string>): Promise<void>;
  uninstallProvider(provider: ProviderId): Promise<void>;

  // Provider factory methods
  validateProviderConfiguration(provider: ProviderId, config: Record<string, string>): Promise<{ isValid: boolean, error?: string }>;
  getAvailableProviders(): ProviderId[];
  getAvailableProvidersInfo(): Partial<Record<ProviderId, ProviderInfo>>;
  createProvider(provider: ProviderId, modelId?: string): Promise<Provider>; // Not serializable
  getProviderInfo(providerType: ProviderId): ProviderInfo;
  getProviderIcon(providerType: ProviderId): string | null;
  getProviderModels(providerType: ProviderId): Promise<ProviderModel[]>;

  // McpServerManager methods 
  getAllMcpServers(): Promise<Record<string, McpServerEntry>>;
  getMcpServer(serverName: string): McpServerEntry | null;
  saveMcpServer(server: McpServerEntry): Promise<void>;
  deleteMcpServer(serverName: string): Promise<boolean>; 

  // MCP Client access methods
  getAllMcpClients(): Promise<Record<string, McpClient>>;
  getAllMcpClientsSync(): Record<string, McpClient>;
  getMcpClient(name: string): Promise<McpClient | undefined>;
  
  // Internal methods for MCP server access
  getAgentMcpServers(): Record<string, McpServerConfig> | null;

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

  // Config persistence
  save(): Promise<void>;
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
  autonomous: z.boolean().default(false).optional(),
  skills: z.array(AgentSkillSchema).optional(),
  tools: z.array(AgentToolSchema).optional(),
  created: z.string(),
  lastAccessed: z.string(),
});

// Type inferred from schema
export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;

/**
 * AgentSettings schema - single source of truth.
 * Numeric settings are stored as numbers. Integer settings use .int() validation.
 * String settings (like theme) remain strings.
 */
export const AgentSettingsSchema = z.object({
  maxChatTurns: z.number().int().default(20).optional(),
  maxOutputTokens: z.number().int().default(1000).optional(),
  temperature: z.number().default(0.5).optional(), // Float (0.0-1.0)
  topP: z.number().default(0.5).optional(), // Float (0.0-1.0)
  theme: z.string().default('light').optional(),
  systemPath: z.string().optional(),
  model: z.string().optional(), // Changed from mostRecentModel
  contextTopK: z.number().int().default(20).optional(),
  contextTopN: z.number().int().default(5).optional(),
  contextIncludeScore: z.number().default(0.7).optional(), // Float (0.0-1.0)
  toolPermission: SessionToolPermissionSchema.default('tool').optional(),
});

// Type inferred from schema
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

// Default values are defined in AgentSettingsSchema - extract them from the schema
// This ensures the schema is the single source of truth
export const getDefaultSettings = (): AgentSettings => AgentSettingsSchema.parse({});


/**
 * AgentConfig schema - single source of truth.
 * All content (prompt, rules, references) is embedded in the YAML file.
 */
export const AgentConfigSchema = z.object({
  metadata: AgentMetadataSchema,
  settings: AgentSettingsSchema,
  systemPrompt: z.string().default(''), // Embedded system prompt (previously prompt.md)
  rules: z.array(RuleSchema).default([]), // Embedded rules array (previously rules/*.mdt)
  references: z.array(ReferenceSchema).default([]), // Embedded references array (previously refs/*.mdt)
  providers: z.record(z.string(), ProviderConfigSchema).optional(),
  mcpServers: z.record(z.string(), McpServerConfigSchema).optional(),
  supervisors: z.array(SupervisorConfigSchema).optional(),
});

// Type inferred from schema
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

function getProviderByName(name: string): ProviderId | undefined {
  // Cast to ProviderId since we're inside agent-api
  // Validation will occur when the provider is actually used
  if (!name) return undefined;
  return name.toLowerCase() as ProviderId;
}

/**
 * Parse a model string in format "provider:modelId" into provider and model ID
 */
export function parseModelString(modelString: string | undefined): { provider: ProviderId, modelId: string } | null {
  if (!modelString) return null;
  const colonIndex = modelString.indexOf(':');
  if (colonIndex === -1) return null;
  const providerId = modelString.substring(0, colonIndex);
  const modelId = modelString.substring(colonIndex + 1);
  const provider = getProviderByName(providerId);
  if (!provider) return null;
  return { provider, modelId };
}

/**
 * Format provider and model ID into "provider:modelId" string
 */
export function formatModelString(provider: ProviderId, modelId: string): string {
  return `${provider}:${modelId}`;
}

export function populateModelFromSettings(agent: Agent, chatSessionOptions: ChatSessionOptions): void {
  if (chatSessionOptions.modelProvider && chatSessionOptions.modelId) {
    return;
  }

  const settings = agent.getSettings();
  const model = settings.model; // Changed from mostRecentModel
  const parsed = parseModelString(model);
  if (parsed && agent.isProviderInstalled(parsed.provider)) {
    chatSessionOptions.modelProvider = parsed.provider;
    chatSessionOptions.modelId = parsed.modelId;
  }
}