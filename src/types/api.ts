import { Rule } from './Rule';
import { Reference } from './Reference';
import { McpConfigFileServerConfig } from '../commands/tools';
import { McpConfig } from '../mcp/types';

export interface API {
  _sendMessage: (tabId: string, message: string) => Promise<string>;
  _switchModel: (tabId: string, modelType: string) => Promise<{ success: boolean; error?: string }>;
  _getCurrentModel: (tabId: string) => Promise<string>;
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