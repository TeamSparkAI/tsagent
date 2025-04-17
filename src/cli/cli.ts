import readlinePromise from 'readline/promises';
import { LLMProviderInfo, LLMType } from '../shared/llm';
import log from 'electron-log';
import { Tool } from '@modelcontextprotocol/sdk/types';
import { ChatSession, ChatSessionOptionsWithRequiredSettings } from '../main/state/ChatSession';
import chalk from 'chalk';
import ora from 'ora';
import { MessageUpdate } from '../shared/ChatSession';
import { WorkspaceManager } from '../main/state/WorkspaceManager';
import { MAX_CHAT_TURNS_DEFAULT, MAX_CHAT_TURNS_KEY, MAX_OUTPUT_TOKENS_DEFAULT, MAX_OUTPUT_TOKENS_KEY, MOST_RECENT_MODEL_KEY, TEMPERATURE_DEFAULT, TEMPERATURE_KEY, TOP_P_DEFAULT, TOP_P_KEY } from '../shared/workspace';
import { LLMFactory } from '../main/llm/llmFactory';

// Define commands
const COMMANDS = {
  HELP: '/help',
  PROVIDERS: '/providers',
  PROVIDER: '/provider',
  MODELS: '/models',
  MODEL: '/model',
  SETTINGS: '/settings',
  SETTING: '/setting',
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
  console.log(chalk.yellow('  /providers') + ' - List available providers');
  console.log(chalk.yellow('  /providers add <provider>') + ' - Add a provider');
  console.log(chalk.yellow('  /providers remove <provider>') + ' - Remove a provider');
  console.log(chalk.yellow('  /provider <provider> <model>') + ' - Switch to specified provider, model is optional');
  console.log(chalk.yellow('  /models') + ' - List available models');
  console.log(chalk.yellow('  /model <model>') + ' - Switch to specified model');
  console.log(chalk.yellow('  /settings') + ' - List available settings');
  console.log(chalk.yellow('  /setting <setting> <value>') + ' - Update setting');
  console.log(chalk.yellow('  /settings reset') + ' - Reset settings to workspace defaults');
  console.log(chalk.yellow('  /settings save') + ' - Save current settings as workspace defaults');
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

function getWorkspaceSettings(workspace: WorkspaceManager): ChatSessionOptionsWithRequiredSettings {
  return {
    maxChatTurns: getSettingsValue(workspace, MAX_CHAT_TURNS_KEY, MAX_CHAT_TURNS_DEFAULT),
    maxOutputTokens: getSettingsValue(workspace, MAX_OUTPUT_TOKENS_KEY, MAX_OUTPUT_TOKENS_DEFAULT),
    temperature: getSettingsValue(workspace, TEMPERATURE_KEY, TEMPERATURE_DEFAULT),
    topP: getSettingsValue(workspace, TOP_P_KEY, TOP_P_DEFAULT)
  };
}

export function setupCLI(workspace: WorkspaceManager) {
  console.log(chalk.green('Welcome to TeamSpark AI Workbench!'));
  showHelp();
  
  const llmFactory = new LLMFactory(workspace);
  const providersInfo = llmFactory.getProvidersInfo();
  console.log(providersInfo);

  const getProviderByName = (name: string, providersInfo: Record<LLMType, LLMProviderInfo>): LLMType | undefined => {
    for (const [type, info] of Object.entries(providersInfo)) {
      if (type.toLowerCase() === name.toLowerCase()) {
        return type as LLMType;
      }
    }
    return undefined;
  };

  const updatedMostRecentProvider = async (provider: LLMType, modelId: string) => {
    const mostRecentProvider = workspace.getSettingsValue(MOST_RECENT_MODEL_KEY);
    if (mostRecentProvider) {
      await workspace.setSettingsValue(MOST_RECENT_MODEL_KEY, `${provider}:${modelId}`);
    }
  };

  let currentProvider: LLMType | undefined;
  let currentModelId: string | undefined;

  const chatSessionOptions = getWorkspaceSettings(workspace);
 
  const mostRecentModel = workspace.getSettingsValue(MOST_RECENT_MODEL_KEY);
  if (mostRecentModel) {
    const colonIndex = mostRecentModel.indexOf(':');
    if (colonIndex !== -1) {
      const providerId = mostRecentModel.substring(0, colonIndex);
      const modelId = mostRecentModel.substring(colonIndex + 1);
      const provider = getProviderByName(providerId, providersInfo);
      if (provider) { // !!! Need to verify provider is installed
        currentProvider = provider;
        currentModelId = modelId;
        chatSessionOptions.modelProvider = provider;
        chatSessionOptions.modelId = modelId;
      }
    }
  }

  const chatSession = new ChatSession(workspace, chatSessionOptions);


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

        case COMMANDS.PROVIDERS:
          if (args.length === 0) {
            console.log(chalk.cyan('\nAvailable providers:'));
            for (const [type, info] of Object.entries(providersInfo)) {
              // type is LLMType, info is LLMProviderInfo
              const indicator = type === currentProvider ? chalk.green('* ') : '  ';
              console.log(`${indicator}${type}: ${info.name}`);
            }
            console.log('');
          } else if (args[0] == 'add') {
            const providerName = args[1];
            if (providerName) {
              const provider = getProviderByName(providerName, providersInfo);
              if (provider) {
                console.log(chalk.cyan('\nAdd provider:'), chalk.yellow(providerName));
                const providerInfo = providersInfo[provider];
                console.log(chalk.yellow(`  ${providerInfo.name}`));
                console.log(chalk.yellow(`  ${providerInfo.description}`));
                providerInfo.configValues?.forEach((configValue) => {
                  // configValue is ILLMConfigValue
                  console.log(chalk.yellow(`    ${configValue.key}: ${configValue.caption}`));
                });
              } else {
                console.log(chalk.red('Provider not found by name:'), chalk.yellow(providerName));
              }
            } else {
              console.log(chalk.red('No provider name given'));
            }
          } else if (args[0] == 'remove') {
            console.log(chalk.cyan('\nRemove provider:'), chalk.yellow(args[1]));
          } else {
            console.log(chalk.cyan('\nUnknown providers command: '), chalk.yellow(args[1]));
          }
          break;

        case COMMANDS.PROVIDER:
          // Select provider
          //   args[0] (required) provider name
          //   args[1] (optional) is model name, if not provided, use default model for provider
          const providerName = args[0];
          if (providerName) {
            const provider = getProviderByName(providerName, providersInfo);
            if (provider) {
              const llm = llmFactory.create(provider);
              const models = await llm.getModels();
              let modelId = args[1];
              let modelDescription = '';
              if (modelId) {
                // validate modelId is a valid model for the provider
                const model = models.find(m => m.id.toLowerCase() === modelId.toLowerCase());
                if (model) {
                  currentModelId = model.id;
                  modelDescription = `specified model: ${model.name}`;
                } else {
                  console.log(chalk.red('Model not found by name:'), chalk.yellow(modelId));
                  break;
                }
              } else {
                // get default model for provider
                const defaultModel = models[0];
                modelId = defaultModel.id;
                modelDescription = `default model: ${defaultModel.name}`;
              }
              currentProvider = provider;
              currentModelId = modelId;
              chatSession.switchModel(currentProvider, currentModelId);
              await updatedMostRecentProvider(currentProvider, currentModelId);
              console.log(chalk.green(`Switched to ${providerName} using ${modelDescription}`));
            } else {
              console.log(chalk.red('Provider not found by name:'), chalk.yellow(providerName));
            }
          } else {
            console.log(chalk.red('No provider name given'));
          }
          break;

        case COMMANDS.MODELS:
          if (!currentProvider) {
            console.log(chalk.red('No current provider, select a provider before listing models'));
            break;
          }
          console.log(chalk.cyan('\nAvailable models:'));
          try {
            const models = await chatSession.llm?.getModels() || [];
            for (const model of models) {
              const indicator = model.id === currentModelId ? chalk.green('* ') : '  ';
              console.log(chalk.green(`${indicator}${model.id}: ${model.name}`));
            }
          } catch (error: unknown) {
            if (error instanceof Error) {
              console.error(chalk.red('Error listing models:'), error.message);
            } else {
              console.error(chalk.red('Error listing models'));
            }
          }
          break;

        case COMMANDS.MODEL:
          if (!currentProvider) {
            console.log(chalk.red('No current provider, select a provider before selecting a model'));
            break;
          }
          const models = await chatSession.llm?.getModels() || [];
          const modelName = args[0];
          if (modelName) {
            const model = models.find(m => m.id.toLowerCase() === modelName.toLowerCase());
            if (model) {
              currentModelId = model.id;
              chatSession.switchModel(currentProvider, currentModelId);
              await updatedMostRecentProvider(currentProvider, currentModelId);
              console.log(chalk.green(`Switched to ${modelName} on ${currentProvider}`));
            } else {
              console.log(chalk.red('Model not found by name:'), chalk.yellow(modelName));
            }
          } else {
            console.log(chalk.red('No model name given'));
          }
          break;

        case COMMANDS.SETTINGS:
          if (args.length === 0) {
            const settings = chatSession.getState();
            console.log(chalk.cyan('\nSettings:'));
            const sessionMaxChatTurns = settings.maxChatTurns;
            const workspaceMaxChatTurns = getSettingsValue(workspace, MAX_CHAT_TURNS_KEY, MAX_CHAT_TURNS_DEFAULT);
            const sessionMaxOutputTokens = settings.maxOutputTokens;
            const workspaceMaxOutputTokens = getSettingsValue(workspace, MAX_OUTPUT_TOKENS_KEY, MAX_OUTPUT_TOKENS_DEFAULT);
            const sessionTemperature = settings.temperature;
            const workspaceTemperature = getSettingsValue(workspace, TEMPERATURE_KEY, TEMPERATURE_DEFAULT);
            const sessionTopP = settings.topP;
            const workspaceTopP = getSettingsValue(workspace, TOP_P_KEY, TOP_P_DEFAULT);
            // Only if values are different, append "(workspace default: <value>)"
            const maxChatTurns = sessionMaxChatTurns === workspaceMaxChatTurns ? sessionMaxChatTurns : `${sessionMaxChatTurns} (overrides workspace default: ${workspaceMaxChatTurns})`;
            const maxOutputTokens = sessionMaxOutputTokens === workspaceMaxOutputTokens ? sessionMaxOutputTokens : `${sessionMaxOutputTokens} (overrides workspace default: ${workspaceMaxOutputTokens})`;
            const temperature = sessionTemperature === workspaceTemperature ? sessionTemperature : `${sessionTemperature} (overrides workspace default: ${workspaceTemperature})`;
            const topP = sessionTopP === workspaceTopP ? sessionTopP : `${sessionTopP} (overrides workspace default: ${workspaceTopP})`;
            console.log(chalk.yellow(`  ${MAX_CHAT_TURNS_KEY}: ${maxChatTurns}`));
            console.log(chalk.yellow(`  ${MAX_OUTPUT_TOKENS_KEY}: ${maxOutputTokens}`));
            console.log(chalk.yellow(`  ${TEMPERATURE_KEY}: ${temperature}`));
            console.log(chalk.yellow(`  ${TOP_P_KEY}: ${topP}`));
            console.log('');
          } else if (args[0] == 'clear') {
            const settings = getWorkspaceSettings(workspace);
            chatSession.updateSettings(settings);
            console.log(chalk.cyan('\nChat session settings restored to workspace defaults'));
          } else if (args[0] == 'save') {
            const settings = chatSession.getState();
            await workspace.setSettingsValue(MAX_CHAT_TURNS_KEY, settings.maxChatTurns.toString());
            await workspace.setSettingsValue(MAX_OUTPUT_TOKENS_KEY, settings.maxOutputTokens.toString());
            await workspace.setSettingsValue(TEMPERATURE_KEY, settings.temperature.toString());
            await workspace.setSettingsValue(TOP_P_KEY, settings.topP.toString());
            console.log(chalk.cyan('\nChat session settings saved to workspace'));
          } else {
            console.log(chalk.cyan('\nUnknown settings command: '), chalk.yellow(args[1]));
          }
          break;

        case COMMANDS.SETTING:
          const key = args[0];
          const value = args[1];
          const settings = chatSession.getState();
          if (key == MAX_CHAT_TURNS_KEY) {
            const maxChatTurns = parseInt(value);
            if (isNaN(maxChatTurns) || maxChatTurns < 1 || maxChatTurns > 500) {
              console.log(chalk.red('Invalid max chat turns (must be between 1 and 500): '), chalk.yellow(value));
              break;
            }
            chatSession.updateSettings({...settings, maxChatTurns});
          } else if (key == MAX_OUTPUT_TOKENS_KEY) {
            const maxOutputTokens = parseInt(value);
            if (isNaN(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 100000) {
              console.log(chalk.red('Invalid max output tokens (must be between 1 and 100000): '), chalk.yellow(value));
              break;
            }
            chatSession.updateSettings({...settings, maxOutputTokens});
          } else if (key == TEMPERATURE_KEY) {
            const temperature = parseFloat(value);
            if (isNaN(temperature) || temperature < 0 || temperature > 1) {
              console.log(chalk.red('Invalid temperature (must be between 0 and 1): '), chalk.yellow(value));
              break;
            }
            chatSession.updateSettings({...settings, temperature});
          } else if (key == TOP_P_KEY) {
            const topP = parseFloat(value);
            if (isNaN(topP) || topP < 0 || topP > 1) {
              console.log(chalk.red('Invalid topP (must be between 0 and 1): '), chalk.yellow(value));
              break;
            }
            chatSession.updateSettings({...settings, topP});
          } else {
            console.log(chalk.red('Unknown setting: '), chalk.yellow(key));
            break;
          }
          console.log(chalk.green(`Set ${key} to`), chalk.yellow(value));
          break;

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
    
    if (!currentProvider) {
      console.log(chalk.red('No current provider, select a provider before sending a message'));
      return true;
    }

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
        const displayName = currentProvider ? currentProvider : "No Provider";
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