export interface API {
  _sendMessage: (tabId: string, message: string) => Promise<string>;
  _switchModel: (tabId: string, modelType: string) => Promise<boolean>;
  toggleDevTools: () => Promise<boolean>;
}

declare global {
  interface Window {
    api: API;
  }
} 