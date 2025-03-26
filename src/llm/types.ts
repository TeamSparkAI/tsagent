import { MCPClientManager } from '../mcp/manager';

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
  new (mcpManager: MCPClientManager): ILLM;
} 