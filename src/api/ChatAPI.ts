import { LLMType } from '../llm/types';
import { RendererChatMessage } from '../types/ChatMessage';
import { ChatMessage } from '../types/ChatSession';
import { LlmReply } from '../types/LlmReply';
import log from 'electron-log';

export class ChatAPI {
  private tabId: string;
  private currentModel: LLMType;
  private messages: (RendererChatMessage & { llmReply?: LlmReply })[] = [];

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

  private convertMessageToChatMessage(message: ChatMessage): RendererChatMessage & { llmReply?: LlmReply } {
    return {
      type: message.role === 'assistant' ? 'ai' : message.role,
      content: message.role === 'assistant' ? '' : message.content,
      llmReply: message.role === 'assistant' ? message.llmReply : undefined
    };
  }

  public async sendMessage(message: string): Promise<string> {
    try {
      const result = await window.api.sendMessage(this.tabId, message);
      // Update messages with the new updates
      this.messages.push(...result.updates.map(this.convertMessageToChatMessage));
      // Return the last turn's message if available
      const lastAssistantMessage = result.updates[1];
      if (lastAssistantMessage.role === 'assistant') {
        const lastTurn = lastAssistantMessage.llmReply.turns[lastAssistantMessage.llmReply.turns.length - 1];
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
} 