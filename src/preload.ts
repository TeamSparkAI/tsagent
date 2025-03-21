const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  sendMessage: (message: string) => ipcRenderer.invoke('send-message', message),
  switchModel: (modelType: string) => ipcRenderer.invoke('switch-model', modelType),
  toggleDevTools: () => ipcRenderer.invoke('toggle-dev-tools')
}); 