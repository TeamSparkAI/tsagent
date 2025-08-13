import { Rule } from '../types/rules';
import { Reference } from '../types/references';
import { ProviderType, ProviderInfo, Provider, ProviderModel } from '../providers/types';
import { McpConfig } from '../mcp/types';
import { ChatSession, ChatMessage } from '../types/chat';

// Manager interfaces
export interface RulesManager {
  getAll(): Rule[];
  get(name: string): Rule | null;
  save(rule: Rule): void;
  delete(name: string): boolean;
}

export interface ReferencesManager {
  getAll(): Reference[];
  get(name: string): Reference | null;
  save(reference: Reference): void;
  delete(name: string): boolean;
}

export interface ProvidersManager {
  isInstalled(provider: string): boolean;
  add(provider: string): Promise<void>;
  remove(provider: string): Promise<void>;
  getAll(): string[];
  getSetting(provider: string, key: string): string | null;
  setSetting(provider: string, key: string, value: string): Promise<void>;
  
  // Provider factory methods
  getProvidersInfo(): Partial<Record<ProviderType, ProviderInfo>>;
  getProviderTypeByName(name: string): ProviderType | null;
  validateProviderConfiguration(provider: string): Promise<{ isValid: boolean, error?: string }>;
  createProvider(provider: string, modelId?: string): Provider;
  getModels(provider: string): Promise<ProviderModel[]>;
}

export interface McpServerManager {
  getAll(): Promise<Record<string, McpConfig>>;
  save(server: McpConfig): Promise<void>;
  delete(serverName: string): Promise<boolean>;
  get(serverName: string): McpConfig | null;
}

export interface ChatSessionManager {
  getAll(): ChatSession[];
  get(sessionId: string): ChatSession | null;
  save(session: ChatSession): Promise<void>;
  delete(sessionId: string): Promise<boolean>;
  create(name: string, settings?: Record<string, any>): ChatSession;
}
