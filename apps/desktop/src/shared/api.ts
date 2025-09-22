import { Rule, Reference } from '@tsagent/core';
import { McpConfig, CallToolResultWithElapsedTime } from '@tsagent/core';
import { ChatSessionResponse, ChatState, MessageUpdate, ChatMessage } from '@tsagent/core';
import { AgentWindow } from '../main/agents-manager';
import { ProviderType } from '@tsagent/core';
import type { ProviderInfo as LLMProviderInfo, ProviderModel as ILLMModel } from '@tsagent/core';
import { OpenDialogOptions, MessageBoxOptions } from 'electron';

export interface API {
  // Chat session management
  createChatTab: (tabId: string, modelProvider?: ProviderType, modelId?: string) => Promise<ChatSessionResponse>;
  closeChatTab: (tabId: string) => Promise<ChatSessionResponse>;
  getChatState: (tabId: string) => Promise<ChatState | null>;
  sendMessage: (tabId: string, message: string | ChatMessage) => Promise<MessageUpdate>;
  clearModel: (tabId: string) => Promise<ChatSessionResponse>;
  switchModel: (tabId: string, modelType: string, modelId?: string) => Promise<ChatSessionResponse>;
  updateChatSettings: (tabId: string, settings: {
    maxChatTurns: number;
    maxOutputTokens: number;
    temperature: number;
    topP: number;
  }) => Promise<boolean>;

  // Chat context management
  addChatReference: (tabId: string, referenceName: string) => Promise<boolean>;
  removeChatReference: (tabId: string, referenceName: string) => Promise<boolean>;
  addChatRule: (tabId: string, ruleName: string) => Promise<boolean>;
  removeChatRule: (tabId: string, ruleName: string) => Promise<boolean>;

  // LLM Provider methods for model picker
  getProviderInfo: (provider: ProviderType) => Promise<LLMProviderInfo>;
  validateProviderConfig: (provider: ProviderType, config: Record<string, string>) => Promise<{ isValid: boolean, error?: string }>;
  getModelsForProvider: (provider: ProviderType) => Promise<ILLMModel[]>;
  getInstalledProviders: () => Promise<ProviderType[]>;
  addProvider: (provider: ProviderType, config: Record<string, string>) => Promise<boolean>;
  removeProvider: (provider: ProviderType) => Promise<boolean>;
  getProviderConfig: (provider: ProviderType, key: string) => Promise<string | null>;
  setProviderConfig: (provider: ProviderType, key: string, value: string) => Promise<boolean>;

  // Settings API
  getSettingsValue: (key: string) => Promise<string | null>;
  setSettingsValue: (key: string, value: string) => Promise<boolean>;

  // Other existing methods
  getServerConfigs: () => Promise<McpConfig[]>;
  getMCPClient: (serverName: string) => Promise<{
    serverVersion: { name: string; version: string } | null;
    serverTools: any[];
    errorLog: string[];
  }>;
  callTool: (serverName: string, toolName: string, args: Record<string, unknown>) => Promise<CallToolResultWithElapsedTime>;
  toggleDevTools: () => Promise<boolean>;
  getSystemPrompt: () => Promise<string>;
  saveSystemPrompt: (prompt: string) => Promise<void>;
  getAgentMetadata: () => Promise<{ name: string; description?: string; version?: string; iconUrl?: string; documentationUrl?: string; provider?: { organization: string; url: string }; skills?: any[]; created: string; lastAccessed: string } | null>;
  updateAgentMetadata: (metadata: Partial<{ name: string; description?: string; version?: string; iconUrl?: string; documentationUrl?: string; provider?: { organization: string; url: string }; skills?: any[] }>) => Promise<{ success: boolean; error?: string }>;
  getAgentMetadataByPath: (agentPath: string) => Promise<{ name: string; description?: string; version?: string; iconUrl?: string; documentationUrl?: string; provider?: { organization: string; url: string }; skills?: any[]; created: string; lastAccessed: string } | null>;
  showChatMenu: (hasSelection: boolean, x: number, y: number) => Promise<void>;
  showEditControlMenu: (editFlags: { 
    canUndo: boolean;
    canRedo: boolean; 
    canCut: boolean; 
    canCopy: boolean; 
    canPaste: boolean; 
    canSelectAll: boolean;
    x: number;
    y: number;
  }) => Promise<void>;
  openExternal: (url: string) => Promise<boolean>;
  getRules: () => Promise<Rule[]>;
  saveRule: (rule: Rule) => Promise<void>;
  deleteRule: (name: string) => Promise<void>;
  saveServerConfig: (server: McpConfig) => Promise<void>;
  deleteServerConfig: (serverName: string) => Promise<void>;
  getReferences: () => Promise<Reference[]>;
  saveReference: (reference: Reference) => Promise<void>;
  deleteReference: (name: string) => Promise<boolean>;
  pingServer: (name: string) => Promise<{ elapsedTimeMs: number }>;
  
  // Event listeners
  onRulesChanged: (callback: () => void) => () => void;
  offRulesChanged: (listener: () => void) => void;
  onReferencesChanged: (callback: () => void) => () => void;
  offReferencesChanged: (listener: () => void) => void;
  onProvidersChanged: (callback: () => void) => () => void;
  offProvidersChanged: (listener: () => void) => void;

  // Agentmethods
  showOpenDialog: (options: OpenDialogOptions) => Promise<{ canceled: boolean; filePaths: string[] }>;
  showMessageBox: (options: MessageBoxOptions) => Promise<{ response: number }>;
  getActiveWindows: () => Promise<AgentWindow[]>;
  getRecentAgents: () => Promise<string[]>;
  openAgent: (path: string) => Promise<void>;
  openInNewWindow: (path: string) => Promise<void>;
  createAgent: (windowId: string, path: string) => Promise<void>;
  createAgentInNewWindow: (path: string) => Promise<void>;
  switchAgent: (windowId: string, agentPath: string) => Promise<boolean>;
  focusWindow: (windowId: string) => Promise<boolean>;
  getCurrentWindowId: () => Promise<string>;
  cloneAgent: (sourcePath: string, targetPath: string) => Promise<{ success: boolean; error?: string; windowId?: string }>;
  agentExists: (path: string) => Promise<boolean>;
  onAgentSwitched: (callback: (data: { windowId: string, agentPath: string, targetWindowId: string }) => void) => (event: any, data: any) => void;
  offAgentSwitched: (listener: (event: any, data: any) => void) => void;
  onServerConfigChanged: (callback: (data: { action: string, serverName: string }) => void) => (event: any, data: any) => void;
  offServerConfigChanged: (listener: (event: any, data: any) => void) => void;

  // App details
  getAppDetails: () => Promise<{ isPackaged: boolean }>;
}