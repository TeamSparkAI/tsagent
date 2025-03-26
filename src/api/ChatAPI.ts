import { LLMType } from '../llm/types';
import { ChatMessage } from '../types/ChatMessage';
import log from 'electron-log';

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
    try {
      log.info('ChatAPI: Attempting to switch model to:', model);
      const result = await window.api._switchModel(this.tabId, model);
      log.info('ChatAPI: Received switch model result:', result);
      if (result.success) {
        this.currentModel = model;
        this.messages.push({ 
          type: 'system', 
          content: `Switched to ${model} model` 
        });
        return true;
      } else {
        log.info('ChatAPI: Model switch failed:', result.error);
        const errorMessage = result.error || 'Failed to switch model';
        log.info('ChatAPI: Adding error message to chat:', errorMessage);
        this.messages.push({ 
          type: 'error', 
          content: errorMessage
        });
        return false;
      }
    } catch (error) {
      log.error('ChatAPI: Error in switchModel:', error);
      this.messages.push({ 
        type: 'error', 
        content: error instanceof Error ? error.message : 'Failed to switch model' 
      });
      return false;
    }
  }

  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  getCurrentModel(): LLMType {
    return this.currentModel;
  }
} 