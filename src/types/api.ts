import { Rule } from './Rule';
import { Reference } from './Reference';
import { McpConfig, McpConfigFileServerConfig, CallToolResultWithElapsedTime } from '../mcp/types';
import { ChatSessionResponse, ChatState, MessageUpdate } from './ChatSession';
import { WorkspaceWindow } from './workspace';

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
    serverVersion: { name: string; version: string } | null;
    serverTools: any[];
    errorLog: string[];
  }>;
  callTool: (serverName: string, toolName: string, args: Record<string, unknown>) => Promise<CallToolResultWithElapsedTime>;
  toggleDevTools: () => Promise<boolean>;
  getSystemPrompt: () => Promise<string>;
  saveSystemPrompt: (prompt: string) => Promise<void>;
  showChatMenu: (hasSelection: boolean, x: number, y: number) => Promise<void>;
  openExternal: (url: string) => Promise<boolean>;
  getRules: () => Promise<Rule[]>;
  saveRule: (rule: Rule) => Promise<void>;
  deleteRule: (name: string) => Promise<void>;
  saveServerConfig: (server: McpConfig) => Promise<void>;
  deleteServerConfig: (name: string) => Promise<void>;
  getReferences: () => Promise<Reference[]>;
  saveReference: (reference: Reference) => Promise<void>;
  deleteReference: (name: string) => Promise<boolean>;
  pingServer: (name: string) => Promise<{ elapsedTimeMs: number }>;
  
  // Event listeners
  onRulesChanged: (callback: () => void) => () => void;
  offRulesChanged: (listener: () => void) => void;
  onReferencesChanged: (callback: () => void) => () => void;
  offReferencesChanged: (listener: () => void) => void;
  onConfigurationChanged: (callback: () => void) => () => void;
  offConfigurationChanged: (listener: () => void) => void;

  // Workspace methods
  showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>;
  getActiveWindows: () => Promise<WorkspaceWindow[]>;
  getRecentWorkspaces: () => Promise<string[]>;
  openWorkspace: (path: string) => Promise<void>;
  openInNewWindow: (path: string) => Promise<void>;
  createWorkspace: (path: string) => Promise<void>;
  switchWorkspace: (windowId: string, workspacePath: string) => Promise<boolean>;
  focusWindow: (windowId: string) => Promise<boolean>;
  getCurrentWindowId: () => Promise<string>;
  onWorkspaceSwitched: (callback: (data: { windowId: string, workspacePath: string, targetWindowId: string }) => void) => (event: any, data: any) => void;
  offWorkspaceSwitched: (listener: (event: any, data: any) => void) => void;
}