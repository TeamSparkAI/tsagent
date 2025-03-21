import { ILLM } from './types.js';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

export class ClaudeLLM implements ILLM {
  private client: Anthropic;
  private model: string;

  constructor(model: string = 'claude-3-7-sonnet-20250219') {
    if (!config.anthropicKey) {
      throw new Error('ANTHROPIC_API_KEY must be provided');
    }
    console.log('Initializing Claude with model:', model);
    
    this.client = new Anthropic({
      apiKey: config.anthropicKey,
    });
    this.model = model;
  }

  async generateResponse(prompt: string): Promise<string> {
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
        system: "You are a helpful AI assistant."
      });

      if (!message.content[0].text) {
        throw new Error('No response from Claude');
      }

      // Log token usage for monitoring
      console.log('Tokens used:', {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens
      });

      return message.content[0].text;
    } catch (error: any) {
      console.error('Claude API error:', error.message);
      return `Error: Failed to generate response from Claude - ${error.message}`;
    }
  }
} 