import readline from 'readline';
import { LLMFactory } from './llm/llmFactory';
import { LLMType } from './llm/types';
import { toolsCommand } from './commands/tools';
import log from 'electron-log';

// Define the model map with proper type
const AVAILABLE_MODELS: Record<string, LLMType> = {
  'gemini': LLMType.Gemini,
  'claude': LLMType.Claude,
  'openai': LLMType.OpenAI,
  'test': LLMType.Test
} as const;

// Add display names mapping
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'test': 'Test LLM',
  'gemini': 'Gemini',
  'claude': 'Claude',
  'openai': 'OpenAI'
};

export function setupCLI() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  log.info('Welcome to TeamSpark AI Workbench!');
  log.info('Available commands:');
  log.info('  /model - List available models');
  log.info('  /model <name> - Switch to specified model');
  log.info('  /quit or /exit - Exit the application');
  log.info('  /tools - List available tools from all configured MCP servers');
  log.info('\n');
  
  let currentLLM = LLMFactory.create(LLMType.Test);
  let currentModel = 'test';

  const findModelName = (input: string): string | undefined => {
    const normalizedInput = input.toLowerCase();
    return Object.keys(AVAILABLE_MODELS).find(
      key => key.toLowerCase() === normalizedInput
    );
  };

  const promptUser = () => {
    const displayName = MODEL_DISPLAY_NAMES[currentModel] || currentModel;
    rl.question(`${displayName}> `, async (input) => {
      const command = input.trim().toLowerCase();

      if (command === '/quit' || command === '/exit') {
        rl.close();
        process.exit(0);
      }

      if (command === '/model') {
        log.info('\nAvailable models:');
        Object.keys(AVAILABLE_MODELS).forEach(model => {
          const indicator = model === currentModel ? '* ' : '  ';
          const displayName = MODEL_DISPLAY_NAMES[model] || model;
          log.info(`${indicator}${displayName}`);
        });
        log.info('');
        promptUser();
        return;
      }

      if (command.startsWith('/model ')) {
        const inputModelName = command.split(' ')[1].toLowerCase();
        const modelName = findModelName(inputModelName);
        
        if (modelName) {
          try {
            currentLLM = LLMFactory.create(AVAILABLE_MODELS[modelName as keyof typeof AVAILABLE_MODELS]);
            currentModel = modelName;
            const displayName = MODEL_DISPLAY_NAMES[modelName] || modelName;
            log.info(`Switched to ${displayName} model`);
          } catch (error: unknown) {
            if (error instanceof Error) {
              log.info('Error switching model:', error.message);
            } else {
              log.info('Error switching model');
            }
          }
        } else {
          log.info('Invalid model name. Use /model to see available models.');
        }
        promptUser();
        return;
      }

      if (command === '/tools') {
        toolsCommand();
        promptUser();
        return;
      }

      try {
        const response = await currentLLM.generateResponse(input);
        log.info(`AI: ${response}`);
      } catch (error: unknown) {
        if (error instanceof Error) {
          log.error('Error:', error.message);
        } else {
          log.error('An unknown error occurred');
        }
      }
      promptUser();
    });
  };

  promptUser();
} 