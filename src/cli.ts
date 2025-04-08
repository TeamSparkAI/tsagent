import readlinePromise from 'readline/promises';
import { LLMType } from './llm/types';
import { ConfigManager } from './state/ConfigManager';
import { McpClient } from './mcp/types';
import { McpClientStdio, McpClientSse } from './mcp/client';
import log from 'electron-log';
import { Tool } from '@modelcontextprotocol/sdk/types';
import path from 'path';
import { AppState } from './state/AppState';
import { ChatSession } from './state/ChatSession';
import chalk from 'chalk';
import ora from 'ora';
import { MessageUpdate } from './types/ChatSession';

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

// Define commands
const COMMANDS = {
  HELP: '/help',
  MODEL: '/model',
  CLEAR: '/clear',
  QUIT: '/quit',
  EXIT: '/exit',
  TOOLS: '/tools',
  RULES: '/rules',
  REFERENCES: '/references'
};

const workspacePath = path.join(process.cwd(), 'config');
const configManager = ConfigManager.getInstance(false);
configManager.setConfigPath(workspacePath);
const mcpClients = new Map<string, McpClient>();

async function toolsCommand() {
  try {
    const appState = new AppState(configManager);
    await appState.initialize();

    console.log('Checking available tools on MCP servers...\n');

    const mcpClients = appState.mcpManager.getAllClients()
    for (const mcpClient of mcpClients) {
      console.log(chalk.blue(`Server: ${mcpClient.serverVersion?.name}`));
      console.log(chalk.dim('------------------------'));        
      if (mcpClient.serverTools.length === 0) {
        console.log('No tools available');
      } else {
        mcpClient.serverTools.forEach((tool: Tool) => {
          console.log(`- ${tool.name}: ${tool.description || 'No description'}`);
        });
      }
      console.log('\n');
    }
  } catch (error) {
    log.error('Error in tools command:', error);
  }
}

async function connectToServer(serverName: string) {
  try {
    const mcpServers = await configManager.getMcpConfig();
    const serverConfig = mcpServers[serverName];
    if (!serverConfig) {
      log.error(`No configuration found for server: ${serverName}`);
      return;
    }

    let client: McpClient;
    if (serverConfig.config.type === 'stdio') {
      client = new McpClientStdio({
        command: serverConfig.config.command,
        args: serverConfig.config.args,
        env: serverConfig.config.env
      });
    } else if (serverConfig.config.type === 'sse') {
      client = new McpClientSse(new URL(serverConfig.config.url), serverConfig.config.headers);
    } else {
      throw new Error(`Unsupported server type: ${serverConfig.config.type}`);
    }

    await client.connect();
    mcpClients.set(serverName, client);
    log.info(`Connected to server: ${serverName}`);
  } catch (err) {
    log.error(`Error connecting to server ${serverName}:`, err);
  }
}

function showHelp() {
  console.log(chalk.cyan('\nAvailable commands:'));
  console.log(chalk.yellow('  /help') + ' - Show this help menu');
  console.log(chalk.yellow('  /model') + ' - List available models');
  console.log(chalk.yellow('  /model <name>') + ' - Switch to specified model');
  console.log(chalk.yellow('  /tools') + ' - List available tools from all configured MCP servers');
  console.log(chalk.yellow('  /rules') + ' - List active rules');
  console.log(chalk.yellow('  /references') + ' - List active references');
  console.log(chalk.yellow('  /clear') + ' - Clear the chat history');
  console.log(chalk.yellow('  /quit') + ' or ' + chalk.yellow('/exit') + ' - Exit the application');
  console.log('');
}

export function setupCLI(appState: AppState) {
  console.log(chalk.green('Welcome to TeamSpark AI Workbench!'));
  showHelp();
  
  let currentModel = 'test';
  const chatSession = new ChatSession(appState);

  const findModelName = (input: string): string | undefined => {
    const normalizedInput = input.toLowerCase();
    return Object.keys(AVAILABLE_MODELS).find(
      key => key.toLowerCase() === normalizedInput
    );
  };

  // Process input and return true to continue, false to exit
  async function processInput(input: string): Promise<boolean> {
    const command = input.trim();
    
    // If just / is typed, show help
    if (command === '/') {
      showHelp();
      return true;
    }

    // Check if the input is a command
    if (command.startsWith('/')) {
      const commandParts = command.split(' ');
      const commandName = commandParts[0].toLowerCase();
      const args = commandParts.slice(1);

      switch (commandName) {
        case COMMANDS.HELP:
          showHelp();
          break;

        case COMMANDS.QUIT:
        case COMMANDS.EXIT:
          console.log(chalk.green('Goodbye!'));
          return false; // Signal to stop the loop

        case COMMANDS.MODEL:
          if (args.length === 0) {
            console.log(chalk.cyan('\nAvailable models:'));
            Object.keys(AVAILABLE_MODELS).forEach(model => {
              const indicator = model === currentModel ? chalk.green('* ') : '  ';
              const displayName = MODEL_DISPLAY_NAMES[model] || model;
              console.log(`${indicator}${displayName}`);
            });
            console.log('');
          } else {
            const inputModelName = args[0].toLowerCase();
            const modelName = findModelName(inputModelName);
            
            if (modelName) {
              try {
                chatSession.switchModel(AVAILABLE_MODELS[modelName as keyof typeof AVAILABLE_MODELS]);
                currentModel = modelName;
                const displayName = MODEL_DISPLAY_NAMES[modelName] || modelName;
                console.log(chalk.green(`Switched to ${displayName} model`));
              } catch (error: unknown) {
                if (error instanceof Error) {
                  console.error(chalk.red('Error switching model:'), error.message);
                } else {
                  console.error(chalk.red('Error switching model'));
                }
              }
            } else {
              console.log(chalk.yellow('Invalid model name. Use /model to see available models.'));
            }
          }
          break;

        case COMMANDS.TOOLS:
          await toolsCommand();
          break;

        case COMMANDS.RULES:
          // !!! This shows the included rules only - would be cool to show all rules and star the included ones.
          if (chatSession.rules.length === 0) {
            console.log(chalk.yellow('No rules currently active.'));
          } else {
            console.log(chalk.cyan('\nActive rules:'));
            chatSession.rules.forEach(rule => {
              console.log(`- ${rule}`);
            });
            console.log('');
          }
          break;

        case COMMANDS.REFERENCES:
          // !!! This shows the included references only - would be cool to show all references and star the included ones.
          if (chatSession.references.length === 0) {
            console.log(chalk.yellow('No references currently active.'));
          } else {
            console.log(chalk.cyan('\nActive references:'));
            chatSession.references.forEach(reference => {
              console.log(`- ${reference}`);
            });
            console.log('');
          }
          break;

        case COMMANDS.CLEAR:
          // !!! This doesn't actually clear the chat history but that could be cool.
          console.clear();
          console.log(chalk.green('Chat history cleared'));
          console.log(chalk.green('Welcome to TeamSpark AI Workbench!'));
          break;

        default:
          console.log(chalk.red(`Unknown command: ${commandName}`));
          showHelp();
          break;
      }
      return true; // Continue with the loop
    }

    // If it's not a command, process as a regular message
    try {
      const spinner = ora({text: 'Thinking...'}).start();
      
      // Add timeout to prevent infinite hanging
      const messageUpdate = await Promise.race<MessageUpdate>([
        chatSession.handleMessage(input),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("Request timed out after 60 seconds")), 60000)
        )
      ]);
      
      spinner.stop();
      
      for (const update of messageUpdate.updates) {
        if (update.role === 'assistant') {
          for (const turn of update.modelReply.turns) {
            if (turn.message) {
              console.log(`${turn.message}`);
            }
            if (turn.toolCalls) {
              for (const toolCall of turn.toolCalls) {
                console.log(chalk.dim(`Tool call: ${toolCall.toolName}: ${JSON.stringify(toolCall.args)}`));
              }
            }
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(chalk.red('Error:'), error.message);
      } else {
        console.error(chalk.red('An unknown error occurred'));
      }
    }
    return true; // Continue the loop
  }

  // Use a loop instead of recursion
  async function runCLI() {
    let running = true;
    
    // Add signal handlers for graceful exit
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\nInterrupted. Exiting...'));
      process.exit(0);
    });
    
    try {
      while (running) {
        const displayName = MODEL_DISPLAY_NAMES[currentModel] || currentModel;
        try {
          // Creating and closing the readline interface for each prompt is not pretty, but it's the only way I found to prevent
          // the ora spinner from causing a subsequent prompt to hang.
          //
          const rl = readlinePromise.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          const input = await rl.question(chalk.cyan(`${displayName}> `));
          rl.close();
          running = await processInput(input);
        } catch (error) {
          console.error(chalk.red('Error in CLI loop:'), error);
        }
      }
      
      // Add this: Clean exit when loop finishes
      console.log(chalk.green('Exiting application.'));
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Fatal error in CLI:'), error);
      process.exit(1);
    }
  }

  // Replace this with direct call
  runCLI();
} 