import { Rule } from '../types/rules.js';
import { Reference } from '../types/references.js';
import { ProviderId, ProviderInfo, Provider, ProviderModel } from '../providers/types.js';
import { McpServerEntry } from '../mcp/types.js';
import { ChatSession, ChatMessage, ChatSessionOptions } from '../types/chat.js';

// Manager interfaces

export interface ChatSessionManager {
  getAllChatSessions(): ChatSession[];
  getChatSession(sessionId: string): ChatSession | null;
  createChatSession(sessionId: string, options?: ChatSessionOptions): ChatSession;
  deleteChatSession(sessionId: string): Promise<boolean>;
}

export interface RulesManager {
  getAllRules(): Rule[];
  getRule(name: string): Rule | null;
  addRule(rule: Rule): void;
  deleteRule(name: string): boolean;
}

export interface ReferencesManager {
  getAllReferences(): Reference[];
  getReference(name: string): Reference | null;
  addReference(reference: Reference): void;
  deleteReference(name: string): boolean;
}

export interface ProvidersManager {
  // Provider installion/configuraiton methods
  getInstalledProviders(): ProviderId[];
  isProviderInstalled(provider: ProviderId): boolean;
  getInstalledProviderConfig(provider: ProviderId): Record<string, string> | null;
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
}

export interface McpServerManager {
  getAllMcpServers(): Promise<Record<string, McpServerEntry>>;
  getMcpServer(serverName: string): McpServerEntry | null;
  saveMcpServer(server: McpServerEntry): Promise<void>;
  deleteMcpServer(serverName: string): Promise<boolean>;
}