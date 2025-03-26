import { ILLM, LLMType } from './types';
import { TestLLM } from './testLLM';
import { GeminiLLM } from './geminiLLM';
import { ClaudeLLM } from './claudeLLM';
import { OpenAILLM } from './openaiLLM';
import { MCPClientManager } from '../mcp/manager';
import { LLMStateManager } from './stateManager';
import { ConfigManager } from '../state/ConfigManager';
import log from 'electron-log';

export class LLMFactory {
  private static mcpManager: MCPClientManager;
  private static stateManager: LLMStateManager;
  private static configManager: ConfigManager;
  private static initialized = false;

  static getStateManager(): LLMStateManager {
    if (!this.initialized || !this.stateManager) {
      log.error('LLMFactory not properly initialized');
      throw new Error('LLMFactory not initialized');
    }
    return this.stateManager;
  }

  static initialize(mcpManager: MCPClientManager, configManager: ConfigManager) {
    log.info('Initializing LLMFactory with MCPManager');
    if (!mcpManager) {
      throw new Error('MCPManager is required for initialization');
    }
    this.mcpManager = mcpManager;
    this.stateManager = new LLMStateManager(mcpManager);
    this.configManager = configManager;
    this.initialized = true;
    log.info('LLMFactory initialized successfully');
  }

  static create(type: LLMType): ILLM {
    log.info('LLMFactory creating:', type);
    if (!this.mcpManager.isReady()) {
      throw new Error('MCPClientManager not ready');
    }
    if (!this.initialized) {
      log.error('LLMFactory not initialized before create');
      throw new Error('LLMFactory not initialized');
    }
    try {
      switch (type) {
        case LLMType.Gemini:
          return new GeminiLLM('gemini-2.0-flash', this.stateManager, this.configManager);
        case LLMType.Claude:
          log.info('Creating Claude instance');
          return new ClaudeLLM('claude-3-7-sonnet-20250219', this.stateManager, this.configManager);
        case LLMType.OpenAI:
          return new OpenAILLM('gpt-3.5-turbo', this.stateManager, this.configManager);
        case LLMType.Test:
          return new TestLLM();
        default:
          throw new Error(`Unknown LLM type: ${type}`);
      }
    } catch (error) {
      log.error('Error creating LLM:', error);
      if (error instanceof Error) {
        log.error('Error details:', error.message, error.stack);
      }
      throw error;
    }
  }
}