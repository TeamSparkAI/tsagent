import { Rule } from './Rule';
import { MCPConfigServer } from '../commands/tools';

export interface API {
  _sendMessage: (tabId: string, message: string) => Promise<string>;
  _switchModel: (tabId: string, modelType: string) => Promise<boolean>;
  _getCurrentModel: (tabId: string) => Promise<string>;
  getServerConfigs: () => Promise<MCPConfigServer[]>;
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
  saveServerConfig: (server: ServerConfig & { name: string }) => Promise<void>;
  deleteServerConfig: (name: string) => Promise<void>;
}

declare global {
  interface Window {
    api: API;
  }
} 