import { ILLM } from './types.js';

export class TestLLM implements ILLM {
  async generateResponse(_prompt: string): Promise<string> {
    return "Happy Birthday!";
  }
} 