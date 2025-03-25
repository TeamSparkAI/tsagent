import { contextBridge, ipcRenderer } from 'electron';
import { Rule } from './types/Rule';
import { Reference } from './types/Reference';

// Define the API interface here to ensure TypeScript recognizes it
interface API {
  _sendMessage: (tabId: string, message: string) => Promise<string>;
  _switchModel: (tabId: string, modelType: string) => Promise<boolean>;
  _getCurrentModel: (tabId: string) => Promise<string>;
  getServerConfigs: () => Promise<any[]>;
  getMCPClient: (serverName: string) => Promise<any>;
  toggleDevTools: () => Promise<boolean>;
  getSystemPrompt: () => Promise<string>;
  saveSystemPrompt: (prompt: string) => Promise<void>;
  showChatMenu: (hasSelection: boolean, x: number, y: number) => Promise<void>;
  openExternal: (url: string) => Promise<boolean>;
  getRules: () => Promise<Rule[]>;
  saveRule: (rule: Rule) => Promise<void>;
  deleteRule: (name: string) => Promise<void>;
  saveServerConfig: (server: any) => Promise<void>;
  deleteServerConfig: (name: string) => Promise<void>;
  getReferences: () => Promise<Reference[]>;
  saveReference: (reference: Reference) => Promise<void>;
  deleteReference: (name: string) => Promise<void>;
}

const api: API = {
  _sendMessage: (tabId: string, message: string) => ipcRenderer.invoke('send-message', tabId, message),
  _switchModel: (tabId: string, model: string) => ipcRenderer.invoke('switch-model', tabId, model),
  _getCurrentModel: (tabId: string) => ipcRenderer.invoke('get-current-model', tabId),
  getServerConfigs: () => ipcRenderer.invoke('get-server-configs'),
  getMCPClient: (serverName: string) => ipcRenderer.invoke('get-mcp-client', serverName),
  toggleDevTools: () => ipcRenderer.invoke('toggle-dev-tools'),
  getSystemPrompt: () => ipcRenderer.invoke('get-system-prompt'),
  saveSystemPrompt: (prompt: string) => ipcRenderer.invoke('save-system-prompt', prompt),
  showChatMenu: (hasSelection: boolean, x: number, y: number) => ipcRenderer.invoke('show-chat-menu', hasSelection, x, y),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getRules: () => ipcRenderer.invoke('get-rules'),
  saveRule: (rule: Rule) => ipcRenderer.invoke('save-rule', rule),
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