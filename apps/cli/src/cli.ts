import chalk from 'chalk';
import ora from 'ora';
import { read } from 'read';
import path from 'path';
import * as fs from 'fs';

import { PRODUCT_NAME } from './main.js';

import { 
  Agent, 
  ChatMessage, 
  ChatSessionOptionsWithRequiredSettings,
  MessageUpdate, 
  ModelReply,
  ProviderType, 
  SessionToolPermission,
  Tool,
  ToolCallApproval, 
  ToolCallDecision, 
  SETTINGS_KEY_MAX_CHAT_TURNS, 
  SETTINGS_DEFAULT_MAX_CHAT_TURNS, 
  SETTINGS_KEY_MAX_OUTPUT_TOKENS, 
  SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS, 
  SETTINGS_KEY_MOST_RECENT_MODEL,
  SESSION_TOOL_PERMISSION_KEY,
  SESSION_TOOL_PERMISSION_DEFAULT,
  SESSION_TOOL_PERMISSION_ALWAYS,
  SESSION_TOOL_PERMISSION_NEVER,
  SESSION_TOOL_PERMISSION_TOOL,
  SETTINGS_KEY_TEMPERATURE, 
  SETTINGS_DEFAULT_TEMPERATURE, 
  SETTINGS_KEY_CONTEXT_TOP_K,
  SETTINGS_DEFAULT_CONTEXT_TOP_K,
  SETTINGS_KEY_CONTEXT_TOP_N,
  SETTINGS_DEFAULT_CONTEXT_TOP_N,
  SETTINGS_KEY_CONTEXT_INCLUDE_SCORE,
  SETTINGS_DEFAULT_CONTEXT_INCLUDE_SCORE,
  TOOL_CALL_DECISION_ALLOW_SESSION, 
  TOOL_CALL_DECISION_ALLOW_ONCE, 
  TOOL_CALL_DECISION_DENY, 
  SETTINGS_KEY_TOP_P, 
  SETTINGS_DEFAULT_TOP_P,
  populateModelFromSettings
} from '@tsagent/core';

import { WinstonLoggerAdapter } from './logger.js';

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
  AGENT: '/agent'
};

async function toolsCommand(agent: Agent, chatSession: any, logger: WinstonLoggerAdapter) {
  try {
    console.log('Checking available tools on MCP servers...\n');

    // Get active tools in session context
    const activeTools = chatSession.getIncludedTools();
    const activeToolSet = new Set(activeTools.map((t: any) => `${t.serverName}:${t.toolName}`));

    // Get all server configurations
    const mcpServers = await agent.getAllMcpServers();
    
    // Get client for each server
    for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
      const mcpClient = await agent.getMcpClient(serverName);
      if (!mcpClient) {
        console.log(chalk.red(`Server ${serverName}: Not connected`));
        continue;
      }
      
      console.log(chalk.cyan.bold(`Server: ${mcpClient.serverVersion?.name}`));
      console.log(chalk.dim('------------------------'));        
      if (mcpClient.serverTools.length === 0) {
        console.log('No tools available');
      } else {
        mcpClient.serverTools.forEach((tool: Tool) => {
          const toolKey = `${serverName}:${tool.name}`;
          const isActive = activeToolSet.has(toolKey);
          const marker = isActive ? chalk.green('* ') : chalk.dim('- ');
          const toolName = chalk.yellow(tool.name);
          const description = tool.description || 'No description';
          
          // Format description: max 80 chars, proper word wrap with indentation
          if (description.length > 80) {
            const firstLine = description.substring(0, 80).split(' ').slice(0, -1).join(' ');
            console.log(`${marker}${toolName}`);
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
            console.log(`${marker}${toolName}: ${description}`);
          }
        });
      }
      console.log('\n');
    }
  } catch (error) {
    logger.error('Error in tools command:', error);
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
  console.log(chalk.yellow('  /settings reset') + ' - Reset settings to agent defaults');
  console.log(chalk.yellow('  /settings save') + ' - Save current settings as agent defaults');
  console.log(chalk.yellow('  /tools') + ' - List available tools from all configured MCP servers');
  console.log(chalk.yellow('  /tools include --server <name> [--tool <name>]') + ' - Include tool(s) in session context');
  console.log(chalk.yellow('  /tools exclude --server <name> [--tool <name>]') + ' - Exclude tool(s) from session context');
  console.log(chalk.yellow('  /rules') + ' - List all rules (* active, - inactive)');
  console.log(chalk.yellow('  /rules include <name>') + ' - Include rule in session context');
  console.log(chalk.yellow('  /rules exclude <name>') + ' - Exclude rule from session context');
  console.log(chalk.yellow('  /references') + ' - List all references (* active, - inactive)');
  console.log(chalk.yellow('  /references include <name>') + ' - Include reference in session context');
  console.log(chalk.yellow('  /references exclude <name>') + ' - Exclude reference from session context');
  console.log(chalk.yellow('  /stats') + ' - Display statistics for the current chat session');
  console.log(chalk.yellow('  /agent') + ' - Display the current agent path');
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

function getSettingsValue(agent: Agent, key: string, defaultValue: number): number {
  const settingsValue = agent.getSetting(key);
  return settingsValue ? parseFloat(settingsValue) : defaultValue;
}

function getToolPermissionValue(agent: Agent, key: string, defaultValue: SessionToolPermission): SessionToolPermission {
  const value = agent.getSetting(key);
  if (!value) return defaultValue;
  if (value !== SESSION_TOOL_PERMISSION_ALWAYS && 
      value !== SESSION_TOOL_PERMISSION_NEVER && 
      value !== SESSION_TOOL_PERMISSION_TOOL) {
    return defaultValue;
  }
  return value as SessionToolPermission;
}

function getProviderByName(name: string): ProviderType | undefined {
  const providerType = Object.values(ProviderType).find(
    (p: ProviderType) => p.toLowerCase() === name.toLowerCase()
  );
  return providerType;
}

function getAgentSettings(agent: Agent): ChatSessionOptionsWithRequiredSettings {
  return {
    maxChatTurns: getSettingsValue(agent, SETTINGS_KEY_MAX_CHAT_TURNS, SETTINGS_DEFAULT_MAX_CHAT_TURNS),
    maxOutputTokens: getSettingsValue(agent, SETTINGS_KEY_MAX_OUTPUT_TOKENS, SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS),
    temperature: getSettingsValue(agent, SETTINGS_KEY_TEMPERATURE, SETTINGS_DEFAULT_TEMPERATURE),
    topP: getSettingsValue(agent, SETTINGS_KEY_TOP_P, SETTINGS_DEFAULT_TOP_P),
    toolPermission: getToolPermissionValue(agent, SESSION_TOOL_PERMISSION_KEY, SESSION_TOOL_PERMISSION_DEFAULT),
    contextTopK: getSettingsValue(agent, SETTINGS_KEY_CONTEXT_TOP_K, SETTINGS_DEFAULT_CONTEXT_TOP_K),
    contextTopN: getSettingsValue(agent, SETTINGS_KEY_CONTEXT_TOP_N, SETTINGS_DEFAULT_CONTEXT_TOP_N),
    contextIncludeScore: getSettingsValue(agent, SETTINGS_KEY_CONTEXT_INCLUDE_SCORE, SETTINGS_DEFAULT_CONTEXT_INCLUDE_SCORE)
  };
}

const isProviderInstalled = (agent: Agent, providerName: string): boolean => {
  const providerType = getProviderByName(providerName);
  return providerType ? agent.isProviderInstalled(providerType) : false;
};

export function setupCLI(agent: Agent, version: string, logger: WinstonLoggerAdapter) {
  // Get version from package.json
  console.log(chalk.green(`Welcome to ${PRODUCT_NAME} v${version}!`));
  showHelp();

  const updatedMostRecentProvider = async (provider: ProviderType, modelId: string) => {
    const mostRecentProvider = agent.getSetting(SETTINGS_KEY_MOST_RECENT_MODEL);
    if (mostRecentProvider) {
      await agent.setSetting(SETTINGS_KEY_MOST_RECENT_MODEL, `${provider}:${modelId}`);
    }
  };

  let currentProvider: ProviderType | undefined;
  let currentModelId: string | undefined;

  function createLocalChatSession() {
    const chatSessionOptions = getAgentSettings(agent);
    populateModelFromSettings(agent, chatSessionOptions);
    return agent.createChatSession('cli-session', chatSessionOptions);
  }  

  let chatSession = createLocalChatSession();
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
          // Load license agreement from LICENSE.md and display it
          try {
            const licensePath = path.join(process.cwd(), 'LICENSE.md');
            const licenseText = await fs.promises.readFile(licensePath, 'utf-8');
            console.log(chalk.yellow(licenseText));
          } catch (error) {
            console.log(chalk.red('Could not load license file. Please ensure LICENSE.md exists in the current directory.'));
            logger.error('Error loading license file:', error);
          }
          break;

        case COMMANDS.QUIT:
        case COMMANDS.EXIT:
          console.log(chalk.green('Goodbye!'));
          return false; // Signal to stop the loop

        case COMMANDS.PROVIDERS:
          if (args.length === 0) {
            const installedProviders = agent.getInstalledProviders();
            const availableProviders = agent.getAvailableProviders();
            const nonInstalledProviders = availableProviders.filter((p: ProviderType) => !installedProviders.includes(p));
            
            if (installedProviders.length === 0) {
              console.log(chalk.cyan('No providers installed'));
            } else {
              console.log(chalk.cyan(`Providers installed and available:`));
              installedProviders.forEach((provider: ProviderType) => {
                const indicator = provider === currentProvider ? chalk.green('* ') : '  ';
                const providerInfo = agent.getProviderInfo(provider);
                console.log(chalk.yellow(`${indicator}${provider}: ${providerInfo.name}`));
              });
            }
            if (nonInstalledProviders.length === 0) {
              console.log(chalk.cyan('No providers available to install'));
            } else {
              console.log(chalk.cyan(`Providers available to install:`));
              nonInstalledProviders.forEach((provider: ProviderType) => {
                const providerInfo = agent.getProviderInfo(provider);
                console.log(chalk.yellow(`  ${provider}: ${providerInfo.name}`));
              });
            }
            console.log('');
          } else if (args[0] == 'add') {
            const providerName = args[1];
            if (providerName) {
              const provider = getProviderByName(providerName);
              if (provider) {
                if (agent.isProviderInstalled(provider)) {
                  console.log(chalk.red('Provider already installed:'), chalk.yellow(providerName));
                  break;
                }
                console.log(chalk.cyan('\nAdd provider:'), chalk.yellow(providerName));
                const providerInfo = agent.getProviderInfo(provider);
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
                await agent.installProvider(provider, configValues);
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
              const provider = getProviderByName(providerName);
              if (provider && agent.isProviderInstalled(provider)) {
                console.log(chalk.cyan('\nRemove provider:'), chalk.yellow(providerName));
                await agent.uninstallProvider(provider);
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
            const provider = getProviderByName(providerName);
            if (provider) {
              const models = await agent.getProviderModels(provider);
              let modelId = args[1];
              let modelDescription = '';
              if (modelId) {
                // validate modelId is a valid model for the provider
                const model = models.find((m: any) => m.id.toLowerCase() === modelId.toLowerCase());
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
              if (currentProvider && currentModelId) {
                chatSession.switchModel(currentProvider, currentModelId);
                await updatedMostRecentProvider(currentProvider, currentModelId);
              }
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
            const models = await agent.getProviderModels(currentProvider);
            for (const model of models) {
              const indicator = model.id === currentModelId ? chalk.green('* ') : '  ';
              console.log(chalk.green(`${indicator}${model.id}: ${model.name}`));
            }
          } catch (error: unknown) {
            if (error instanceof Error) {
              console.log(chalk.red('Error listing models:'), error.message);
            } else {
              console.log(chalk.red('Error listing models'));
            }
          }
          break;

        case COMMANDS.MODEL:
          if (!currentProvider) {
            console.log(chalk.red('No current provider, select a provider before selecting a model'));
            break;
          }
          const models = await agent.getProviderModels(currentProvider);
          const modelName = args[0];
          if (modelName) {
            const model = models.find((m: any) => m.id.toLowerCase() === modelName.toLowerCase());
            if (model && currentProvider) {
              currentModelId = model.id;
              chatSession.switchModel(currentProvider, currentModelId!);
              await updatedMostRecentProvider(currentProvider, currentModelId!);
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
            const agentMaxChatTurns = getSettingsValue(agent, SETTINGS_KEY_MAX_CHAT_TURNS, SETTINGS_DEFAULT_MAX_CHAT_TURNS);
            const sessionMaxOutputTokens = settings.maxOutputTokens;
            const agentMaxOutputTokens = getSettingsValue(agent, SETTINGS_KEY_MAX_OUTPUT_TOKENS, SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS);
            const sessionTemperature = settings.temperature;
            const agentTemperature = getSettingsValue(agent, SETTINGS_KEY_TEMPERATURE, SETTINGS_DEFAULT_TEMPERATURE);
            const sessionTopP = settings.topP;
            const agentTopP = getSettingsValue(agent, SETTINGS_KEY_TOP_P, SETTINGS_DEFAULT_TOP_P);
            const sessionToolPermission = settings.toolPermission;
            const agentToolPermission = getToolPermissionValue(agent, SESSION_TOOL_PERMISSION_KEY, SESSION_TOOL_PERMISSION_DEFAULT);
            const sessionContextTopK = settings.contextTopK;
            const agentContextTopK = getSettingsValue(agent, SETTINGS_KEY_CONTEXT_TOP_K, SETTINGS_DEFAULT_CONTEXT_TOP_K);
            const sessionContextTopN = settings.contextTopN;
            const agentContextTopN = getSettingsValue(agent, SETTINGS_KEY_CONTEXT_TOP_N, SETTINGS_DEFAULT_CONTEXT_TOP_N);
            const sessionContextIncludeScore = settings.contextIncludeScore;
            const agentContextIncludeScore = getSettingsValue(agent, SETTINGS_KEY_CONTEXT_INCLUDE_SCORE, SETTINGS_DEFAULT_CONTEXT_INCLUDE_SCORE);
            // Only if values are different, append "(agent default: <value>)"
            const maxChatTurns = sessionMaxChatTurns === agentMaxChatTurns ? sessionMaxChatTurns : `${sessionMaxChatTurns} (overrides agent default: ${agentMaxChatTurns})`;
            const maxOutputTokens = sessionMaxOutputTokens === agentMaxOutputTokens ? sessionMaxOutputTokens : `${sessionMaxOutputTokens} (overrides agent default: ${agentMaxOutputTokens})`;
            const temperature = sessionTemperature === agentTemperature ? sessionTemperature : `${sessionTemperature} (overrides agent default: ${agentTemperature})`;
            const topP = sessionTopP === agentTopP ? sessionTopP : `${sessionTopP} (overrides agent default: ${agentTopP})`;
            const toolPermission = sessionToolPermission === agentToolPermission ? sessionToolPermission : `${sessionToolPermission} (overrides agent default: ${agentToolPermission})`;
            const contextTopK = sessionContextTopK === agentContextTopK ? sessionContextTopK : `${sessionContextTopK} (overrides agent default: ${agentContextTopK})`;
            const contextTopN = sessionContextTopN === agentContextTopN ? sessionContextTopN : `${sessionContextTopN} (overrides agent default: ${agentContextTopN})`;
            const contextIncludeScore = sessionContextIncludeScore === agentContextIncludeScore ? sessionContextIncludeScore : `${sessionContextIncludeScore} (overrides agent default: ${agentContextIncludeScore})`;
            console.log(chalk.yellow(`  ${SETTINGS_KEY_MAX_CHAT_TURNS}: ${maxChatTurns}`));
            console.log(chalk.yellow(`  ${SETTINGS_KEY_MAX_OUTPUT_TOKENS}: ${maxOutputTokens}`));
            console.log(chalk.yellow(`  ${SETTINGS_KEY_TEMPERATURE}: ${temperature}`));
            console.log(chalk.yellow(`  ${SETTINGS_KEY_TOP_P}: ${topP}`));
            console.log(chalk.yellow(`  ${SESSION_TOOL_PERMISSION_KEY}: ${toolPermission}`));
            console.log(chalk.cyan('\n  Agent Context Selection:'));
            console.log(chalk.yellow(`    ${SETTINGS_KEY_CONTEXT_TOP_K}: ${contextTopK}`));
            console.log(chalk.yellow(`    ${SETTINGS_KEY_CONTEXT_TOP_N}: ${contextTopN}`));
            console.log(chalk.yellow(`    ${SETTINGS_KEY_CONTEXT_INCLUDE_SCORE}: ${contextIncludeScore}`));
            console.log('');
          } else if (args[0] == 'clear') {
            const settings = getAgentSettings(agent);
            chatSession.updateSettings(settings);
            console.log(chalk.cyan('\nChat session settings restored to agent defaults'));
          } else if (args[0] == 'save') {
            const settings = chatSession.getState();
            await agent.setSetting(SETTINGS_KEY_MAX_CHAT_TURNS, settings.maxChatTurns.toString());
            await agent.setSetting(SETTINGS_KEY_MAX_OUTPUT_TOKENS, settings.maxOutputTokens.toString());
            await agent.setSetting(SETTINGS_KEY_TEMPERATURE, settings.temperature.toString());
            await agent.setSetting(SETTINGS_KEY_TOP_P, settings.topP.toString());
            await agent.setSetting(SESSION_TOOL_PERMISSION_KEY, settings.toolPermission);
            await agent.setSetting(SETTINGS_KEY_CONTEXT_TOP_K, settings.contextTopK.toString());
            await agent.setSetting(SETTINGS_KEY_CONTEXT_TOP_N, settings.contextTopN.toString());
            await agent.setSetting(SETTINGS_KEY_CONTEXT_INCLUDE_SCORE, settings.contextIncludeScore.toString());
            console.log(chalk.cyan('\nChat session settings saved to agent'));
          } else {
            console.log(chalk.cyan('\nUnknown settings command: '), chalk.yellow(args[1]));
          }
          break;

        case COMMANDS.SETTING:
          const key = args[0];
          const value = args[1];
          const settings = chatSession.getState();
          if (key == SETTINGS_KEY_MAX_CHAT_TURNS) {
            const maxChatTurns = parseInt(value);
            if (isNaN(maxChatTurns) || maxChatTurns < 1 || maxChatTurns > 500) {
              console.log(chalk.red('Invalid max chat turns (must be between 1 and 500): '), chalk.yellow(value));
              break;
            }
            chatSession.updateSettings({...settings, maxChatTurns});
          } else if (key == SETTINGS_KEY_MAX_OUTPUT_TOKENS) {
            const maxOutputTokens = parseInt(value);
            if (isNaN(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 100000) {
              console.log(chalk.red('Invalid max output tokens (must be between 1 and 100000): '), chalk.yellow(value));
              break;
            }
            chatSession.updateSettings({...settings, maxOutputTokens});
          } else if (key == SETTINGS_KEY_TEMPERATURE) {
            const temperature = parseFloat(value);
            if (isNaN(temperature) || temperature < 0 || temperature > 1) {
              console.log(chalk.red('Invalid temperature (must be between 0 and 1): '), chalk.yellow(value));
              break;
            }
            chatSession.updateSettings({...settings, temperature});
          } else if (key == SETTINGS_KEY_TOP_P) {
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
          } else if (key == SETTINGS_KEY_CONTEXT_TOP_K) {
            const contextTopK = parseInt(value);
            if (isNaN(contextTopK) || contextTopK < 1 || contextTopK > 100) {
              console.log(chalk.red('Invalid context top K (must be between 1 and 100): '), chalk.yellow(value));
              break;
            }
            chatSession.updateSettings({...settings, contextTopK});
          } else if (key == SETTINGS_KEY_CONTEXT_TOP_N) {
            const contextTopN = parseInt(value);
            if (isNaN(contextTopN) || contextTopN < 1 || contextTopN > 50) {
              console.log(chalk.red('Invalid context top N (must be between 1 and 50): '), chalk.yellow(value));
              break;
            }
            chatSession.updateSettings({...settings, contextTopN});
          } else if (key == SETTINGS_KEY_CONTEXT_INCLUDE_SCORE) {
            const contextIncludeScore = parseFloat(value);
            if (isNaN(contextIncludeScore) || contextIncludeScore < 0 || contextIncludeScore > 1) {
              console.log(chalk.red('Invalid context include score (must be between 0 and 1): '), chalk.yellow(value));
              break;
            }
            chatSession.updateSettings({...settings, contextIncludeScore});
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
          
          const userMessages = chatSession.getState().messages.filter((msg: any) => msg.role === 'user').length;
          console.log(`    User Messages: ${chalk.yellow(userMessages)}`);
          
          // Calculate AI responses (turns)
          const aiResponses = chatSession.getState().messages
            .filter((msg: any) => msg.role === 'assistant')
            .reduce((total: number, msg: any) => total + (('modelReply' in msg) ? msg.modelReply.turns.length : 0), 0);
          console.log(`    AI Responses (Turns): ${chalk.yellow(aiResponses)}`);
          
          // Calculate total input tokens
          const totalInputTokens = chatSession.getState().messages
            .filter((msg: any) => msg.role === 'assistant')
            .reduce((total: number, msg: any) => {
              if ('modelReply' in msg) {
                return total + msg.modelReply.turns.reduce((turnTotal: number, turn: any) => 
                  turnTotal + (turn.inputTokens || 0), 0);
              }
              return total;
            }, 0);
          console.log(`    Total Input Tokens: ${chalk.yellow(totalInputTokens.toLocaleString())}`);
          
          // Calculate total output tokens
          const totalOutputTokens = chatSession.getState().messages
            .filter((msg: any) => msg.role === 'assistant')
            .reduce((total: number, msg: any) => {
              if ('modelReply' in msg) {
                return total + msg.modelReply.turns.reduce((turnTotal: number, turn: any) => 
                  turnTotal + (turn.outputTokens || 0), 0);
              }
              return total;
            }, 0);
          console.log(`    Total Output Tokens: ${chalk.yellow(totalOutputTokens.toLocaleString())}`);
          
          // Last message stats
          console.log(chalk.cyan('\n  Last Message:'));
          
          const aiMessages = chatSession.getState().messages.filter((msg: any) => msg.role === 'assistant');
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
              const toolCalls = lastMessage.modelReply.turns.reduce((total: number, turn: any) => 
                total + (turn.results?.filter((result: any) => result.type === 'toolCall').length || 0), 0);
              console.log(`    Tool Calls: ${chalk.yellow(toolCalls)}`);
              
              // Calculate input tokens for last message
              const inputTokens = lastMessage.modelReply.turns.reduce((total: number, turn: any) => 
                total + (turn.inputTokens || 0), 0);
              console.log(`    Input Tokens: ${chalk.yellow(inputTokens.toLocaleString())}`);
              
              // Calculate output tokens for last message
              const outputTokens = lastMessage.modelReply.turns.reduce((total: number, turn: any) => 
                total + (turn.outputTokens || 0), 0);
              console.log(`    Output Tokens: ${chalk.yellow(outputTokens.toLocaleString())}`);
            }
          } else {
            console.log(chalk.yellow('    No AI responses yet'));
          }
          
          console.log('');
          break;

        case COMMANDS.TOOLS:
          if (args.length === 0) {
            await toolsCommand(agent, chatSession, logger);
          } else if (args[0] === 'include') {
            let serverName: string | undefined;
            let toolName: string | undefined;
            
            // Parse --server and --tool flags
            for (let i = 1; i < args.length; i++) {
              if (args[i] === '--server' && i + 1 < args.length) {
                serverName = args[i + 1];
                i++;
              } else if (args[i] === '--tool' && i + 1 < args.length) {
                toolName = args[i + 1];
                i++;
              }
            }
            
            if (!serverName) {
              console.log(chalk.red('Server name is required. Use --server <name>'));
              break;
            }
            
            if (toolName) {
              // Include specific tool
              try {
                const success = await chatSession.addTool(serverName, toolName);
                if (success) {
                  console.log(chalk.green(`Tool "${serverName}:${toolName}" included in session context`));
                } else {
                  console.log(chalk.yellow(`Tool "${serverName}:${toolName}" is already in session context`));
                }
              } catch (error) {
                console.log(chalk.red(`Error including tool: ${error}`));
              }
            } else {
              // Include all tools for server
              try {
                const mcpClient = await agent.getMcpClient(serverName);
                if (!mcpClient) {
                  console.log(chalk.red(`Server not found or not connected: ${serverName}`));
                  break;
                }
                
                let count = 0;
                for (const tool of mcpClient.serverTools) {
                  const success = await chatSession.addTool(serverName, tool.name);
                  if (success) count++;
                }
                console.log(chalk.green(`Included ${count} tools from server "${serverName}"`));
              } catch (error) {
                console.log(chalk.red(`Error including tools: ${error}`));
              }
            }
          } else if (args[0] === 'exclude') {
            let serverName: string | undefined;
            let toolName: string | undefined;
            
            // Parse --server and --tool flags
            for (let i = 1; i < args.length; i++) {
              if (args[i] === '--server' && i + 1 < args.length) {
                serverName = args[i + 1];
                i++;
              } else if (args[i] === '--tool' && i + 1 < args.length) {
                toolName = args[i + 1];
                i++;
              }
            }
            
            if (!serverName) {
              console.log(chalk.red('Server name is required. Use --server <name>'));
              break;
            }
            
            if (toolName) {
              // Exclude specific tool
              const success = chatSession.removeTool(serverName, toolName);
              if (success) {
                console.log(chalk.green(`Tool "${serverName}:${toolName}" excluded from session context`));
              } else {
                console.log(chalk.yellow(`Tool "${serverName}:${toolName}" is not in session context`));
              }
            } else {
              // Exclude all tools for server
              const activeTools = chatSession.getIncludedTools();
              const serverTools = activeTools.filter(t => t.serverName === serverName);
              
              let count = 0;
              for (const tool of serverTools) {
                const success = chatSession.removeTool(tool.serverName, tool.toolName);
                if (success) count++;
              }
              console.log(chalk.green(`Excluded ${count} tools from server "${serverName}"`));
            }
          } else {
            console.log(chalk.red(`Unknown command: /tools ${args[0]}`));
            console.log(chalk.cyan('Use "/tools include --server <name> [--tool <name>]" or "/tools exclude --server <name> [--tool <name>]"'));
          }
          break;

        case COMMANDS.RULES:
          if (args.length === 0) {
            // Show all rules with asterisk for active ones and dash for inactive ones
            const allRules = agent.getAllRules();
            console.log(chalk.cyan('\nRules:'));
            if (allRules.length === 0) {
              console.log(chalk.yellow('No rules available.'));
            } else {
              allRules.forEach((rule: any) => {
                const state = chatSession.getState();
                const isActive = state.contextItems.some(item => item.type === 'rule' && item.name === rule.name);
                const marker = isActive ? chalk.green('* ') : chalk.dim('- ');
                console.log(`${marker}${chalk.yellow(rule.name)} (priority: ${rule.priorityLevel})`);
              });
              console.log('');
            }
          } else if (args[0] === 'include') {
            const ruleName = args[1];
            if (ruleName) {
              const rule = agent.getRule(ruleName);
              if (rule) {
                const success = chatSession.addRule(ruleName);
                if (success) {
                  console.log(chalk.green(`Rule "${ruleName}" included in session context`));
                } else {
                  console.log(chalk.yellow(`Rule "${ruleName}" is already in session context`));
                }
              } else {
                console.log(chalk.red(`Rule not found: ${ruleName}`));
              }
            } else {
              console.log(chalk.red('No rule name provided'));
            }
          } else if (args[0] === 'exclude') {
            const ruleName = args[1];
            if (ruleName) {
              const success = chatSession.removeRule(ruleName);
              if (success) {
                console.log(chalk.green(`Rule "${ruleName}" excluded from session context`));
              } else {
                console.log(chalk.yellow(`Rule "${ruleName}" is not in session context`));
              }
            } else {
              console.log(chalk.red('No rule name provided'));
            }
          } else {
            console.log(chalk.red(`Unknown command: /rules ${args[0]}`));
            console.log(chalk.cyan('Use "/rules include <name>" or "/rules exclude <name>"'));
          }
          break;

        case COMMANDS.REFERENCES:
          if (args.length === 0) {
            // Show all references with asterisk for active ones and dash for inactive ones
            const allReferences = agent.getAllReferences();
            console.log(chalk.cyan('\nReferences:'));
            if (allReferences.length === 0) {
              console.log(chalk.yellow('No references available.'));
            } else {
              allReferences.forEach((reference: any) => {
                const state = chatSession.getState();
                const isActive = state.contextItems.some(item => item.type === 'reference' && item.name === reference.name);
                const marker = isActive ? chalk.green('* ') : chalk.dim('- ');
                console.log(`${marker}${chalk.yellow(reference.name)} (priority: ${reference.priorityLevel})`);
              });
              console.log('');
            }
          } else if (args[0] === 'include') {
            const referenceName = args[1];
            if (referenceName) {
              const reference = agent.getReference(referenceName);
              if (reference) {
                const success = chatSession.addReference(referenceName);
                if (success) {
                  console.log(chalk.green(`Reference "${referenceName}" included in session context`));
                } else {
                  console.log(chalk.yellow(`Reference "${referenceName}" is already in session context`));
                }
              } else {
                console.log(chalk.red(`Reference not found: ${referenceName}`));
              }
            } else {
              console.log(chalk.red('No reference name provided'));
            }
          } else if (args[0] === 'exclude') {
            const referenceName = args[1];
            if (referenceName) {
              const success = chatSession.removeReference(referenceName);
              if (success) {
                console.log(chalk.green(`Reference "${referenceName}" excluded from session context`));
              } else {
                console.log(chalk.yellow(`Reference "${referenceName}" is not in session context`));
              }
            } else {
              console.log(chalk.red('No reference name provided'));
            }
          } else {
            console.log(chalk.red(`Unknown command: /references ${args[0]}`));
            console.log(chalk.cyan('Use "/references include <name>" or "/references exclude <name>"'));
          }
          break;

        case COMMANDS.CLEAR:
          console.clear();
          chatSession = createLocalChatSession();
          currentProvider = chatSession.getState().currentModelProvider;
          currentModelId = chatSession.getState().currentModelId;
          console.log(chalk.green('Chat history cleared'));
          console.log(chalk.green(`Welcome to ${PRODUCT_NAME}!`));
          break;

        case COMMANDS.AGENT:
          console.log(chalk.cyan('\nAgent:'));
          console.log(`  ${chalk.yellow(agent.path)}`);
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
      
      const getAssistantUpdate = (update: MessageUpdate | null): (ChatMessage & { role: 'assistant', modelReply: ModelReply }) | null => {
        // Find the first assistant update
        if (update) {
          for (const message of update.updates) {
            if (message.role === 'assistant' && 'modelReply' in message) {
              return message as ChatMessage & { role: 'assistant', modelReply: ModelReply };
            }
          }
        }
        return null;
      };

      // Process message updates and handle any tool call approvals (loop until no more tool call approvals)
      let assistantUpdate = getAssistantUpdate(messageUpdate);
      while (assistantUpdate) {
        for (const turn of assistantUpdate.modelReply.turns) {
          // Display text results
          if (turn.results) {
            for (const result of turn.results) {
              if (result.type === 'text') {
                console.log(`\n${result.text}`);
              } else if (result.type === 'toolCall') {
                console.log(chalk.cyan(`\nTool call: ${result.toolCall.toolName}`));
                console.log(chalk.dim(indent(`Arguments: ${JSON.stringify(result.toolCall.args, null, 2)}`)));
                if (result.toolCall.output) {
                  console.log(chalk.dim(indent(`Output:`)));
                  console.log(chalk.dim(indent(result.toolCall.output, 4)));
                }
                if (result.toolCall.error) {
                  console.log(chalk.red(indent(`Error:`)));
                  console.log(chalk.dim(indent(result.toolCall.error, 4)));
                }
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
        console.log(chalk.red('Error:'), error.message);
        logger.error('Error processing message:', error);
      } else {
        console.log(chalk.red('An unknown error occurred'));
        logger.error('Unknown error processing message:', error);
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
            console.log(chalk.red('Error in CLI loop:'), error);
            logger.error('Error in CLI loop:', error);
          }
        }
      }
      console.log(chalk.green('Exiting application.'));
      process.exit(0);
    } catch (error) {
      console.log(chalk.red('Fatal error in CLI:'), error);
      logger.error('Fatal error in CLI:', error);
      process.exit(1);
    }
  }

  runCLI();
  return;
}
