import { ILLM, LLMType } from './types.js';
import { TestLLM } from './testLLM.js';
import { GeminiLLM } from './geminiLLM.js';
import { ClaudeLLM } from './claudeLLM.js';
import { OpenAILLM } from './openaiLLM.js';
import { MCPClientManager } from '../mcp/manager.js';
import { LLMStateManager } from './stateManager.js';

export class LLMFactory {
  private static mcpManager: MCPClientManager;
  private static stateManager: LLMStateManager;

  static initialize(mcpManager: MCPClientManager) {
    this.stateManager = new LLMStateManager(mcpManager);
  }

  static create(type: LLMType): ILLM {
    console.log('LLMFactory creating:', type);
    switch (type) {
      case LLMType.Gemini:
        return new GeminiLLM('gemini-2.0-flash', this.stateManager);
      case LLMType.Claude:
        console.log('Creating Claude instance');
        return new ClaudeLLM('claude-3-7-sonnet-20250219', this.stateManager);
      case LLMType.OpenAI:
        return new OpenAILLM('gpt-3.5-turbo', this.stateManager);
      case LLMType.Test:
        return new TestLLM();
      default:
        throw new Error(`Unknown LLM type: ${type}`);
    }
  }
}