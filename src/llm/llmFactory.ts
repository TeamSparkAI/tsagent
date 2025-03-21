import { ILLM, LLMType } from './types.js';
import { TestLLM } from './testLLM.js';
import { GeminiLLM } from './geminiLLM.js';
import { ClaudeLLM } from './claudeLLM.js';
import { OpenAILLM } from './openaiLLM.js';

export class LLMFactory {
  static create(type: LLMType): ILLM {
    switch (type) {
      case LLMType.Gemini:
        return new GeminiLLM("gemini-2.0-flash");
      case LLMType.Claude:
        return new ClaudeLLM('claude-3-7-sonnet-20250219');
      case LLMType.OpenAI:
        return new OpenAILLM('gpt-3.5-turbo');
      case LLMType.Test:
        return new TestLLM();
      default:
        throw new Error(`Unknown LLM type: ${type}`);
    }
  }
} 