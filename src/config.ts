import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

// Load .env.local first, fall back to .env
dotenvConfig({ path: resolve(process.cwd(), '.env.local') });
dotenvConfig({ path: resolve(process.cwd(), '.env') });

export const config = {
  geminiKey: process.env.GEMINI_API_KEY || '',
  openaiKey: process.env.OPENAI_API_KEY || '',
  anthropicKey: process.env.ANTHROPIC_API_KEY || ''
};

// Validate required keys are present
export function validateApiKey(key: string, service: string): void {
  if (!key) {
    throw new Error(`${service} API key not found. Please set ${service.toUpperCase()}_API_KEY environment variable.`);
  }
} 