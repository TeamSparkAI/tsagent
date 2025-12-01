import chalk from 'chalk';
import ora from 'ora';
import { read } from 'read';
import path from 'path';
import * as fs from 'fs';

import { PRODUCT_NAME } from './main.js';

import { 
  Agent,
  AgentSettings,
  ChatMessage, 
  ChatSessionOptionsWithRequiredSettings,
  MessageUpdate, 
  ModelReply,
  ProviderId, 
  SessionToolPermission,
  SessionToolPermissionSchema,
  Tool,
  ToolCallApproval, 
  ToolCallDecision, 
  getDefaultSettings,
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

const MAIN_SETTING_KEYS = ['maxChatTurns', 'maxOutputTokens', 'temperature', 'topP'] as const;
const CONTEXT_SETTING_KEYS = ['contextTopK', 'contextTopN', 'contextIncludeScore'] as const;
const TOOL_PERMISSION_KEY = 'toolPermission' as const;

type NumericSettingKey = typeof MAIN_SETTING_KEYS[number] | typeof CONTEXT_SETTING_KEYS[number];
type ChatSettingKey = NumericSettingKey | typeof TOOL_PERMISSION_KEY;

const ALL_SETTING_KEYS = [...MAIN_SETTING_KEYS, TOOL_PERMISSION_KEY, ...CONTEXT_SETTING_KEYS] as const;

const numericSettingConstraints: Record<NumericSettingKey, { parse: (value: string) => number; min: number; max: number; error: string }> = {
  maxChatTurns: { parse: (value) => parseInt(value, 10), min: 1, max: 500, error: 'Invalid max chat turns (must be between 1 and 500)' },
  maxOutputTokens: { parse: (value) => parseInt(value, 10), min: 1, max: 100000, error: 'Invalid max output tokens (must be between 1 and 100000)' },
  temperature: { parse: (value) => parseFloat(value), min: 0, max: 1, error: 'Invalid temperature (must be between 0 and 1)' },
  topP: { parse: (value) => parseFloat(value), min: 0, max: 1, error: 'Invalid topP (must be between 0 and 1)' },
  contextTopK: { parse: (value) => parseInt(value, 10), min: 1, max: 100, error: 'Invalid context top K (must be between 1 and 100)' },
  contextTopN: { parse: (value) => parseInt(value, 10), min: 1, max: 50, error: 'Invalid context top N (must be between 1 and 50)' },
  contextIncludeScore: { parse: (value) => parseFloat(value), min: 0, max: 1, error: 'Invalid context include score (must be between 0 and 1)' },
};

const isNumericSettingKey = (key: ChatSettingKey): key is NumericSettingKey =>
  Object.prototype.hasOwnProperty.call(numericSettingConstraints, key);

const parseSettingKey = (value: string): ChatSettingKey | null => {
  return (ALL_SETTING_KEYS as readonly string[]).includes(value)
    ? (value as ChatSettingKey)
    : null;
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

function getProviderByName(name: string): ProviderId | undefined {
  if (!name) return undefined;
  return name.toLowerCase() as ProviderId;
}

// Convert AgentSettings to ChatSessionOptionsWithRequiredSettings
// Uses schema defaults (single source of truth) for any missing values
function getAgentSettings(agent: Agent): ChatSessionOptionsWithRequiredSettings {
  const agentSettings = agent.getSettings();
  const defaults = getDefaultSettings();
  
  // Merge agent settings with schema defaults - schema is single source of truth
  const merged = { ...defaults, ...agentSettings };
  
  return {
    maxChatTurns: merged.maxChatTurns!,
    maxOutputTokens: merged.maxOutputTokens!,
    temperature: merged.temperature!,
    topP: merged.topP!,
    toolPermission: merged.toolPermission!,
    contextTopK: merged.contextTopK!,
    contextTopN: merged.contextTopN!,
    contextIncludeScore: merged.contextIncludeScore!
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

  const updatedMostRecentProvider = async (provider: ProviderId, modelId: string) => {
    await agent.updateSettings({
      model: `${provider}:${modelId}`
    });
  };

  let currentProvider: ProviderId | undefined;
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
            const nonInstalledProviders = availableProviders.filter((p: ProviderId) => !installedProviders.includes(p));
            
            if (installedProviders.length === 0) {
              console.log(chalk.cyan('No providers installed'));
            } else {
              console.log(chalk.cyan(`Providers installed and available:`));
              installedProviders.forEach((provider: ProviderId) => {
                const indicator = provider === currentProvider ? chalk.green('* ') : '  ';
                const providerInfo = agent.getProviderInfo(provider);
                console.log(chalk.yellow(`${indicator}${provider}: ${providerInfo.name}`));
              });
            }
            if (nonInstalledProviders.length === 0) {
              console.log(chalk.cyan('No providers available to install'));
            } else {
              console.log(chalk.cyan(`Providers available to install:`));
              nonInstalledProviders.forEach((provider: ProviderId) => {
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
            const sessionSettings = chatSession.getState();
            const agentSettings = getAgentSettings(agent);
            
            console.log(chalk.cyan('\nSettings:'));
            
            // Helper to format setting display
            const formatSetting = (sessionValue: any, agentValue: any): string => {
              return sessionValue === agentValue 
                ? String(sessionValue)
                : `${sessionValue} (overrides agent default: ${agentValue})`;
            };
            
            // Display main settings
            MAIN_SETTING_KEYS.forEach((settingKey) => {
              console.log(
                chalk.yellow(`  ${settingKey}: ${formatSetting(sessionSettings[settingKey], agentSettings[settingKey])}`)
              );
            });
            console.log(
              chalk.yellow(`  ${TOOL_PERMISSION_KEY}: ${formatSetting(sessionSettings.toolPermission, agentSettings.toolPermission)}`)
            );
            
            // Display context settings
            console.log(chalk.cyan('\n  Agent Context Selection:'));
            CONTEXT_SETTING_KEYS.forEach((settingKey) => {
              console.log(
                chalk.yellow(`    ${settingKey}: ${formatSetting(sessionSettings[settingKey], agentSettings[settingKey])}`)
              );
            });
            console.log('');
          } else if (args[0] == 'clear') {
            const settings = getAgentSettings(agent);
            chatSession.updateSettings(settings);
            console.log(chalk.cyan('\nChat session settings restored to agent defaults'));
          } else if (args[0] == 'save') {
            const settings = chatSession.getState();
            await agent.updateSettings({
              maxChatTurns: settings.maxChatTurns,
              maxOutputTokens: settings.maxOutputTokens,
              temperature: settings.temperature,
              topP: settings.topP,
              toolPermission: settings.toolPermission,
              contextTopK: settings.contextTopK,
              contextTopN: settings.contextTopN,
              contextIncludeScore: settings.contextIncludeScore
            });
            console.log(chalk.cyan('\nChat session settings saved to agent'));
          } else {
            console.log(chalk.cyan('\nUnknown settings command: '), chalk.yellow(args[1]));
          }
          break;

        case COMMANDS.SETTING:
          {
            const keyInput = args[0];
            const valueInput = args[1];
            if (!keyInput || valueInput === undefined) {
              console.log(chalk.red('Usage: /setting <key> <value>'));
              break;
            }

            const parsedKey = parseSettingKey(keyInput);
            if (!parsedKey) {
              console.log(chalk.red('Unknown setting: '), chalk.yellow(keyInput));
              break;
            }

            const settings = chatSession.getState();

            if (isNumericSettingKey(parsedKey)) {
              const constraint = numericSettingConstraints[parsedKey];
              const parsedValue = constraint.parse(valueInput);
              if (isNaN(parsedValue) || parsedValue < constraint.min || parsedValue > constraint.max) {
                console.log(chalk.red(`${constraint.error}: `), chalk.yellow(valueInput));
                break;
              }
              chatSession.updateSettings({ ...settings, [parsedKey]: parsedValue });
            } else if (parsedKey === TOOL_PERMISSION_KEY) {
              const parseResult = SessionToolPermissionSchema.safeParse(valueInput);
              if (!parseResult.success) {
                // Extract valid values from the schema enum definition
                const validValues = (SessionToolPermissionSchema._def as any).values.join(', ');
                console.log(
                  chalk.red('Invalid tool permission: '),
                  chalk.yellow(valueInput),
                  chalk.dim(` (must be one of: ${validValues})`)
                );
                break;
              }
              chatSession.updateSettings({ ...settings, toolPermission: parseResult.data });
            }
            console.log(chalk.green(`Set ${parsedKey} to`), chalk.yellow(valueInput));
          }
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
                decision = 'allow-session';
              } else if (answer.toLowerCase() === 'o') {
                decision = 'allow-once';
              } else if (answer.toLowerCase() === 'd') {
                decision = 'deny';
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
