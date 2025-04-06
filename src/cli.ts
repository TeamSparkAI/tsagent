import readline from 'readline';
import { LLMFactory } from './llm/llmFactory';
import { LLMType } from './llm/types';
import { ConfigManager } from './state/ConfigManager';
import { McpClient, McpConfigFileServerConfig } from './mcp/types';
import { McpClientStdio, McpClientSse, createMcpClientFromConfig } from './mcp/client';
import log from 'electron-log';
import { Tool } from '@modelcontextprotocol/sdk/types';
import { ChatMessage } from './types/ChatSession';
import path from 'path';
import { AppState } from './state/AppState';
import { RulesManager } from './state/RulesManager';
import { ReferencesManager } from './state/ReferencesManager';

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

const workspacePath = path.join(process.cwd(), 'config');
const configManager = ConfigManager.getInstance(false);
configManager.setConfigPath(workspacePath);
const mcpClients = new Map<string, McpClient>();

async function toolsCommand() {
  try {
    const configDir = configManager.getConfigDir();
    const appState = new AppState(configManager, null as any);

    const mcpServers = await configManager.getMcpConfig();

    console.log('Checking available tools on MCP servers...\n');

    // Connect to each server and list tools
    for (const [serverId, serverConfig] of Object.entries(mcpServers)) {
      console.log(`Server: ${serverId}`);
      console.log('------------------------');

      const client = createMcpClientFromConfig(appState, serverConfig);
      try {
        await client.connect();
        
        // Tools are now available in client.serverTools
        if (client.serverTools.length === 0) {
          console.log('No tools available');
        } else {
          client.serverTools.forEach((tool: Tool) => {
            console.log(`- ${tool.name}: ${tool.description || 'No description'}`);
          });
        }
      } catch (error) {
        log.error(`Error connecting to ${serverId}:`, error);
      } finally {
        await client.cleanup();
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

export function setupCLI() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('Welcome to TeamSpark AI Workbench!');
  console.log('Available commands:');
  console.log('  /model - List available models');
  console.log('  /model <name> - Switch to specified model');
  console.log('  /quit or /exit - Exit the application');
  console.log('  /tools - List available tools from all configured MCP servers');
  console.log('\n');  
  
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
        console.log('\nAvailable models:');
        Object.keys(AVAILABLE_MODELS).forEach(model => {
          const indicator = model === currentModel ? '* ' : '  ';
          const displayName = MODEL_DISPLAY_NAMES[model] || model;
          console.log(`${indicator}${displayName}`);
        });
        console.log('');
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
            console.log(`Switched to ${displayName} model`);
          } catch (error: unknown) {
            if (error instanceof Error) {
              console.error('Error switching model:', error.message);
            } else {
              console.error('Error switching model');
            }
          }
        } else {
          console.log('Invalid model name. Use /model to see available models.');
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
        const messages: ChatMessage[] = [
          { role: 'system', content: await configManager.getSystemPrompt() },
          { role: 'user', content: input }
        ];
        const response = await currentLLM.generateResponse(messages);
        console.log(`AI: ${response}`);
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error('Error:', error.message);
        } else {
          console.error('An unknown error occurred');
        }
      }
      promptUser();
    });
  };

  promptUser();
} 