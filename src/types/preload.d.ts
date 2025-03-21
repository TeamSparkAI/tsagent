export interface API {
  sendMessage: (message: string) => Promise<string>;
  switchModel: (modelType: string) => Promise<boolean>;
}

declare global {
  interface Window {
    api: API;
  }
} 