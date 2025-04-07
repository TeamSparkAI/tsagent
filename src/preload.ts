import { contextBridge, ipcRenderer } from 'electron';
import { API } from './types/api';
import log from 'electron-log';

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
  deleteReference: (name: string) => ipcRenderer.invoke('delete-reference', name),
  pingServer: (name: string) => ipcRenderer.invoke('ping-server', name),
  
  // Event listeners - return wrapped callbacks for proper cleanup
  onRulesChanged: (callback: () => void) => {
    const wrappedCallback = () => callback();
    ipcRenderer.on('rules-changed', wrappedCallback);
    return wrappedCallback;
  },
  offRulesChanged: (listener: () => void) => {
    ipcRenderer.removeListener('rules-changed', listener);
  },
  
  onReferencesChanged: (callback: () => void) => {
    const wrappedCallback = () => callback();
    ipcRenderer.on('references-changed', wrappedCallback);
    return wrappedCallback;
  },
  offReferencesChanged: (listener: () => void) => {
    ipcRenderer.removeListener('references-changed', listener);
  },
  
  onConfigurationChanged: (callback: () => void) => {
    const wrappedCallback = () => callback();
    ipcRenderer.on('configuration:changed', wrappedCallback);
    return wrappedCallback;
  },
  offConfigurationChanged: (listener: () => void) => {
    ipcRenderer.removeListener('configuration:changed', listener);
  },

  // Workspace handlers
  getActiveWindows: () => ipcRenderer.invoke('workspace:getActiveWindows'),
  getRecentWorkspaces: () => ipcRenderer.invoke('workspace:getRecentWorkspaces'),
  openWorkspace: (path: string) => ipcRenderer.invoke('workspace:open', path),
  openInNewWindow: (path: string) => ipcRenderer.invoke('workspace:openInNewWindow', path),
  createWorkspace: (path: string) => ipcRenderer.invoke('workspace:create', path),
  switchWorkspace: (windowId: string, workspacePath: string) => ipcRenderer.invoke('workspace:switchWorkspace', windowId, workspacePath),
  showOpenDialog: (options: any) => ipcRenderer.invoke('dialog:showOpenDialog', options),
  getCurrentWindowId: () => ipcRenderer.invoke('workspace:getCurrentWindowId'),
  onWorkspaceSwitched: (callback: (data: { windowId: string, workspacePath: string, targetWindowId: string }) => void) => {
    const wrappedCallback = (_: any, data: any) => callback(data);
    ipcRenderer.on('workspace:switched', wrappedCallback);
    return wrappedCallback; // Return the wrapped function for later removal
  },
  offWorkspaceSwitched: (listener: (event: any, data: any) => void) => {
    ipcRenderer.removeListener('workspace:switched', listener);
  }
};

// Log the API object to verify it's defined
log.info('[PRELOAD] API object defined:', Object.keys(api));

// Check if each method is a function
for (const key of Object.keys(api)) {
  const method = api[key as keyof API];
  log.info(`[PRELOAD] Method ${key} is a function:`, typeof method === 'function');
  if (typeof method === 'function') {
    log.info(`[PRELOAD] Method ${key} toString:`, method.toString().substring(0, 100) + '...');
  }
}

// Expose the API to the renderer process
try {
  contextBridge.exposeInMainWorld('api', api);
} catch (error) {
  // Log more details about the error
  if (error instanceof Error) {
    log.error('[PRELOAD] Error:', error);
  }
}
