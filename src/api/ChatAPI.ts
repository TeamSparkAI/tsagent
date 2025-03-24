import { LLMType } from '../llm/types';

export class ChatAPI {
  private tabId: string;
  private currentModel: LLMType;

  constructor(tabId: string) {
    this.tabId = tabId;
    this.currentModel = LLMType.Test; // Set default model
    this.initModel();
  }

  private async initModel() {
    const model = await window.api._getCurrentModel(this.tabId);
    this.currentModel = model as LLMType; // Cast the string to LLMType
  }

  public async sendMessage(message: string): Promise<string> {
    return window.api._sendMessage(this.tabId, message);
  }

  public async switchModel(model: LLMType): Promise<boolean> {
    const success = await window.api._switchModel(this.tabId, model);
    if (success) {
      this.currentModel = model;
    }
    return success;
  }

  getCurrentModel(): LLMType {
    return this.currentModel;
  }
} 