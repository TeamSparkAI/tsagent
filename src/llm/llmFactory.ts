import { ILLM, LLMType } from './types';
import { TestLLM } from './testLLM';
import { ClaudeLLM } from './claudeLLM';
import { OpenAILLM } from './openaiLLM';
import { GeminiLLM } from './geminiLLM';
import { AppState } from '../state/AppState';
import log from 'electron-log';

export class LLMFactory {
  private static appState: AppState;

  static initialize(appState: AppState) {
    this.appState = appState;
    log.info('LLMFactory initialized with AppState');
  }

  static create(modelType: LLMType): ILLM {
    if (!this.appState) {
      throw new Error('LLMFactory not initialized with AppState');
    }

    switch (modelType) {
      case LLMType.Gemini:
        return new GeminiLLM('gemini-2.0-flash', this.appState);
      case LLMType.Claude:
        return new ClaudeLLM('claude-3-7-sonnet-20250219', this.appState);
      case LLMType.OpenAI:
        return new OpenAILLM('gpt-3.5-turbo', this.appState);
      case LLMType.Test:
        return new TestLLM(this.appState);
      default:
        throw new Error(`Unsupported model type: ${modelType}`);
    }
  }
}