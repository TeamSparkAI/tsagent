import chalk from 'chalk';
import ora from 'ora';
import { read } from 'read';
import log from 'electron-log';

import { LLMProviderInfo, LLMType } from '../shared/llm';
import { Tool } from '@modelcontextprotocol/sdk/types';
import { ChatSession, ChatSessionOptionsWithRequiredSettings } from '../main/state/ChatSession';
import { MessageUpdate, ChatMessage, ToolCallDecision, TOOL_CALL_DECISION_ALLOW_SESSION, TOOL_CALL_DECISION_ALLOW_ONCE, TOOL_CALL_DECISION_DENY, ToolCallApproval } from '../shared/ChatSession';
import { WorkspaceManager } from '../main/state/WorkspaceManager';
import { 
  MAX_CHAT_TURNS_KEY, 
  MAX_CHAT_TURNS_DEFAULT, 
  MAX_OUTPUT_TOKENS_KEY, 
  MAX_OUTPUT_TOKENS_DEFAULT, 
  TEMPERATURE_KEY, 
  TEMPERATURE_DEFAULT, 
  TOP_P_KEY, 
  TOP_P_DEFAULT,
  SESSION_TOOL_PERMISSION_KEY,
  SESSION_TOOL_PERMISSION_DEFAULT,
  SESSION_TOOL_PERMISSION_ALWAYS,
  SESSION_TOOL_PERMISSION_NEVER,
  SESSION_TOOL_PERMISSION_TOOL,
  SessionToolPermission,
  MOST_RECENT_MODEL_KEY
} from '../shared/workspace';
import { LLMFactory } from '../main/llm/llmFactory';
import path from 'path';
import * as fs from 'fs';

import { ModelReply } from '../shared/ModelReply';

// Define commands
const COMMANDS = {
  HELP: '/help',
  LICENSE: '/license',
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
  console.log(chalk.yellow('  /license') + ' - Show the license agreement');
  console.log(chalk.yellow('  /providers') + ' - List available providers (* active)');
  console.log(chalk.yellow('  /providers add <provider>') + ' - Add a provider');
  console.log(chalk.yellow('  /providers remove <provider>') + ' - Remove a provider');
  console.log(chalk.yellow('  /provider <provider> <model>') + ' - Switch to specified provider, model is optional');
  console.log(chalk.yellow('  /models') + ' - List available models (* active)');
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

function indent(text: string, indent: number = 2, allLines: boolean = true): string {
  const lines = text.split('\n');
  if (lines.length === 1) {
    return allLines ? ' '.repeat(indent) + text : text;
  }
  if (allLines) {
    return lines.map(line => ' '.repeat(indent) + line).join('\n');
  }
  return lines[0] + '\n' + lines.slice(1).map(line => ' '.repeat(indent) + line).join('\n');
}

function getSettingsValue(workspace: WorkspaceManager, key: string, defaultValue: number): number {
  const settingsValue = workspace.getSettingsValue(key);
  return settingsValue ? parseFloat(settingsValue) : defaultValue;
}

function getToolPermissionValue(workspace: WorkspaceManager, key: string, defaultValue: SessionToolPermission): SessionToolPermission {
  const value = workspace.getSettingsValue(key);
  if (!value) return defaultValue;
  if (value !== SESSION_TOOL_PERMISSION_ALWAYS && 
      value !== SESSION_TOOL_PERMISSION_NEVER && 
      value !== SESSION_TOOL_PERMISSION_TOOL) {
    return defaultValue;
  }
  return value as SessionToolPermission;
}

function getWorkspaceSettings(workspace: WorkspaceManager): ChatSessionOptionsWithRequiredSettings {
  return {
    maxChatTurns: getSettingsValue(workspace, MAX_CHAT_TURNS_KEY, MAX_CHAT_TURNS_DEFAULT),
    maxOutputTokens: getSettingsValue(workspace, MAX_OUTPUT_TOKENS_KEY, MAX_OUTPUT_TOKENS_DEFAULT),
    temperature: getSettingsValue(workspace, TEMPERATURE_KEY, TEMPERATURE_DEFAULT),
    topP: getSettingsValue(workspace, TOP_P_KEY, TOP_P_DEFAULT),
    toolPermission: getToolPermissionValue(workspace, SESSION_TOOL_PERMISSION_KEY, SESSION_TOOL_PERMISSION_DEFAULT)
  };
}

function isProviderInstalled(workspace: WorkspaceManager, providerName: string): boolean {
  return workspace.getInstalledProviders().includes(providerName);
}

export function setupCLI(workspace: WorkspaceManager, version: string) {
  // Get version from package.json
  console.log(chalk.green(`Welcome to TeamSpark AI Workbench v${version}!`));
  showHelp();
  
  const llmFactory = new LLMFactory(workspace);
  const providersInfo = llmFactory.getProvidersInfo();

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

  function createChatSession(): ChatSession {
    const chatSessionOptions = getWorkspaceSettings(workspace);
 
    const mostRecentModel = workspace.getSettingsValue(MOST_RECENT_MODEL_KEY);
    if (mostRecentModel) {
      const colonIndex = mostRecentModel.indexOf(':');
      if (colonIndex !== -1) {
        const providerId = mostRecentModel.substring(0, colonIndex);
        const modelId = mostRecentModel.substring(colonIndex + 1);
        const provider = getProviderByName(providerId, providersInfo);
        if (provider) { // !!! Need to verify provider is installed
          chatSessionOptions.modelProvider = provider;
          chatSessionOptions.modelId = modelId;
        }
      }
    }
  
    return new ChatSession(workspace, chatSessionOptions);
  }  

  let chatSession = createChatSession();
  currentProvider = chatSession.getState().currentModelProvider;
  currentModelId = chatSession.getState().currentModelId;

  const commandHistory: string[] = [];
  async function addToCommandHistory(command: string) {
    commandHistory.unshift(command);
    if (commandHistory.length > 10) {
      commandHistory.shift();
    }
  }

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

      addToCommandHistory(command);

      switch (commandName) {
        case COMMANDS.HELP:
          showHelp();
          break;

        case COMMANDS.LICENSE:
          // Load license agreeement from license.md and display it
          const licensePath = path.join(__dirname, '..', 'LICENSE.md');
          const licenseText = await fs.promises.readFile(licensePath, 'utf-8');
          console.log(chalk.yellow(licenseText));
          break;

        case COMMANDS.QUIT:
        case COMMANDS.EXIT:
          console.log(chalk.green('Goodbye!'));
          return false; // Signal to stop the loop

        case COMMANDS.PROVIDERS:
          if (args.length === 0) {
            const installedProviders = workspace.getInstalledProviders();
            const nonInstalledProviders = Object.entries(providersInfo).filter(([type, info]) => !installedProviders.includes(type));
            if (installedProviders.length === 0) {
              console.log(chalk.cyan('No providers installed'));
            } else {
              console.log(chalk.cyan(`Providers installed and available:`));
              installedProviders.forEach(provider => {
                const indicator = provider === currentProvider ? chalk.green('* ') : '  ';
                console.log(chalk.yellow(`${indicator}${provider}: ${providersInfo[provider as LLMType].name}`));
              });
            }
            if (nonInstalledProviders.length === 0) {
              console.log(chalk.cyan('No providers available to install'));
            } else {
              console.log(chalk.cyan(`Providers available to install:`));
              nonInstalledProviders.forEach(([type, info]) => {
                console.log(chalk.yellow(`  ${type}: ${info.name}`));
              });
            }
            console.log('');
          } else if (args[0] == 'add') {
            const providerName = args[1];
            if (providerName) {
              const provider = getProviderByName(providerName, providersInfo);
              if (provider) {
                if (isProviderInstalled(workspace, providerName)) {
                  console.log(chalk.red('Provider already installed:'), chalk.yellow(providerName));
                  break;
                }
                console.log(chalk.cyan('\nAdd provider:'), chalk.yellow(providerName));
                const providerInfo = providersInfo[provider];
                console.log(chalk.yellow(`  ${providerInfo.name}`));
                console.log(chalk.yellow(`  ${providerInfo.description}`));
                const configValues: Record<string, string> = {};
                for (const configValue of providerInfo.configValues || []) {
                  console.log(chalk.yellow(`    ${configValue.key}: ${configValue.caption}`));
                  const value = await collectInput(chalk.green(`    ${configValue.key}:`), { isCommand: false, isPassword: configValue.secret, defaultValue: configValue.default });
                  if (configValue.required && !value) {
                    console.log(chalk.red('Required value not supplied, provider not added'));
                    return true;
                  }
                  configValues[configValue.key] = value;
                }
                await workspace.addProvider(providerName);
                for (const [key, value] of Object.entries(configValues)) {
                  await workspace.setProviderSettingsValue(providerName, key, value);
                }
                console.log(chalk.green('Provider added:'), chalk.yellow(providerName));
              } else {
                console.log(chalk.red('Provider not found by name:'), chalk.yellow(providerName));
              }
            } else {
              console.log(chalk.red('No provider name given'));
            }
          } else if (args[0] == 'remove') {
            const providerName = args[1];
            if (providerName) {
              if (isProviderInstalled(workspace, providerName)) {
                console.log(chalk.cyan('\nRemove provider:'), chalk.yellow(providerName));
                await workspace.removeProvider(providerName);
                if (currentProvider === providerName) {
                  currentProvider = undefined;
                  currentModelId = undefined;
                  chatSession.clearModel();
                  console.log(chalk.green('Active provider removed:'), chalk.yellow(providerName));
                } else {
                  console.log(chalk.green('Provider removed:'), chalk.yellow(providerName));
                }
              } else {
                console.log(chalk.red('Provider not installed:'), chalk.yellow(providerName));
              }
            } else {
              console.log(chalk.red('No provider name given'));
            }
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
            const sessionToolPermission = settings.toolPermission;
            const workspaceToolPermission = getToolPermissionValue(workspace, SESSION_TOOL_PERMISSION_KEY, SESSION_TOOL_PERMISSION_DEFAULT);
            // Only if values are different, append "(workspace default: <value>)"
            const maxChatTurns = sessionMaxChatTurns === workspaceMaxChatTurns ? sessionMaxChatTurns : `${sessionMaxChatTurns} (overrides workspace default: ${workspaceMaxChatTurns})`;
            const maxOutputTokens = sessionMaxOutputTokens === workspaceMaxOutputTokens ? sessionMaxOutputTokens : `${sessionMaxOutputTokens} (overrides workspace default: ${workspaceMaxOutputTokens})`;
            const temperature = sessionTemperature === workspaceTemperature ? sessionTemperature : `${sessionTemperature} (overrides workspace default: ${workspaceTemperature})`;
            const topP = sessionTopP === workspaceTopP ? sessionTopP : `${sessionTopP} (overrides workspace default: ${workspaceTopP})`;
            const toolPermission = sessionToolPermission === workspaceToolPermission ? sessionToolPermission : `${sessionToolPermission} (overrides workspace default: ${workspaceToolPermission})`;
            console.log(chalk.yellow(`  ${MAX_CHAT_TURNS_KEY}: ${maxChatTurns}`));
            console.log(chalk.yellow(`  ${MAX_OUTPUT_TOKENS_KEY}: ${maxOutputTokens}`));
            console.log(chalk.yellow(`  ${TEMPERATURE_KEY}: ${temperature}`));
            console.log(chalk.yellow(`  ${TOP_P_KEY}: ${topP}`));
            console.log(chalk.yellow(`  ${SESSION_TOOL_PERMISSION_KEY}: ${toolPermission}`));
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
            await workspace.setSettingsValue(SESSION_TOOL_PERMISSION_KEY, settings.toolPermission);
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
          } else if (key == SESSION_TOOL_PERMISSION_KEY) {
            if (value !== SESSION_TOOL_PERMISSION_ALWAYS && 
                value !== SESSION_TOOL_PERMISSION_NEVER && 
                value !== SESSION_TOOL_PERMISSION_TOOL) {
              console.log(chalk.red('Invalid tool permission (must be one of: always, never, tool): '), chalk.yellow(value));
              break;
            }
            chatSession.updateSettings({...settings, toolPermission: value as SessionToolPermission});
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
          console.clear();
          chatSession = createChatSession();
          currentProvider = chatSession.getState().currentModelProvider;
          currentModelId = chatSession.getState().currentModelId;
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
      const spinner = ora({
        text: 'Thinking...',
        stream: process.platform === 'darwin' ? process.stdout : process.stderr // We are blocking stderr on MacOS (to hide warnings)
      })
      
      spinner.start();
      
      // Add timeout to prevent infinite hanging
      const messageUpdate = await Promise.race<MessageUpdate>([
        chatSession.handleMessage(input),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("Request timed out after 60 seconds")), 60000)
        )
      ]);
      
      spinner.stop();
      
      function getAssistantUpdate(update: MessageUpdate | null): (ChatMessage & { role: 'assistant', modelReply: ModelReply }) | null {
        // Find the first assistant update
        if (update) {
          for (const message of update.updates) {
            if (message.role === 'assistant' && 'modelReply' in message) {
              return message as ChatMessage & { role: 'assistant', modelReply: ModelReply };
            }
          }
        }
        return null;
      }

      // Process message updates and handle any tool call approvals (loop until no more tool call approvals)
      let assistantUpdate = getAssistantUpdate(messageUpdate);
      while (assistantUpdate) {
        for (const turn of assistantUpdate.modelReply.turns) {
          if (turn.message) {
            console.log(`\n${turn.message}`);
          }
          if (turn.toolCalls) {
            for (const toolCall of turn.toolCalls) {
              console.log(chalk.cyan(`\nTool call: ${toolCall.toolName}`));
              console.log(chalk.dim(indent(`Arguments: ${JSON.stringify(toolCall.args, null, 2)}`)));
              if (toolCall.output) {
                console.log(chalk.dim(indent(`Output:`)));
                console.log(chalk.dim(indent(toolCall.output, 4)));
              }
              if (toolCall.error) {
                console.log(chalk.red(indent(`Error:`)));
                console.log(chalk.dim(indent(toolCall.error, 4)));
              }
            }
          }
        }

        // Handle tool call permission requests
        if (assistantUpdate.modelReply.pendingToolCalls && assistantUpdate.modelReply.pendingToolCalls.length > 0) {
          console.log(chalk.yellow('Tool calls requiring approval:'));
          
          // Collect all tool call approvals
          const toolCallApprovals: ToolCallApproval[] = [];
          
          for (const toolCall of assistantUpdate.modelReply.pendingToolCalls) {
            console.log(chalk.cyan(`\nTool: ${toolCall.serverName}.${toolCall.toolName}`));
            console.log(chalk.dim(indent(`Arguments: ${JSON.stringify(toolCall.args, null, 2)}`)));
            
            // Prompt for approval until we get a valid answer
            let decision: ToolCallDecision | null = null;
            
            while (!decision) {
              const answer = await read({
                prompt: chalk.yellow('Allow for this (s)ession, allow (o)nce, or (d)eny? [s/o/d]: '),
                default: 'o'
              });
              
              if (answer.toLowerCase() === 's') {
                decision = TOOL_CALL_DECISION_ALLOW_SESSION;
              } else if (answer.toLowerCase() === 'o') {
                decision = TOOL_CALL_DECISION_ALLOW_ONCE;
              } else if (answer.toLowerCase() === 'd') {
                decision = TOOL_CALL_DECISION_DENY;
              } else {
                console.log(chalk.red('Invalid answer. Please enter s, o, or d.'));
              }
            }
            
            toolCallApprovals.push({
              serverName: toolCall.serverName,
              toolName: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              args: toolCall.args,
              decision,
            });
          }
          
          // Send approval message
          const approvalMessage: ChatMessage = {
            role: 'approval',
            toolCallApprovals
          };
          
          // Send the approval message and get response
          const responseUpdate = await chatSession.handleMessage(approvalMessage);
          assistantUpdate = getAssistantUpdate(responseUpdate);
        } else {
          assistantUpdate = null; // No more pending tool calls, exit the loop
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

  async function collectInput(prompt: string, options: { isCommand?: boolean; isPassword?: boolean; defaultValue?: string } = {}): Promise<string> {
    const { isCommand = true, isPassword = false, defaultValue = '' } = options;
    // We track command history and we want "read" to show those commands, but we don't want "read" to add to them (including collected params, passwords, etc)
    // And we don't want to show the command history in the prompt if we're not collecting a command
    const disposableHistory = isCommand ? [...commandHistory] : []; 
    const result = await read({
      prompt,
      silent: isPassword,
      replace: isPassword ? '*' : '',
      terminal: true,
      default: defaultValue,
      edit: defaultValue !== undefined,
      history: disposableHistory
    });
    return result.toString();
  }

  async function runCLI() {
    let running = true;
    try {
      while (running) {
        const displayName = currentProvider ? currentProvider : "No Provider";
        try {
          const input = await collectInput(chalk.cyan(`${displayName}>`));
          running = await processInput(input);
        } catch (error) {
          if (error instanceof Error && error.message.includes('canceled')) {
            console.log(chalk.yellow('Input cancelled via Ctrl+C'));
            running = false;
          } else {
            console.error(chalk.red('Error in CLI loop:'), error);
          }
        }
      }
      console.log(chalk.green('Exiting application.'));
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Fatal error in CLI:'), error);
      process.exit(1);
    }
  }

  runCLI();
  return;
} 