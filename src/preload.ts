import { contextBridge, ipcRenderer } from 'electron';

const api = {
  _sendMessage: (tabId: string, message: string) => ipcRenderer.invoke('send-message', tabId, message),
  _switchModel: (tabId: string, model: string) => ipcRenderer.invoke('switch-model', tabId, model),
  _getCurrentModel: (tabId: string) => ipcRenderer.invoke('get-current-model', tabId),
  getServerConfigs: () => ipcRenderer.invoke('get-server-configs'),
  getMCPClient: (serverName: string) => ipcRenderer.invoke('get-mcp-client', serverName),
  toggleDevTools: () => ipcRenderer.invoke('toggle-dev-tools')
};

contextBridge.exposeInMainWorld('api', api); 