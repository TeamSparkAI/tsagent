import { LLMType, ILLMModel } from '../../shared/llm';
import { RendererChatMessage } from '../types/ChatMessage';
import { ChatMessage } from '../../shared/ChatSession';
import { ModelReply } from '../../shared/ModelReply';
import log from 'electron-log';

export class ChatAPI {
  private tabId: string;
  private currentProvider?: LLMType;
  private currentModelName?: string;
  private currentModelId?: string;
  private messages: (RendererChatMessage & { modelReply?: ModelReply })[] = [];
  private currentModelInfo: ILLMModel | null = null; // Cache just the current model info

  constructor(tabId: string) {
    this.tabId = tabId;
    this.initModel();
  }

  private async updateModelNameFromState(modelType: LLMType, modelId?: string): Promise<void> {
    if (modelId) {
      try {
        // If we already have the model info cached and it matches the current ID
        if (this.currentModelInfo && this.currentModelInfo.id === modelId) {
          this.currentModelName = this.currentModelInfo.name;
          return;
        }
        
        // Otherwise, try to find the model from the provider
        const models = await window.api.getModelsForProvider(modelType);
        const model = models.find((m: ILLMModel) => m.id === modelId);
        if (model && model.name) {
          // Cache this model
          this.currentModelInfo = model;
          this.currentModelName = model.name;
        } else {
          // If we can't find the exact model, use the ID as the display name
          this.currentModelName = modelId;
        }
      } catch (error) {
        log.error('Failed to get model information:', error);
        // Use the model ID as a fallback display name
        this.currentModelName = modelId;
      }
    } else {
      // Default to a capitalized version of the model type
      this.currentModelName = modelType.charAt(0).toUpperCase() + 
        modelType.slice(1);
    }
  }

  private async initModel() {
    try {
      const state = await window.api.getChatState(this.tabId);
      if (!state) {
        throw new Error(`[CHAT API] No chat state found for tab ${this.tabId}`);
      }
      
      // Update local state with session state from the server
      this.currentProvider = state.currentModelProvider;
      this.currentModelId = state.currentModelId;
      
      // Update the model name if we have a provider and model ID
      if (state.currentModelProvider && state.currentModelId) {
        await this.updateModelNameFromState(state.currentModelProvider, state.currentModelId);
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
      // !!! Ideally we want to integrate the approvals into the single modelReply for the multi-turn response in the UX
      return {
        type: 'user',
        content: message.toolCallApprovals.map(approval => approval.serverName + ' - ' + approval.toolName + ' - ' + 'Approved').join('\n'),
      };
    }
    return {
      type: message.role === 'assistant' ? 'ai' : message.role,
      content: message.role === 'assistant' ? '' : message.content,
      modelReply: message.role === 'assistant' ? message.modelReply : undefined
    };
  }

  public async sendMessage(message: string): Promise<string> {
    try {
      // Log the model we're using to send the message
      log.info(`Sending message using model ${this.currentProvider}${this.currentModelId ? ` (${this.currentModelId})` : ''}`);
      
      const result = await window.api.sendMessage(this.tabId, message);
      
      // Get the full updated state to ensure we have all messages including system messages
      const state = await window.api.getChatState(this.tabId);
      if (!state) {
        throw new Error(`[CHAT API] No chat state found for tab ${this.tabId}`);
      }
      this.messages = state.messages.map(this.convertMessageToChatMessage);
      
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

  public async switchModel(provider: LLMType, modelId: string): Promise<boolean> {
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

  public getCurrentModel(): LLMType | undefined {
    return this.currentProvider;
  }
  
  public getCurrentModelName(): string | undefined {
    return this.currentModelName;
  }

  public async getModels(provider: LLMType, forceRefresh: boolean = false): Promise<ILLMModel[]> {
    try {
      // Always fetch all models when explicitly called - this is primarily used by the model picker
      log.info(`Fetching models for provider ${provider} from API`);
      return await window.api.getModelsForProvider(provider);
    } catch (error) {
      log.error(`Error getting models for provider ${provider}:`, error);
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

  public async getActiveReferences(): Promise<string[]> {
    // This requires refreshing the state first to ensure we have the latest data
    // Return the references from the latest state
    try {
      const state = await window.api.getChatState(this.tabId);
      if (!state) {
        throw new Error(`[CHAT API] No chat state found for tab ${this.tabId}`);
      }
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
      if (!state) {
        throw new Error(`[CHAT API] No chat state found for tab ${this.tabId}`);
      }
      return state.rules;
    } catch (error) {
      log.error('Error getting active rules:', error);
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