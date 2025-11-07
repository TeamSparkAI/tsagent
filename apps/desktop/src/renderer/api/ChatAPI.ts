import { ProviderType } from '@tsagent/core';
import type { ProviderModel as ILLMModel } from '@tsagent/core';
import { RendererChatMessage } from '../types/ChatMessage';
import { ChatMessage, MessageUpdate, ModelReply, SessionContextItem } from '@tsagent/core';
import log from 'electron-log';

export class ChatAPI {
  private tabId: string;
  private currentProvider?: ProviderType;
  private currentModelName?: string;
  private currentModelId?: string;
  private messages: (RendererChatMessage & { modelReply?: ModelReply })[] = [];
  private currentModelInfo: ILLMModel | null = null; // Cache just the current model info

  constructor(tabId: string) {
    this.tabId = tabId;
    this.initModel();
  }

  private async updateModelNameFromState(modelType: ProviderType, modelId?: string): Promise<void> {
    try {
      const models = await window.api.getModelsForProvider(modelType);
      const model = models.find(m => m.id === modelId);
      if (model) {
        this.currentModelName = model.name;
      } else {
        this.currentModelName = modelId || 'Unknown Model';
      }
    } catch (error) {
      log.error('Error updating model name from state:', error);
      this.currentModelName = modelId || 'Unknown Model';
    }
  }

  private async initModel() {
    try {
      const state = await window.api.getChatState(this.tabId);
      if (!state) {
        throw new Error(`[CHAT API] No chat state found for tab ${this.tabId}`);
      }
      
      // Update local state with session state from the server
      this.currentProvider = state.currentModelProvider as unknown as ProviderType;
      this.currentModelId = state.currentModelId;
      
      // Update the model name if we have a provider and model ID
      if (state.currentModelProvider && state.currentModelId) {
        await this.updateModelNameFromState(state.currentModelProvider as unknown as ProviderType, state.currentModelId);
      }
      
      log.info(`Initialized ChatAPI with model ${this.currentProvider}${this.currentModelId ? ` (${this.currentModelId})` : ''}, name: ${this.currentModelName}`);
      
      // Convert any existing messages from the session
      this.messages = state.messages.map(this.convertMessageToChatMessage);
    } catch (error) {
      log.error('Error initializing model in ChatAPI:', error);
      throw error;
    }
  }

  private convertMessageToChatMessage(message: ChatMessage): RendererChatMessage & { modelReply?: ModelReply } {
    if (message.role === 'approval') {
      return {
        type: 'approval',
        content: '',
        toolCallApprovals: message.toolCallApprovals.map(approval => ({
          ...approval,
          toolCallId: approval.toolCallId || 'unknown' // Ensure toolCallId is always present
        }))
      };
    }
    return {
      type: message.role === 'assistant' ? 'ai' : message.role,
      content: message.role === 'assistant' ? '' : message.content,
      modelReply: message.role === 'assistant' ? message.modelReply : undefined,
      requestContext: message.role === 'assistant' ? message.requestContext : undefined
    };
  }

  public async sendMessage(message: string | ChatMessage): Promise<MessageUpdate> {
    try {
      // Log the model we're using to send the message
      log.info(`Sending message using model ${this.currentProvider}${this.currentModelId ? ` (${this.currentModelId})` : ''}`);
      
      const result = await window.api.sendMessage(this.tabId, message);
      
      // Get the full updated state to ensure we have all messages including system messages
      const state = await window.api.getChatState(this.tabId);
      if (!state) {
        throw new Error(`[CHAT API] No chat state found for tab ${this.tabId}`);
      }
      
      // Update local state with session state from the server
      this.messages = state.messages.map(this.convertMessageToChatMessage);
      
      return result;
    } catch (error) {
      log.error('Error sending message:', error);
      throw error;
    }
  }

  public async clearModel(): Promise<boolean> {
    try {
      const result = await window.api.clearModel(this.tabId);
      if (result.success) {
        this.currentProvider = undefined;
        this.currentModelId = undefined;
        this.currentModelName = undefined;

        // Update messages with the new updates
        this.messages.push(...result.updates.map(this.convertMessageToChatMessage));
      }
      return result.success;
    } catch (error) {
      log.error('Error clearing model:', error);
      return false;
    }
  }

  public async switchModel(provider: ProviderType, modelId: string): Promise<boolean> {
    try {
      const result = await window.api.switchModel(this.tabId, provider, modelId);
      if (result.success) {
        this.currentProvider = provider;
        this.currentModelId = modelId;
        await this.updateModelNameFromState(provider, modelId);

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

  public getCurrentModel(): ProviderType | undefined {
    return this.currentProvider;
  }
  
  public getCurrentModelName(): string | undefined {
    return this.currentModelName;
  }

  public async getModels(provider: ProviderType, forceRefresh: boolean = false): Promise<ILLMModel[]> {
    try {
      return await window.api.getModelsForProvider(provider);
    } catch (error) {
      log.error('Error getting models for provider:', error);
      return [];
    }
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

  public async addTool(serverName: string, toolName: string): Promise<boolean> {
    try {
      return await window.api.addChatTool(this.tabId, serverName, toolName);
    } catch (error) {
      log.error(`Error adding tool '${serverName}:${toolName}' to chat:`, error);
      return false;
    }
  }

  public async removeTool(serverName: string, toolName: string): Promise<boolean> {
    try {
      return await window.api.removeChatTool(this.tabId, serverName, toolName);
    } catch (error) {
      log.error(`Error removing tool '${serverName}:${toolName}' from chat:`, error);
      return false;
    }
  }

  public async getActiveReferences(): Promise<string[]> {
    // This requires refreshing the state first to ensure we have the latest data
    // Return the references from contextItems
    try {
      const state = await window.api.getChatState(this.tabId);
      if (!state) {
        throw new Error(`[CHAT API] No chat state found for tab ${this.tabId}`);
      }
      return state.contextItems
        .filter((item: SessionContextItem) => item.type === 'reference')
        .map((item: SessionContextItem) => item.name);
    } catch (error) {
      log.error('Error getting active references:', error);
      return [];
    }
  }

  public async getActiveRules(): Promise<string[]> {
    // This requires refreshing the state first to ensure we have the latest data
    // Return the rules from contextItems
    try {
      const state = await window.api.getChatState(this.tabId);
      if (!state) {
        throw new Error(`[CHAT API] No chat state found for tab ${this.tabId}`);
      }
      return state.contextItems
        .filter((item: SessionContextItem) => item.type === 'rule')
        .map((item: SessionContextItem) => item.name);
    } catch (error) {
      log.error('Error getting active rules:', error);
      return [];
    }
  }

  public async getActiveTools(): Promise<{serverName: string, toolName: string}[]> {
    // This requires refreshing the state first to ensure we have the latest data
    // Return the tools from contextItems
    try {
      const state = await window.api.getChatState(this.tabId);
      if (!state) {
        throw new Error(`[CHAT API] No chat state found for tab ${this.tabId}`);
      }
      return state.contextItems
        .filter((item: SessionContextItem) => item.type === 'tool')
        .map((item: SessionContextItem) => {
          if (item.type === 'tool') {
            return { serverName: item.serverName, toolName: item.name };
          }
          throw new Error('Expected tool item');
        });
    } catch (error) {
      log.error('Error getting active tools:', error);
      return [];
    }
  }

  async updateSettings(settings: {
    maxChatTurns: number;
    maxOutputTokens: number;
    temperature: number;
    topP: number;
  }): Promise<boolean> {
    try {
      await window.api.updateChatSettings(this.tabId, settings);
      log.info(`Updated chat settings for tab ${this.tabId}`);
      return true;
    } catch (error) {
      log.error('Error updating chat settings:', error);
      return false;
    }
  }
} 