import { LLMStateManager } from './stateManager';
import { ConfigManager } from '../state/ConfigManager';
import { ChatMessage } from '../types/ChatSession';

export enum LLMType {
  Test = 'TEST',
  Gemini = 'GEMINI',
  Claude = 'CLAUDE',
  OpenAI = 'OPENAI'
}

export interface ILLM {
  generateResponse(messages: ChatMessage[]): Promise<string>;
}

export interface LLMConstructor {
  new (modelName: string, stateManager: LLMStateManager, configManager: ConfigManager): ILLM;
} 