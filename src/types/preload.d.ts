import { LLMType } from '../llm/types';
import { ServerConfig } from '../mcp/types';
import { MCPClient } from '../mcp/client';

export interface API {
  _sendMessage: (tabId: string, message: string) => Promise<string>;
  _switchModel: (tabId: string, model: string) => Promise<boolean>;
  _getCurrentModel: (tabId: string) => Promise<LLMType>;
  getServerConfigs: () => Promise<ServerConfig[]>;
  getMCPClient: (serverName: string) => Promise<MCPClient>;
  toggleDevTools: () => Promise<boolean>;
  getSystemPrompt: () => Promise<string>;
  saveSystemPrompt: (prompt: string) => Promise<void>;
  showChatMenu: (hasSelection: boolean, x: number, y: number) => Promise<void>;
}

declare global {
  interface Window {
    api: API;
  }
} 