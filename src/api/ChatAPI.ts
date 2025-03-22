import { LLMType } from '../llm/types';

export class ChatAPI {
  private currentModel: LLMType = LLMType.Test;

  constructor(private tabId: string) {
    this.initCurrentModel();
  }

  private async initCurrentModel() {
    this.currentModel = await window.api._getCurrentModel(this.tabId);
  }

  async sendMessage(message: string): Promise<string> {
    return window.api._sendMessage(this.tabId, message);
  }

  async switchModel(modelType: LLMType): Promise<boolean> {
    const success = await window.api._switchModel(this.tabId, modelType);
    if (success) {
      this.currentModel = modelType;
    }
    return success;
  }

  getCurrentModel(): LLMType {
    return this.currentModel;
  }
} 