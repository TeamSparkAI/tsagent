import { LLMType } from '../llm/types';

export interface API {
  _sendMessage: (tabId: string, message: string) => Promise<string>;
  _switchModel: (tabId: string, modelType: LLMType) => Promise<boolean>;
  _getCurrentModel: (tabId: string) => Promise<LLMType>;
  toggleDevTools: () => Promise<boolean>;
}

declare global {
  interface Window {
    api: API;
  }
} 