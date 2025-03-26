import { LLMStateManager } from './stateManager';
import { ConfigManager } from '../state/ConfigManager';

export enum LLMType {
  Test = 'TEST',
  Gemini = 'GEMINI',
  Claude = 'CLAUDE',
  OpenAI = 'OPENAI'
}

export interface ILLM {
  generateResponse(prompt: string): Promise<string>;
}

export interface LLMConstructor {
  new (modelName: string, stateManager: LLMStateManager, configManager: ConfigManager): ILLM;
} 