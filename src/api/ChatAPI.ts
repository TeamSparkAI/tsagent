import { LLMType } from '../llm/types';
import { ChatMessage } from '../types/ChatMessage';

export class ChatAPI {
  private tabId: string;
  private currentModel: LLMType;
  private messages: ChatMessage[] = [];

  constructor(tabId: string) {
    this.tabId = tabId;
    this.currentModel = LLMType.Test; // Set default model
    this.initModel();
    this.messages.push({ 
      type: 'system', 
      content: 'Welcome to TeamSpark AI Workbench!' 
    });
  }

  private async initModel() {
    const model = await window.api._getCurrentModel(this.tabId);
    this.currentModel = model as LLMType; // Cast the string to LLMType
  }

  public async sendMessage(message: string): Promise<string> {
    // Add user message to history
    this.messages.push({ type: 'user', content: message });

    try {
      const response = await window.api._sendMessage(this.tabId, message);
      // Trim any leading/trailing whitespace from the response
      const trimmedResponse = response.trimStart();
      this.messages.push({ type: 'ai', content: trimmedResponse });
      return trimmedResponse;
    } catch (error) {
      const errorMsg = 'Failed to get response';
      this.messages.push({ type: 'error', content: errorMsg });
      throw error;
    }
  }

  public async switchModel(model: LLMType): Promise<boolean> {
    const success = await window.api._switchModel(this.tabId, model);
    if (success) {
      this.currentModel = model;
      this.messages.push({ 
        type: 'system', 
        content: `Switched to ${model} model` 
      });
    } else {
      this.messages.push({ 
        type: 'error', 
        content: 'Failed to switch model' 
      });
    }
    return success;
  }

  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  getCurrentModel(): LLMType {
    return this.currentModel;
  }
} 