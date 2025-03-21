import { ILLM } from './types.js';
import OpenAI from 'openai';
import { config } from '../config.js';

export class OpenAILLM implements ILLM {
  private client: OpenAI;
  private model: string;

  constructor(model: string = 'gpt-3.5-turbo') {
    if (!config.openaiKey) {
      throw new Error('OPENAI_API_KEY must be provided');
    }
    this.client = new OpenAI({
      apiKey: config.openaiKey,
    });
    this.model = model;
  }

  async generateResponse(prompt: string): Promise<string> {
    try {
      const completion = await this.client.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: this.model,
        temperature: 0.7,
        max_tokens: 1000,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      return response;
    } catch (error: any) {
      console.error('OpenAI API error:', error);
      const errorMessage = error.message || 'Unknown error';
      return `Error: Failed to generate response from OpenAI - ${errorMessage}`;
    }
  }
} 