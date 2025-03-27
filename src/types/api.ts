import { Rule } from './Rule';
import { Reference } from './Reference';
import { McpConfig, McpConfigFileServerConfig } from '../mcp/types';
import { ChatSessionResponse, ChatState, MessageUpdate } from './ChatSession';

export interface API {
  // Chat session management
  createChatTab: (tabId: string) => Promise<ChatSessionResponse>;
  closeChatTab: (tabId: string) => Promise<ChatSessionResponse>;
  getChatState: (tabId: string) => Promise<ChatState>;
  sendMessage: (tabId: string, message: string) => Promise<MessageUpdate>;
  switchModel: (tabId: string, modelType: string) => Promise<ChatSessionResponse>;

  // Other existing methods
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