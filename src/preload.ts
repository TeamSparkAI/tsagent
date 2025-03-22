import { contextBridge, ipcRenderer } from 'electron';

const api = {
  _sendMessage: (tabId: string, message: string) => ipcRenderer.invoke('send-message', tabId, message),
  _switchModel: (tabId: string, model: string) => ipcRenderer.invoke('switch-model', tabId, model),
  _getCurrentModel: (tabId: string) => ipcRenderer.invoke('get-current-model', tabId),
  toggleDevTools: () => ipcRenderer.invoke('toggle-dev-tools')
};

contextBridge.exposeInMainWorld('api', api); 