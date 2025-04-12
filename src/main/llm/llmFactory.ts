import { ILLM, LLMType, LLMProviderInfo } from '../../shared/llm';
import { TestLLM } from './testLLM';
import { ClaudeLLM } from './claudeLLM';
import { OpenAILLM } from './openaiLLM';
import { GeminiLLM } from './geminiLLM';
import { AppState } from '../state/AppState';
import log from 'electron-log';
import { OllamaLLM } from './ollamaLLM';
import { BedrockLLM } from './bedrockLLM';

export class LLMFactory {
  private appState: AppState;

  constructor(appState: AppState) {
    this.appState = appState;
  }

  // Get provider information for all available LLM providers
  getProviderInfo(): Record<LLMType, LLMProviderInfo> {
    return {
      [LLMType.Test]: TestLLM.getInfo(),
      [LLMType.Claude]: ClaudeLLM.getInfo(),
      [LLMType.OpenAI]: OpenAILLM.getInfo(),
      [LLMType.Gemini]: GeminiLLM.getInfo(),
      [LLMType.Ollama]: OllamaLLM.getInfo(),
      [LLMType.Bedrock]: BedrockLLM.getInfo(),
    };
  }

  // Get provider information for a specific LLM type
  getProviderInfoByType(type: LLMType): LLMProviderInfo {
    return this.getProviderInfo()[type];
  }

  create(modelType: LLMType, modelId?: string): ILLM {
    if (!this.appState) {
      throw new Error('LLMFactory not initialized with AppState');
    }

    log.info('LLMFactory creating model:', modelType, modelId ? `with model ID: ${modelId}` : '');

    switch (modelType) {
      case LLMType.Gemini:
        log.info('Creating Gemini LLM instance');
        return new GeminiLLM(modelId || 'gemini-2.0-flash', this.appState);
      case LLMType.Claude:
        log.info('Creating Claude LLM instance');
        return new ClaudeLLM(modelId || 'claude-3-7-sonnet-20250219', this.appState);
      case LLMType.OpenAI:
        log.info('Creating OpenAI LLM instance');
        return new OpenAILLM(modelId || 'gpt-3.5-turbo', this.appState);
      case LLMType.Ollama:
        log.info('Creating Ollama LLM instance');
        return new OllamaLLM(modelId || 'llama3.2', this.appState);
      case LLMType.Bedrock:
        log.info('Creating Bedrock LLM instance');
        return new BedrockLLM(modelId || 'amazon.nova-pro-v1:0', this.appState);
      case LLMType.Test:
        log.info('Creating Test LLM instance');
        return new TestLLM(this.appState);
      default:
        throw new Error(`Unsupported model type: ${modelType}`);
    }
  }
}