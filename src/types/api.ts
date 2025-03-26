import { Rule } from './Rule';
import { Reference } from './Reference';
import { McpConfig, McpConfigFileServerConfig } from '../mcp/types';

export interface API {
  sendMessage: (tabId: string, message: string) => Promise<string>;
  switchModel: (tabId: string, modelType: string) => Promise<{ success: boolean; error?: string }>;
  getCurrentModel: (tabId: string) => Promise<string>;
  getServerConfigs: () => Promise<McpConfig[]>;
  getMCPClient: (serverName: string) => Promise<{
    serverVersion: string;
    serverTools: any[];
  }>;
  toggleDevTools: () => Promise<boolean>;
  getSystemPrompt: () => Promise<string>;
  saveSystemPrompt: (prompt: string) => Promise<void>;
  showChatMenu: (hasSelection: boolean, x: number, y: number) => Promise<void>;
  openExternal: (url: string) => Promise<boolean>;
  getRules: () => Promise<Rule[]>;
  saveRule: (rule: Rule) => Promise<void>;
  deleteRule: (name: string) => Promise<void>;
  saveServerConfig: (server: McpConfigFileServerConfig & { name: string }) => Promise<void>;
  deleteServerConfig: (name: string) => Promise<void>;
  getReferences: () => Promise<Reference[]>;
  saveReference: (reference: Reference) => Promise<void>;
  deleteReference: (name: string) => Promise<void>;
} 