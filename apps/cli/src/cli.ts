import chalk from 'chalk';
import ora from 'ora';
import { read } from 'read';
import path from 'path';
import * as fs from 'fs';

import { PRODUCT_NAME } from './main.js';
import { renderCommandInput } from './tui/CommandInputApp.js';
import type { Command } from './tui/CommandInput.js';
import { showWelcomeBanner } from './tui/WelcomeBannerApp.js';
import { renderSelectionList } from './tui/SelectionListApp.js';
import type { SelectableItem } from './tui/SelectionList.js';
import { renderModelSelectList } from './tui/ModelSelectListApp.js';
import type { ModelItem } from './tui/ModelSelectListApp.js';
import { renderProviderSelectList } from './tui/ProviderSelectListApp.js';
import type { ProviderItem } from './tui/ProviderSelectListApp.js';
import { renderProviderManagement } from './tui/ProviderManagementApp.js';
import type { ProviderItem as ProviderManagementItem } from './tui/ProviderManagementList.js';
import { renderConfirmPrompt } from './tui/ConfirmPromptApp.js';
import { renderSettingsList } from './tui/SettingsListApp.js';
import type { SettingItem } from './tui/SettingsList.js';
import { renderToolPermissionSelect } from './tui/ToolPermissionSelectApp.js';

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
  MODEL: '/model',
  SETTINGS: '/settings',
  CLEAR: '/clear',
  QUIT: '/quit',
  EXIT: '/exit',
  TOOLS: '/tools',
  RULES: '/rules',
  REFERENCES: '/references',
  STATS: '/stats',
  AGENT: '/agent'
};

// Command list for TUI autocomplete
const COMMAND_LIST: Command[] = [
  { name: '/help', description: 'Show this help menu' },
  { name: '/license', description: 'Show the license agreement' },
  { name: '/providers', description: 'Manage providers (install, reconfigure, remove)' },
  { name: '/provider', description: 'Select a provider' },
  { name: '/model', description: 'Select a model' },
  { name: '/settings', description: 'Manage settings (edit, reset, save)' },
  { name: '/tools', description: 'List available tools from all configured MCP servers' },
  { name: '/rules', description: 'Select rules to include in session' },
  { name: '/references', description: 'Select references to include in session' },
  { name: '/stats', description: 'Display statistics for the current chat session' },
  { name: '/agent', description: 'Display the current agent path' },
  { name: '/clear', description: 'Clear the chat history' },
  { name: '/quit', description: 'Exit the application' },
  { name: '/exit', description: 'Exit the application' },
];

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
  console.log(chalk.yellow('  /providers') + ' - Manage providers (install, reconfigure, remove)');
  console.log(chalk.yellow('  /provider') + ' - Select a provider');
  console.log(chalk.yellow('  /model') + ' - Select a model');
  console.log(chalk.yellow('  /settings') + ' - Manage settings (edit, reset, save)');
  console.log(chalk.yellow('  /tools') + ' - List available tools from all configured MCP servers');
  console.log(chalk.yellow('  /tools include --server <name> [--tool <name>]') + ' - Include tool(s) in session context');
  console.log(chalk.yellow('  /tools exclude --server <name> [--tool <name>]') + ' - Exclude tool(s) from session context');
  console.log(chalk.yellow('  /rules') + ' - Select rules to include in session');
  console.log(chalk.yellow('  /references') + ' - Select references to include in session');
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
    contextIncludeScore: merged.contextIncludeScore!,
    autonomous: agent.autonomous ? true : false // CLI sessions default to agent's autonomous state
  };
}

const isProviderInstalled = (agent: Agent, providerName: string): boolean => {
  const providerType = getProviderByName(providerName);
  return providerType ? agent.isProviderInstalled(providerType) : false;
};

export async function setupCLI(agent: Agent, version: string, logger: WinstonLoggerAdapter) {
  // Show welcome banner
  try {
    await showWelcomeBanner(version, agent.path, agent.name);
  } catch (error) {
    logger.warn('Failed to show welcome banner:', error);
    // Fallback to simple welcome message
  console.log(chalk.green(`Welcome to ${PRODUCT_NAME} v${version}!`));
  }

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

  // Helper function to collect provider configuration
  async function collectProviderConfig(provider: ProviderId, existingConfig?: Record<string, string>): Promise<Record<string, string> | null> {
                const providerInfo = agent.getProviderInfo(provider);
    console.log(chalk.cyan(`\n${providerInfo.name}`));
                console.log(chalk.yellow(`  ${providerInfo.description}`));
    const configValues: Record<string, string> = existingConfig ? { ...existingConfig } : {};
                
                // Helper to extract env var name from env://VAR_NAME format
                const extractEnvVarName = (defaultValue: string | undefined): string | null => {
                  if (defaultValue && defaultValue.startsWith('env://')) {
                    return defaultValue.substring(6); // Remove 'env://' prefix
                  }
                  return null;
                };
                
                // Collect config values
                for (const configValue of providerInfo.configValues || []) {
                  const envVarName = extractEnvVarName(configValue.default);
      const existingValue = existingConfig?.[configValue.key];
                  let promptText = `    ${configValue.key}:`;
                  let isRequired = configValue.required;
                  
                  // Check if env var exists when we have an env:// default
                  if (envVarName) {
                    const envVarExists = process.env[envVarName] !== undefined;
                    if (envVarExists) {
                      // Env var exists - allow empty to use it
                      promptText += chalk.gray(` (press Enter to use env var ${envVarName})`);
                      isRequired = false; // Not required if env var exists
                    } else {
                      // Env var doesn't exist - require a value
                      promptText += chalk.gray(` (required - env var ${envVarName} not found)`);
                      isRequired = true;
                    }
                  } else if (configValue.required) {
                    promptText += chalk.gray(' (required)');
                    isRequired = true;
                  } else {
                    promptText += chalk.gray(' (optional)');
                  }
                  
                  console.log(chalk.yellow(`    ${configValue.key}: ${configValue.caption}`));
                  
                  // Only pass defaultValue if it's not an env:// default (we show that in the prompt text)
      // Use existing value as default if available, otherwise use the default value
      const defaultValue = envVarName ? undefined : (existingValue || configValue.default);
                  
                  let value = await collectInput(chalk.green(promptText), { 
                    isCommand: false, 
                    isPassword: configValue.secret, 
                    defaultValue 
                  });
                  
                  // Require value if needed
                  if (isRequired && (!value || !value.trim())) {
                    console.log(chalk.red(`✗ ${configValue.key} is required`));
        return null;
                  }
                  
                  // Only include non-empty values (like desktop app does)
                  // This allows Zod defaults (like env://VAR_NAME) to apply when env var exists
                  if (value && value.trim()) {
                    configValues[configValue.key] = value.trim();
      } else if (existingValue && !value) {
        // Keep existing value if user just pressed Enter and no new value provided
        configValues[configValue.key] = existingValue;
                  }
                }
                
    // Validate configuration
                console.log(chalk.cyan('\nValidating configuration...'));
                const validation = await agent.validateProviderConfiguration(provider, configValues);
                
                if (!validation.isValid) {
                  console.log(chalk.red('✗ Configuration invalid:'), chalk.yellow(validation.error || 'Unknown error'));
                  console.log('');
                  console.log(chalk.yellow('Please either:'));
                  console.log(chalk.gray('  1. Set the required environment variable(s), or'));
                  console.log(chalk.gray('  2. Re-run this command and provide a value when prompted'));
      return null;
    }
    
    return configValues;
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
          {
            const installedProviders = agent.getInstalledProviders();
            const availableProviders = agent.getAvailableProviders();
            const allProviders = new Set([...installedProviders, ...availableProviders]);
            
            const providerItems: ProviderManagementItem[] = Array.from(allProviders).map((providerId: ProviderId) => {
              const providerInfo = agent.getProviderInfo(providerId);
              return {
                id: providerId,
                name: providerInfo.name,
                isInstalled: agent.isProviderInstalled(providerId),
              };
            });

            const result = await renderProviderManagement('Providers', providerItems);
            
            if (!result) {
              // Cancelled
              break;
            }

            const { providerId, action } = result;
            const provider = providerId as ProviderId;
            const providerInfo = agent.getProviderInfo(provider);

            try {
              if (action === 'install') {
                const configValues = await collectProviderConfig(provider);
                if (!configValues) {
                  break; // User cancelled or validation failed
                }
                await agent.installProvider(provider, configValues);
                console.log(chalk.green('✓ Provider installed:'), chalk.yellow(providerInfo.name));
              } else if (action === 'view') {
                const config = agent.getInstalledProviderConfig(provider);
                console.log(chalk.cyan(`\n${providerInfo.name}`));
                console.log(chalk.yellow(`  ${providerInfo.description}`));
                if (config) {
                  console.log(chalk.cyan('\nConfiguration:'));
                  for (const [key, value] of Object.entries(config)) {
                    const configValue = providerInfo.configValues?.find(cv => cv.key === key);
                    const displayValue = configValue?.secret ? '***' : value;
                    console.log(chalk.yellow(`  ${key}:`), displayValue);
              }
            } else {
                  console.log(chalk.yellow('  No configuration stored (using defaults)'));
                }
                console.log('');
              } else if (action === 'reconfigure') {
                const existingConfig = agent.getInstalledProviderConfig(provider) || {};
                const configValues = await collectProviderConfig(provider, existingConfig);
                if (!configValues) {
                  break; // User cancelled or validation failed
                }
                await agent.updateProvider(provider, configValues);
                console.log(chalk.green('✓ Provider reconfigured:'), chalk.yellow(providerInfo.name));
              } else if (action === 'remove') {
                const confirmed = await renderConfirmPrompt(`Are you sure you want to remove ${providerInfo.name}?`);
                if (confirmed) {
                await agent.uninstallProvider(provider);
                  if (currentProvider === provider) {
                  currentProvider = undefined;
                  currentModelId = undefined;
                  chatSession.clearModel();
                    console.log(chalk.green('Provider removed and cleared from session'));
                } else {
                    console.log(chalk.green('✓ Provider removed:'), chalk.yellow(providerInfo.name));
                }
              }
            }
            } catch (error: unknown) {
              if (error instanceof Error) {
                console.log(chalk.red('Error:'), error.message);
          } else {
                console.log(chalk.red('Error performing action'));
              }
              logger.error('Error in providers command:', error);
            }
          }
          break;

        case COMMANDS.PROVIDER:
          {
            const installedProviders = agent.getInstalledProviders();
            if (installedProviders.length === 0) {
              console.log(chalk.red('No providers installed. Use "/providers" to add a provider.'));
              break;
            }
            try {
              const providerItems: ProviderItem[] = installedProviders.map((providerId: ProviderId) => {
                const providerInfo = agent.getProviderInfo(providerId);
                return {
                  id: providerId,
                  name: providerInfo.name,
                };
              });

              const selectedProviderId = await renderProviderSelectList('Providers', providerItems, currentProvider || undefined);
              
              if (selectedProviderId) {
                const provider = selectedProviderId as ProviderId;
              const models = await agent.getProviderModels(provider);
                let modelId: string;
                let modelDescription: string;
                
                // If switching to the same provider, keep current model if it's valid for that provider
                if (currentProvider === provider && currentModelId) {
                  const currentModel = models.find((m: any) => m.id === currentModelId);
                  if (currentModel) {
                    modelId = currentModelId;
                    modelDescription = `model: ${currentModel.name}`;
                } else {
                    // Current model not available, use default
                    const defaultModel = models[0];
                    modelId = defaultModel.id;
                    modelDescription = `default model: ${defaultModel.name}`;
                }
              } else {
                  // Switching to different provider, use default model
                const defaultModel = models[0];
                modelId = defaultModel.id;
                modelDescription = `default model: ${defaultModel.name}`;
              }
                
              currentProvider = provider;
              currentModelId = modelId;
                chatSession.switchModel(provider, modelId);
                await updatedMostRecentProvider(provider, modelId);
                console.log(chalk.green(`Switched to ${provider} using ${modelDescription}`));
              }
            } catch (error: unknown) {
              if (error instanceof Error) {
                console.log(chalk.red('Error selecting provider:'), error.message);
            } else {
                console.log(chalk.red('Error selecting provider'));
            }
            }
          }
          break;

        case COMMANDS.MODEL:
          if (!currentProvider) {
            console.log(chalk.red('No current provider, select a provider before selecting a model'));
            break;
          }
          try {
            const models = await agent.getProviderModels(currentProvider);
            const modelItems: ModelItem[] = models.map((m: any) => ({
              id: m.id,
              name: m.name,
            }));

            const selectedModelId = await renderModelSelectList(`Models (${currentProvider})`, modelItems, currentModelId || undefined);
            
            if (selectedModelId && currentProvider) {
              currentModelId = selectedModelId;
              chatSession.switchModel(currentProvider, currentModelId);
              await updatedMostRecentProvider(currentProvider, currentModelId);
              console.log(chalk.green(`Switched to ${selectedModelId} on ${currentProvider}`));
            }
          } catch (error: unknown) {
            if (error instanceof Error) {
              console.log(chalk.red('Error selecting model:'), error.message);
            } else {
              console.log(chalk.red('Error selecting model'));
            }
          }
          break;

        case COMMANDS.SETTINGS:
          {
            // Helper to edit a numeric setting
            const editNumericSetting = async (settingKey: NumericSettingKey): Promise<boolean> => {
              const constraint = numericSettingConstraints[settingKey];
              const sessionSettings = chatSession.getState();
              const currentValue = sessionSettings[settingKey];
              const prompt = `${settingKey} (${constraint.min}-${constraint.max}):`;
              
              const valueInput = await collectInput(chalk.green(prompt), {
                isCommand: false,
                defaultValue: String(currentValue),
              });

              if (!valueInput) {
                return false; // Cancelled
              }

              const parsedValue = constraint.parse(valueInput);
              if (isNaN(parsedValue) || parsedValue < constraint.min || parsedValue > constraint.max) {
                console.log(chalk.red(`${constraint.error}: `), chalk.yellow(valueInput));
                return false;
              }

              chatSession.updateSettings({ ...sessionSettings, [settingKey]: parsedValue });
              console.log(chalk.green(`Set ${settingKey} to`), chalk.yellow(valueInput));
              return true;
            };

            // Helper to edit toolPermission setting
            const editToolPermission = async (): Promise<boolean> => {
            const sessionSettings = chatSession.getState();
              const currentValue = sessionSettings.toolPermission;
              const newValue = await renderToolPermissionSelect(currentValue);
              
              if (!newValue) {
                return false; // Cancelled
              }

              chatSession.updateSettings({ ...sessionSettings, toolPermission: newValue as SessionToolPermission });
              console.log(chalk.green(`Set toolPermission to`), chalk.yellow(newValue));
              return true;
            };

            // Main settings management loop
            while (true) {
              // Refresh agent settings each iteration (in case they changed)
              const agentSettings = getAgentSettings(agent);
              const sessionSettings = chatSession.getState();

              // Create setting items from current state
              const settingItems: SettingItem[] = [
                ...MAIN_SETTING_KEYS.map((key): SettingItem => {
                  const sessionValue = sessionSettings[key];
                  const agentValue = agentSettings[key];
                  return {
                    key,
                    label: key,
                    value: String(sessionValue),
                    defaultValue: String(agentValue),
                    isOverridden: sessionValue !== agentValue,
                    type: 'numeric',
                  };
                }),
                {
                  key: TOOL_PERMISSION_KEY,
                  label: TOOL_PERMISSION_KEY,
                  value: sessionSettings.toolPermission,
                  defaultValue: agentSettings.toolPermission,
                  isOverridden: sessionSettings.toolPermission !== agentSettings.toolPermission,
                  type: 'enum',
                },
                ...CONTEXT_SETTING_KEYS.map((key): SettingItem => {
                  const sessionValue = sessionSettings[key];
                  const agentValue = agentSettings[key];
                  return {
                    key,
                    label: key,
                    value: String(sessionValue),
                    defaultValue: String(agentValue),
                    isOverridden: sessionValue !== agentValue,
                    type: 'numeric',
                  };
                }),
              ];

              const result = await renderSettingsList('Settings', settingItems);
              
              if (!result) {
                // Cancelled
                break;
              }

              if (result.action === 'reset') {
            const settings = getAgentSettings(agent);
            chatSession.updateSettings(settings);
                console.log(chalk.green('Settings reset to agent defaults'));
                // Loop will continue and refresh items
              } else if (result.action === 'save') {
                const currentSettings = chatSession.getState();
            await agent.updateSettings({
                  maxChatTurns: currentSettings.maxChatTurns,
                  maxOutputTokens: currentSettings.maxOutputTokens,
                  temperature: currentSettings.temperature,
                  topP: currentSettings.topP,
                  toolPermission: currentSettings.toolPermission,
                  contextTopK: currentSettings.contextTopK,
                  contextTopN: currentSettings.contextTopN,
                  contextIncludeScore: currentSettings.contextIncludeScore
                });
                console.log(chalk.green('Settings saved as agent defaults'));
                // Loop will continue and refresh items
              } else if (result.action === 'edit' && result.settingKey) {
                const settingKey = result.settingKey as ChatSettingKey;
                const success = isNumericSettingKey(settingKey)
                  ? await editNumericSetting(settingKey)
                  : settingKey === TOOL_PERMISSION_KEY
                  ? await editToolPermission()
                  : false;
                // Loop will continue and refresh items
              }
            }
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
          {
            const allRules = agent.getAllRules();
            if (allRules.length === 0) {
              console.log(chalk.yellow('No rules available.'));
            } else {
                const state = chatSession.getState();
              const selectableItems: SelectableItem[] = allRules.map((rule: any) => ({
                name: rule.name,
                description: `priority: ${rule.priorityLevel}`,
                isSelected: state.contextItems.some(item => item.type === 'rule' && item.name === rule.name),
              }));

              const updatedItems = await renderSelectionList('Rules', selectableItems);
              
              // Apply changes
              for (const item of updatedItems) {
                const rule = selectableItems.find(r => r.name === item.name);
                if (rule && rule.isSelected !== item.isSelected) {
                  if (item.isSelected) {
                    chatSession.addRule(item.name);
                } else {
                    chatSession.removeRule(item.name);
                  }
                }
              }
            }
          }
          break;

        case COMMANDS.REFERENCES:
          {
            const allReferences = agent.getAllReferences();
            if (allReferences.length === 0) {
              console.log(chalk.yellow('No references available.'));
            } else {
                const state = chatSession.getState();
              const selectableItems: SelectableItem[] = allReferences.map((reference: any) => ({
                name: reference.name,
                description: `priority: ${reference.priorityLevel}`,
                isSelected: state.contextItems.some(item => item.type === 'reference' && item.name === reference.name),
              }));

              const updatedItems = await renderSelectionList('References', selectableItems);
              
              // Apply changes
              for (const item of updatedItems) {
                const reference = selectableItems.find(r => r.name === item.name);
                if (reference && reference.isSelected !== item.isSelected) {
                  if (item.isSelected) {
                    chatSession.addReference(item.name);
                } else {
                    chatSession.removeReference(item.name);
                  }
                }
              }
            }
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
    
    // For command inputs, use Ink TUI with command autocomplete
    if (isCommand && !isPassword && defaultValue === '') {
      try {
        const input = await renderCommandInput(prompt, COMMAND_LIST);
        return input;
      } catch (error) {
        // Fall back to read if Ink fails
        logger.warn('Ink command input failed, falling back to read:', error);
      }
    }
    
    // For non-command inputs (passwords, default values, etc), use read package
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
