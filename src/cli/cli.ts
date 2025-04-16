import readlinePromise from 'readline/promises';
import { LLMType } from '../shared/llm';
import log from 'electron-log';
import { Tool } from '@modelcontextprotocol/sdk/types';
import path from 'path';
import { ChatSession, ChatSessionOptionsWithRequiredSettings } from '../main/state/ChatSession';
import chalk from 'chalk';
import ora from 'ora';
import { MessageUpdate } from '../shared/ChatSession';
import { WorkspaceManager } from '../main/state/WorkspaceManager';
import { MAX_CHAT_TURNS_DEFAULT, MAX_CHAT_TURNS_KEY, MAX_OUTPUT_TOKENS_DEFAULT, MAX_OUTPUT_TOKENS_KEY, TEMPERATURE_DEFAULT, TEMPERATURE_KEY, TOP_P_DEFAULT, TOP_P_KEY } from '../shared/workspace';

// Define the model map with proper type
const AVAILABLE_MODELS: Record<string, LLMType> = {
  'gemini': LLMType.Gemini,
  'claude': LLMType.Claude,
  'openai': LLMType.OpenAI,
  'ollama': LLMType.Ollama,
  'bedrock': LLMType.Bedrock,
  'test': LLMType.Test
} as const;

// Add display names mapping
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'test': 'Test LLM',
  'gemini': 'Gemini',
  'claude': 'Claude',
  'openai': 'OpenAI',
  'ollama': 'Ollama',
  'bedrock': 'Bedrock'
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
  REFERENCES: '/references',
  STATS: '/stats',
  WORKSPACE: '/workspace'
};

async function toolsCommand(workspace: WorkspaceManager) {
  try {
    console.log('Checking available tools on MCP servers...\n');

    const mcpClients = workspace.mcpManager.getAllClients()
    for (const mcpClient of mcpClients) {
      console.log(chalk.cyan.bold(`Server: ${mcpClient.serverVersion?.name}`));
      console.log(chalk.dim('------------------------'));        
      if (mcpClient.serverTools.length === 0) {
        console.log('No tools available');
      } else {
        mcpClient.serverTools.forEach((tool: Tool) => {
          const toolName = chalk.yellow(tool.name);
          const description = tool.description || 'No description';
          
          // Format description: max 80 chars, proper word wrap with indentation
          if (description.length > 80) {
            const firstLine = description.substring(0, 80).split(' ').slice(0, -1).join(' ');
            console.log(`- ${toolName}`);
            console.log(`    ${firstLine}`);
            
            // Get the rest of the description
            const remainingDesc = description.substring(firstLine.length).trim();
            
            // Split remaining description into chunks of ~80 chars on word boundaries
            let startIndex = 0;
            while (startIndex < remainingDesc.length) {
              let endIndex = startIndex + 80;
              if (endIndex < remainingDesc.length) {
                // Find the last space before the 80 char limit
                const lastSpace = remainingDesc.substring(startIndex, endIndex).lastIndexOf(' ');
                if (lastSpace !== -1) {
                  endIndex = startIndex + lastSpace;
                }
              } else {
                endIndex = remainingDesc.length;
              }
              
              console.log(`    ${remainingDesc.substring(startIndex, endIndex)}`);
              startIndex = endIndex + 1;
            }
          } else {
            console.log(`- ${toolName}: ${description}`);
          }
        });
      }
      console.log('\n');
    }
  } catch (error) {
    log.error('Error in tools command:', error);
  }
}

function showHelp() {
  console.log(chalk.cyan('\nAvailable commands:'));
  console.log(chalk.yellow('  /help') + ' - Show this help menu');
  console.log(chalk.yellow('  /model') + ' - List available models');
  console.log(chalk.yellow('  /model <n>') + ' - Switch to specified model');
  console.log(chalk.yellow('  /tools') + ' - List available tools from all configured MCP servers');
  console.log(chalk.yellow('  /rules') + ' - List all rules (* active, - inactive)');
  console.log(chalk.yellow('  /references') + ' - List all references (* active, - inactive)');
  console.log(chalk.yellow('  /stats') + ' - Display statistics for the current chat session');
  console.log(chalk.yellow('  /workspace') + ' - Display the current workspace path');
  console.log(chalk.yellow('  /clear') + ' - Clear the chat history');
  console.log(chalk.yellow('  /quit') + ' or ' + chalk.yellow('/exit') + ' - Exit the application');
  console.log('');
}

function getSettingsValue(workspace: WorkspaceManager, key: string, defaultValue: number): number {
  const settingsValue = workspace.getSettingsValue(key);
  return settingsValue ? parseFloat(settingsValue) : defaultValue;
}

export function setupCLI(workspace: WorkspaceManager) {
  console.log(chalk.green('Welcome to TeamSpark AI Workbench!'));
  showHelp();
  
  let currentModel = 'test';

  const chatSessionOptions: ChatSessionOptionsWithRequiredSettings = {
    maxChatTurns: getSettingsValue(workspace, MAX_CHAT_TURNS_KEY, MAX_CHAT_TURNS_DEFAULT),
    maxOutputTokens: getSettingsValue(workspace, MAX_OUTPUT_TOKENS_KEY, MAX_OUTPUT_TOKENS_DEFAULT),
    temperature: getSettingsValue(workspace, TEMPERATURE_KEY, TEMPERATURE_DEFAULT),
    topP: getSettingsValue(workspace, TOP_P_KEY, TOP_P_DEFAULT)
  };

  const chatSession = new ChatSession(workspace, chatSessionOptions);

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

        case COMMANDS.STATS:
          // Display chat statistics
          console.log(chalk.cyan('\nChat Statistics:'));
          
          // Session totals
          console.log(chalk.cyan('  Session Totals:'));
          
          const userMessages = chatSession.messages.filter(msg => msg.role === 'user').length;
          console.log(`    User Messages: ${chalk.yellow(userMessages)}`);
          
          // Calculate AI responses (turns)
          const aiResponses = chatSession.messages
            .filter(msg => msg.role === 'assistant')
            .reduce((total, msg) => total + (('modelReply' in msg) ? msg.modelReply.turns.length : 0), 0);
          console.log(`    AI Responses (Turns): ${chalk.yellow(aiResponses)}`);
          
          // Calculate total input tokens
          const totalInputTokens = chatSession.messages
            .filter(msg => msg.role === 'assistant')
            .reduce((total, msg) => {
              if ('modelReply' in msg) {
                return total + msg.modelReply.turns.reduce((turnTotal, turn) => 
                  turnTotal + (turn.inputTokens || 0), 0);
              }
              return total;
            }, 0);
          console.log(`    Total Input Tokens: ${chalk.yellow(totalInputTokens.toLocaleString())}`);
          
          // Calculate total output tokens
          const totalOutputTokens = chatSession.messages
            .filter(msg => msg.role === 'assistant')
            .reduce((total, msg) => {
              if ('modelReply' in msg) {
                return total + msg.modelReply.turns.reduce((turnTotal, turn) => 
                  turnTotal + (turn.outputTokens || 0), 0);
              }
              return total;
            }, 0);
          console.log(`    Total Output Tokens: ${chalk.yellow(totalOutputTokens.toLocaleString())}`);
          
          // Last message stats
          console.log(chalk.cyan('\n  Last Message:'));
          
          const aiMessages = chatSession.messages.filter(msg => msg.role === 'assistant');
          if (aiMessages.length > 0) {
            // Get the last AI message
            const lastMessage = [...aiMessages]
              .sort((a, b) => {
                if ('modelReply' in a && 'modelReply' in b) {
                  return (b.modelReply.timestamp || 0) - (a.modelReply.timestamp || 0);
                }
                return 0;
              })[0];
            
            if ('modelReply' in lastMessage) {
              // Display response turns
              const responseTurns = lastMessage.modelReply.turns.length;
              console.log(`    AI Response Turns: ${chalk.yellow(responseTurns)}`);
              
              // Count tool calls
              const toolCalls = lastMessage.modelReply.turns.reduce((total, turn) => 
                total + (turn.toolCalls?.length || 0), 0);
              console.log(`    Tool Calls: ${chalk.yellow(toolCalls)}`);
              
              // Calculate input tokens for last message
              const inputTokens = lastMessage.modelReply.turns.reduce((total, turn) => 
                total + (turn.inputTokens || 0), 0);
              console.log(`    Input Tokens: ${chalk.yellow(inputTokens.toLocaleString())}`);
              
              // Calculate output tokens for last message
              const outputTokens = lastMessage.modelReply.turns.reduce((total, turn) => 
                total + (turn.outputTokens || 0), 0);
              console.log(`    Output Tokens: ${chalk.yellow(outputTokens.toLocaleString())}`);
            }
          } else {
            console.log(chalk.yellow('    No AI responses yet'));
          }
          
          console.log('');
          break;

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
          await toolsCommand(workspace);
          break;

        case COMMANDS.RULES:
          // Show all rules with asterisk for active ones and dash for inactive ones
          const allRules = workspace.rulesManager.getRules();
          console.log(chalk.cyan('\nRules:'));
          if (allRules.length === 0) {
            console.log(chalk.yellow('No rules available.'));
          } else {
            allRules.forEach(rule => {
              const isActive = chatSession.rules.includes(rule.name);
              const marker = isActive ? '*' : '-';
              console.log(`${marker} ${rule.name} (priority: ${rule.priorityLevel})${!rule.enabled ? ' [disabled]' : ''}`);
            });
            console.log('');
          }
          break;

        case COMMANDS.REFERENCES:
          // Show all references with asterisk for active ones and dash for inactive ones
          const allReferences = workspace.referencesManager.getReferences();
          console.log(chalk.cyan('\nReferences:'));
          if (allReferences.length === 0) {
            console.log(chalk.yellow('No references available.'));
          } else {
            allReferences.forEach(reference => {
              const isActive = chatSession.references.includes(reference.name);
              const marker = isActive ? '*' : '-';
              console.log(`${marker} ${reference.name} (priority: ${reference.priorityLevel})${!reference.enabled ? ' [disabled]' : ''}`);
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

        case COMMANDS.WORKSPACE:
          console.log(chalk.cyan('\nWorkspace:'));
          console.log(`  ${chalk.yellow(workspace.workspaceDir)}`);
          console.log('');
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
  return;
} 