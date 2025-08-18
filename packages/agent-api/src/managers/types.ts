import { Rule } from '../types/rules';
import { Reference } from '../types/references';
import { ProviderType, ProviderInfo, Provider, ProviderModel } from '../providers/types';
import { McpConfig } from '../mcp/types';
import { ChatSession, ChatMessage, ChatSessionOptions } from '../types/chat';

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
}

export interface McpServerManager {
  getAllMcpServers(): Promise<Record<string, McpConfig>>;
  getMcpServer(serverName: string): McpConfig | null;
  saveMcpServer(server: McpConfig): Promise<void>;
  deleteMcpServer(serverName: string): Promise<boolean>;
}