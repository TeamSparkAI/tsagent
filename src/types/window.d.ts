export {};

declare global {
  interface Window {
    api: {
      sendMessage: (message: string) => Promise<string>;
      switchModel: (modelType: string) => Promise<boolean>;
    }
  }
} 