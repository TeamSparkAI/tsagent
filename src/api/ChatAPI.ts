import { LLMType } from '../llm/types';
import { RendererChatMessage } from '../types/ChatMessage';
import { ChatMessage } from '../types/ChatSession';
import { ModelReply } from '../types/ModelReply';
import log from 'electron-log';

export class ChatAPI {
  private tabId: string;
  private currentModel: LLMType;
  private messages: (RendererChatMessage & { modelReply?: ModelReply })[] = [];

  constructor(tabId: string) {
    this.tabId = tabId;
    this.currentModel = LLMType.Test; // Set default model
    this.initModel();
  }

  private async initModel() {
    const state = await window.api.getChatState(this.tabId);
    this.currentModel = state.currentModel;
    // Convert any existing messages from the session
    this.messages = state.messages.map(this.convertMessageToChatMessage);
  }

  private convertMessageToChatMessage(message: ChatMessage): RendererChatMessage & { modelReply?: ModelReply } {
    return {
      type: message.role === 'assistant' ? 'ai' : message.role,
      content: message.role === 'assistant' ? '' : message.content,
      modelReply: message.role === 'assistant' ? message.modelReply : undefined
    };
  }

  public async sendMessage(message: string): Promise<string> {
    try {
      const result = await window.api.sendMessage(this.tabId, message);
      // Update messages with the new updates
      this.messages.push(...result.updates.map(this.convertMessageToChatMessage));
      
      // Update the references and rules from the response
      // Note: This will trigger UI updates when getActiveReferences/Rules is called
      
      // Return the last turn's message if available
      const lastAssistantMessage = result.updates[1];
      if (lastAssistantMessage.role === 'assistant') {
        const lastTurn = lastAssistantMessage.modelReply.turns[lastAssistantMessage.modelReply.turns.length - 1];
        return lastTurn.message ?? '';
      }
      return '';
    } catch (error) {
      log.error('Error sending message:', error);
      throw error;
    }
  }

  public async switchModel(model: LLMType): Promise<boolean> {
    try {
      const result = await window.api.switchModel(this.tabId, model);
      if (result.success) {
        this.currentModel = model;
        // Update messages with the new updates
        this.messages.push(...result.updates.map(this.convertMessageToChatMessage));
        return true;
      } else {
        log.info('ChatAPI: Model switch failed:', result.error);
        return false;
      }
    } catch (error) {
      log.error('ChatAPI: Error in switchModel:', error);
      return false;
    }
  }

  public getMessages(): RendererChatMessage[] {
    return [...this.messages];
  }

  public getCurrentModel(): LLMType {
    return this.currentModel;
  }

  // Chat context management methods
  public async addReference(referenceName: string): Promise<boolean> {
    try {
      return await window.api.addChatReference(this.tabId, referenceName);
    } catch (error) {
      log.error(`Error adding reference '${referenceName}' to chat:`, error);
      return false;
    }
  }

  public async removeReference(referenceName: string): Promise<boolean> {
    try {
      return await window.api.removeChatReference(this.tabId, referenceName);
    } catch (error) {
      log.error(`Error removing reference '${referenceName}' from chat:`, error);
      return false;
    }
  }

  public async addRule(ruleName: string): Promise<boolean> {
    try {
      return await window.api.addChatRule(this.tabId, ruleName);
    } catch (error) {
      log.error(`Error adding rule '${ruleName}' to chat:`, error);
      return false;
    }
  }

  public async removeRule(ruleName: string): Promise<boolean> {
    try {
      return await window.api.removeChatRule(this.tabId, ruleName);
    } catch (error) {
      log.error(`Error removing rule '${ruleName}' from chat:`, error);
      return false;
    }
  }

  public async getActiveReferences(): Promise<string[]> {
    // This requires refreshing the state first to ensure we have the latest data
    // Return the references from the latest state
    try {
      const state = await window.api.getChatState(this.tabId);
      return state.references;
    } catch (error) {
      log.error('Error getting active references:', error);
      return [];
    }
  }

  public async getActiveRules(): Promise<string[]> {
    // This requires refreshing the state first to ensure we have the latest data
    // Return the rules from the latest state
    try {
      const state = await window.api.getChatState(this.tabId);
      return state.rules;
    } catch (error) {
      log.error('Error getting active rules:', error);
      return [];
    }
  }
} 