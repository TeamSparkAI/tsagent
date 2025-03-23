import electron from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { setupCLI } from './cli.js';
import { LLMFactory } from './llm/llmFactory.js';
import { LLMType } from './llm/types.js';
import { MCPClientImpl } from './mcp/client.js';
import { MCPClient } from './mcp/types.js';
import { MCPClientManager } from './mcp/manager.js';
import { ServerConfig } from './mcp/types.js';
import { MCPConfigServer } from './commands/tools.js';
import 'dotenv/config';
import * as fs from 'fs';

const { app, BrowserWindow, ipcMain } = electron;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize MCP Client Manager
const mcpManager = new MCPClientManager();

// Initialize the LLM Factory with the manager
LLMFactory.initialize(mcpManager);

// Load MCP clients from config
const loadMCPClients = async () => {
  const configPath = path.join(__dirname, '../config/mcp_config.json');
  const configData = await fs.promises.readFile(configPath, 'utf8');
  const config = JSON.parse(configData);
  await mcpManager.loadClients(config.mcpServers);
};

// If running in CLI mode, don't initialize Electron
if (process.argv.includes('--cli')) {
  await loadMCPClients();
  setupCLI();
} else {
  let mainWindow: (InstanceType<typeof BrowserWindow>) | null = null;
  const llmInstances = new Map<string, ReturnType<typeof LLMFactory.create>>();
  const llmTypes = new Map<string, LLMType>();
  const mcpClients = new Map<string, MCPClientImpl>();

  await loadMCPClients();
  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'TeamSpark AI Workbench',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
    mainWindow.webContents.reloadIgnoringCache();
  }

  // Handle IPC messages
  ipcMain.handle('send-message', async (_, tabId: string, message: string) => {
    console.log('Main process received message:', message);
    let llm = llmInstances.get(tabId);
    if (!llm) {
      console.log('Creating new LLM instance');
      llm = LLMFactory.create(LLMType.Test);
      llmInstances.set(tabId, llm);
      llmTypes.set(tabId, LLMType.Test);
    }
    const response = await llm.generateResponse(message);
    console.log('Main process sending response:', response);
    return response;
  });

  ipcMain.handle('switch-model', (_, tabId: string, modelType: LLMType) => {
    console.log('Switching model to:', modelType);
    try {
      const llm = LLMFactory.create(modelType);
      llmInstances.set(tabId, llm);
      llmTypes.set(tabId, modelType);
      return true;
    } catch (error) {
      console.error('Error switching model:', error);
      return false;
    }
  });

  ipcMain.handle('toggle-dev-tools', () => {
    mainWindow?.webContents.toggleDevTools();
    return true;
  });

  ipcMain.handle('get-current-model', (_, tabId: string) => {
    return llmTypes.get(tabId) || LLMType.Test;
  });

  ipcMain.handle('get-server-configs', async () => {
    const configPath = path.join(__dirname, '../config/mcp_config.json');
    const configData = await fs.promises.readFile(configPath, 'utf8');
    const config: { mcpServers: Record<string, MCPConfigServer> } = JSON.parse(configData);
    return Object.entries(config.mcpServers).map(([name, serverConfig]) => ({
      name,
      ...serverConfig
    }));
  });

  ipcMain.handle('get-mcp-client', async (_, serverName: string) => {
    let client = mcpClients.get(serverName);
    if (!client) {
      const configPath = path.join(__dirname, '../config/mcp_config.json');
      const configData = await fs.promises.readFile(configPath, 'utf8');
      const config: { mcpServers: Record<string, MCPConfigServer> } = JSON.parse(configData);
      const serverConfig = config.mcpServers[serverName];
      if (!serverConfig) {
        throw new Error(`No configuration found for server: ${serverName}`);
      }
      
      client = new MCPClientImpl();
      await client.connectToServer(
        serverConfig.command,
        serverConfig.args,
        serverConfig.env
      );
      mcpClients.set(serverName, client);
    }
    return {
      serverVersion: client.serverVersion,
      serverTools: client.serverTools
    };
  });

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    }
  });
} 