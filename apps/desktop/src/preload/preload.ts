import { contextBridge, ipcRenderer } from 'electron';
import { API } from '../shared/api';
import log from 'electron-log';
import { ProviderType as LLMType } from '@tsagent/core';
import { OpenDialogOptions, MessageBoxOptions } from 'electron';
import { ChatMessage } from '@tsagent/core';

const api: API = {
  // Rules management
  getRules: () => ipcRenderer.invoke('rules:get-rules'),
  saveRule: (rule) => ipcRenderer.invoke('rules:save-rule', rule),
  deleteRule: (name: string) => ipcRenderer.invoke('rules:delete-rule', name),
  // Event listeners - return wrapped callbacks for proper cleanup
  onRulesChanged: (callback: () => void) => {
    const wrappedCallback = () => callback();
    ipcRenderer.on('rules-changed', wrappedCallback);
    return wrappedCallback;
  },
  offRulesChanged: (listener: () => void) => {
    ipcRenderer.removeListener('rules-changed', listener);
  },

  // App details
  getAppDetails: () => ipcRenderer.invoke('get-app-details'),

  // References management
  getReferences: () => ipcRenderer.invoke('references:get-references'),
  saveReference: (reference) => ipcRenderer.invoke('references:save-reference', reference),
  deleteReference: (name: string) => ipcRenderer.invoke('references:delete-reference', name),
  // Event listeners - return wrapped callbacks for proper cleanup
  onReferencesChanged: (callback: () => void) => {
    const wrappedCallback = () => callback();
    ipcRenderer.on('references-changed', wrappedCallback);
    return wrappedCallback;
  },
  offReferencesChanged: (listener: () => void) => {
    ipcRenderer.removeListener('references-changed', listener);
  },

  // Chat session management
  createChatTab: (tabId: string, modelProvider?: LLMType, modelId?: string) => ipcRenderer.invoke('chat:create-tab', tabId, modelProvider, modelId),
  closeChatTab: (tabId: string) => ipcRenderer.invoke('chat:close-tab', tabId),
  getChatState: (tabId: string) => ipcRenderer.invoke('chat:get-state', tabId),
  sendMessage: (tabId: string, message: string | ChatMessage) => ipcRenderer.invoke('chat:send-message', tabId, message),
  clearModel: (tabId: string) => ipcRenderer.invoke('chat:clear-model', tabId),
  switchModel: (tabId: string, modelType: string, modelId?: string) => ipcRenderer.invoke('chat:switch-model', tabId, modelType, modelId),
  updateChatSettings: (tabId: string, settings: {
    maxChatTurns: number;
    maxOutputTokens: number;
    temperature: number;
    topP: number;
  }) => ipcRenderer.invoke('chat:update-settings', tabId, settings),
  
  // Chat context management
  addChatReference: (tabId: string, referenceName: string) => ipcRenderer.invoke('chat:add-reference', tabId, referenceName),
  removeChatReference: (tabId: string, referenceName: string) => ipcRenderer.invoke('chat:remove-reference', tabId, referenceName),
  addChatRule: (tabId: string, ruleName: string) => ipcRenderer.invoke('chat:add-rule', tabId, ruleName),
  removeChatRule: (tabId: string, ruleName: string) => ipcRenderer.invoke('chat:remove-rule', tabId, ruleName),
  addChatTool: (tabId: string, serverName: string, toolName: string) => ipcRenderer.invoke('chat:add-tool', tabId, serverName, toolName),
  removeChatTool: (tabId: string, serverName: string, toolName: string) => ipcRenderer.invoke('chat:remove-tool', tabId, serverName, toolName),
  
  // Settings API
  getSettingsValue: (key: string) => ipcRenderer.invoke('get-settings-value', key),
  setSettingsValue: (key: string, value: string) => ipcRenderer.invoke('set-settings-value', key, value),
  getSystemPrompt: () => ipcRenderer.invoke('get-system-prompt'),
  saveSystemPrompt: (prompt: string) => ipcRenderer.invoke('save-system-prompt', prompt),
  getAgentMetadata: () => ipcRenderer.invoke('get-agent-metadata'),
  updateAgentMetadata: (metadata: Partial<{ name: string; description?: string; version?: string; iconUrl?: string; documentationUrl?: string; provider?: { organization: string; url: string }; skills?: any[] }>) => ipcRenderer.invoke('update-agent-metadata', metadata),
  getAgentMetadataByPath: (agentPath: string) => ipcRenderer.invoke('get-agent-metadata-by-path', agentPath),
  
  // Other existing methods
  getServerConfigs: () => ipcRenderer.invoke('get-server-configs'),
  getMCPClient: (serverName: string) => ipcRenderer.invoke('get-mcp-client', serverName),
  callTool: (serverName: string, toolName: string, args: Record<string, unknown>) => 
    ipcRenderer.invoke('call-tool', serverName, toolName, args),
  toggleDevTools: () => ipcRenderer.invoke('toggle-dev-tools'),
  showChatMenu: (hasSelection: boolean, x: number, y: number) => ipcRenderer.invoke('show-chat-menu', hasSelection, x, y),
  showEditControlMenu: (editFlags) => ipcRenderer.invoke('show-edit-control-menu', editFlags),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  saveServerConfig: (server) => ipcRenderer.invoke('saveServerConfig', server),
  deleteServerConfig: (name: string) => ipcRenderer.invoke('deleteServerConfig', name),
  pingServer: (name: string) => ipcRenderer.invoke('ping-server', name),

  // Agent handlers
  showOpenDialog: (options: OpenDialogOptions) => ipcRenderer.invoke('dialog:showOpenDialog', options),
  showMessageBox: (options: MessageBoxOptions) => ipcRenderer.invoke('dialog:showMessageBox', options),
  getActiveWindows: () => ipcRenderer.invoke('agent:getActiveWindows'),
  getRecentAgents: () => ipcRenderer.invoke('agent:getRecentAgents'),
  getCurrentWindowId: () => ipcRenderer.invoke('agent:getCurrentWindowId'),
  openAgent: (path: string) => ipcRenderer.invoke('agent:openAgent', path),
  openInNewWindow: (path: string) => ipcRenderer.invoke('agent:openInNewWindow', path),
  createAgent: (windowId: string, path: string) => ipcRenderer.invoke('agent:createAgent', windowId, path),
  createAgentInNewWindow: (path: string) => ipcRenderer.invoke('agent:createAgentInNewWindow', path),
  switchAgent: (windowId: string, agentPath: string) => ipcRenderer.invoke('agent:switchAgent', windowId, agentPath),
  focusWindow: (windowId: string) => ipcRenderer.invoke('agent:focusWindow', windowId),
  cloneAgent: (sourcePath: string, targetPath: string) => ipcRenderer.invoke('agent:cloneAgent', sourcePath, targetPath),
  agentExists: (path: string) => ipcRenderer.invoke('agent:agentExists', path),
  onAgentSwitched: (callback: (data: { windowId: string, agentPath: string, targetWindowId: string }) => void) => {
    const wrappedCallback = (_event: any, data: any) => callback(data);
    ipcRenderer.on('agent:switched', wrappedCallback);
    return wrappedCallback;
  },
  offAgentSwitched: (listener: (event: any, data: any) => void) => {
    ipcRenderer.removeListener('agent:switched', listener);
  },
  onServerConfigChanged: (callback: (data: { action: string, serverName: string }) => void) => {
    const wrappedCallback = (_event: any, data: any) => callback(data);
    ipcRenderer.on('server-config-changed', wrappedCallback);
    return wrappedCallback;
  },
  offServerConfigChanged: (listener: (event: any, data: any) => void) => {
    ipcRenderer.removeListener('server-config-changed', listener);
  },

  // LLM Providers (new methods for model picker)
  getProviderInfo: (provider: LLMType) => ipcRenderer.invoke('llm:get-provider-info', provider),
  validateProviderConfig: (provider: LLMType, config: Record<string, string>) => ipcRenderer.invoke('llm:validate-provider-config', provider, config),
  getModelsForProvider: (provider: LLMType) => ipcRenderer.invoke('llm:getModels', provider),
  getInstalledProviders: () => ipcRenderer.invoke('llm:get-installed-providers'),
  getAvailableProviders: () => ipcRenderer.invoke('llm:get-available-providers'),
  addProvider: (provider: LLMType, config: Record<string, string>) => ipcRenderer.invoke('llm:add-provider', provider, config),
  removeProvider: (provider: LLMType) => ipcRenderer.invoke('llm:remove-provider', provider),
  getProviderConfig: (provider: LLMType, key: string) => ipcRenderer.invoke('llm:get-provider-config', provider, key),
  setProviderConfig: (provider: LLMType, key: string, value: string) => ipcRenderer.invoke('llm:set-provider-config', provider, key, value),
  onProvidersChanged: (callback: () => void) => {
    const wrappedCallback = () => callback();
    ipcRenderer.on('providers-changed', wrappedCallback);
    return wrappedCallback;
  },
  offProvidersChanged: (listener: () => void) => {
    ipcRenderer.removeListener('providers-changed', listener);
  },
};

/*
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
*/

// Expose the API to the renderer process
try {
  contextBridge.exposeInMainWorld('api', api);
} catch (error) {
  // Log more details about the error
  if (error instanceof Error) {
    log.error('[PRELOAD] Error:', error);
  }
}
