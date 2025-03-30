import { contextBridge, ipcRenderer } from 'electron';
import { API } from './types/api';

const api: API = {
  // Chat session management
  createChatTab: (tabId: string) => ipcRenderer.invoke('create-chat-tab', tabId),
  closeChatTab: (tabId: string) => ipcRenderer.invoke('close-chat-tab', tabId),
  getChatState: (tabId: string) => ipcRenderer.invoke('get-chat-state', tabId),
  sendMessage: (tabId: string, message: string) => ipcRenderer.invoke('send-message', tabId, message),
  switchModel: (tabId: string, model: string) => ipcRenderer.invoke('switch-model', tabId, model),

  // Other existing methods
  getServerConfigs: () => ipcRenderer.invoke('get-server-configs'),
  getMCPClient: (serverName: string) => ipcRenderer.invoke('get-mcp-client', serverName),
  callTool: (serverName: string, toolName: string, args: Record<string, unknown>) => 
    ipcRenderer.invoke('call-tool', serverName, toolName, args),
  toggleDevTools: () => ipcRenderer.invoke('toggle-dev-tools'),
  getSystemPrompt: () => ipcRenderer.invoke('get-system-prompt'),
  saveSystemPrompt: (prompt: string) => ipcRenderer.invoke('save-system-prompt', prompt),
  showChatMenu: (hasSelection: boolean, x: number, y: number) => ipcRenderer.invoke('show-chat-menu', hasSelection, x, y),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getRules: () => ipcRenderer.invoke('get-rules'),
  saveRule: (rule) => ipcRenderer.invoke('save-rule', rule),
  deleteRule: (name: string) => ipcRenderer.invoke('delete-rule', name),
  saveServerConfig: (server) => ipcRenderer.invoke('saveServerConfig', server),
  deleteServerConfig: (name: string) => ipcRenderer.invoke('deleteServerConfig', name),
  getReferences: () => ipcRenderer.invoke('get-references'),
  saveReference: (reference) => ipcRenderer.invoke('save-reference', reference),
  deleteReference: (name: string) => ipcRenderer.invoke('delete-reference', name)
};

contextBridge.exposeInMainWorld('api', api);

// Ensure TypeScript recognizes the window.api type
declare global {
  interface Window {
    api: API;
  }
}