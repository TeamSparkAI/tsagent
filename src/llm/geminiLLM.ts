import { ILLM } from './types.js';
import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';
import { MCPClientManager } from '../mcp/manager.js';

export class GeminiLLM implements ILLM {
  private model: GenerativeModel;
  private mcpManager: MCPClientManager;

  constructor(modelName: string, mcpManager: MCPClientManager) {
    if (!config.geminiKey) {
      throw new Error('GEMINI_API_KEY must be provided');
    }
    const genAI = new GoogleGenerativeAI(config.geminiKey);
    this.model = genAI.getGenerativeModel({ model: modelName });
    this.mcpManager = mcpManager;
  }

  async generateResponse(prompt: string): Promise<string> {
    try {
      const result = await this.model.generateContent(prompt);
      if (!result.response) {
        throw new Error('No response from Gemini');
      }
      return result.response.text();
    } catch (error: any) {
      console.error('Gemini API error:', error);
      const errorMessage = error.message || 'Unknown error';
      return `Error: Failed to generate response from Gemini - ${errorMessage}`;
    }
  }
} 