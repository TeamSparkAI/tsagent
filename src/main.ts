import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron';
import * as path from 'path';
import { LLMFactory } from './llm/llmFactory';
import { LLMType } from './llm/types';
import { MCPClientImpl } from './mcp/client';
import { MCPClientManager } from './mcp/manager';
import { getDataDirectory } from './config';
import { RulesManager } from './state/RulesManager';
import { ReferencesManager } from './state/ReferencesManager';
import log from 'electron-log';
import 'dotenv/config';
import * as fs from 'fs';
import { setupCLI } from './cli';
import { McpConfig } from './mcp/types';
import { McpConfigFileServerConfig } from './commands/tools';

// Configure electron-log
log.initialize({ preload: true }); // Required to wire up the renderer (will crash the CLI)
log.transports.file.resolvePathFn = () => path.join(getDataDirectory(), 'app.log');
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
log.info('App starting...');

const __dirname = path.dirname(__filename);

// Declare managers and paths
let mcpManager: MCPClientManager;
let rulesManager: RulesManager;
let referencesManager: ReferencesManager;
let MCP_CONFIG_PATH: string;
let PROMPT_FILE: string;
const DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";

// Initialize paths and managers
const initialize = () => {
  log.info('Starting initialization process');
  
  // Initialize paths using app.getPath
  const CONFIG_DIR = path.join(getDataDirectory(), 'config');
  MCP_CONFIG_PATH = path.join(CONFIG_DIR, 'mcp_config.json');
  PROMPT_FILE = path.join(CONFIG_DIR, 'prompt.md');
  
  log.info('Initializing with config directory:', CONFIG_DIR);
  
  // Create config directory
  if (!fs.existsSync(CONFIG_DIR)) {
    log.info('Creating config directory:', CONFIG_DIR);
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Initialize managers
  log.info('Initializing managers with config directory:', CONFIG_DIR);
  mcpManager = new MCPClientManager();
  rulesManager = new RulesManager(CONFIG_DIR);
  referencesManager = new ReferencesManager(CONFIG_DIR);

  // Initialize the LLM Factory with the manager
  log.info('Initializing LLMFactory with MCPManager');
  LLMFactory.initialize(mcpManager);
  log.info('Initialization complete');
};

// Load MCP clients from config
const loadMCPClients = async () => {
  try {
    // Create empty config if it doesn't exist
    if (!fs.existsSync(MCP_CONFIG_PATH)) {
      await fs.promises.writeFile(MCP_CONFIG_PATH, JSON.stringify({ mcpServers: {} }, null, 2));
    }

    const configData = await fs.promises.readFile(MCP_CONFIG_PATH, 'utf8');
    const config = JSON.parse(configData);
    await mcpManager.loadClients(config.mcpServers);
  } catch (err) {
    log.error('Error loading MCP config:', err);
  }
};

// Near the top with other state
const mcpClients = new Map<string, MCPClientImpl>();

const startApp = async () => {
  // If running in CLI mode, don't initialize Electron
  if (process.argv.includes('--cli')) {
    initialize();
    await loadMCPClients();
    setupCLI();
  } else {
    // Set app name before anything else
    process.env.ELECTRON_APP_NAME = 'TeamSpark Workbench';
    app.setName('TeamSpark Workbench');

    let mainWindow: (InstanceType<typeof BrowserWindow>) | null = null;
    const llmInstances = new Map<string, ReturnType<typeof LLMFactory.create>>();
    const llmTypes = new Map<string, LLMType>();

    function createWindow() {
      mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'TeamSpark AI Workbench',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          spellcheck: true,
          defaultEncoding: 'UTF-8',
          preload: path.join(__dirname, 'preload.js')
        }
      });

      // Handle both development and production paths
      log.info('__dirname:', __dirname);
      const indexPath = path.join(__dirname, 'index.html');
      
      log.info('Loading index.html from:', indexPath);
      log.info('File exists:', fs.existsSync(indexPath));
      mainWindow.loadFile(indexPath);

      // Enable native text editing context menu
      mainWindow.webContents.on('context-menu', (_, props) => {
        // Show menu only for editable fields
        if (!props.isEditable) return;

        const menu = Menu.buildFromTemplate([
          {
            label: "Cut",
            accelerator: 'CmdOrCtrl+X',
            role: props.editFlags.canCut ? 'cut' as const : undefined,
            enabled: props.editFlags.canCut,
            visible: props.isEditable
          },
          {
            label: "Copy",
            accelerator: 'CmdOrCtrl+C',
            role: props.editFlags.canCopy ? 'copy' as const : undefined,
            enabled: props.editFlags.canCopy,
            visible: props.isEditable
          },
          {
            label: "Paste",
            accelerator: 'CmdOrCtrl+V',
            role: props.editFlags.canPaste ? 'paste' as const : undefined,
            enabled: props.editFlags.canPaste,
            visible: props.isEditable
          },
          { type: 'separator' },
          {
            label: "Select All",
            accelerator: 'CmdOrCtrl+A',
            role: 'selectAll' as const,
            enabled: props.isEditable,
            visible: props.isEditable
          }
        ]);

        if (mainWindow) {
          menu.popup({ window: mainWindow });
        }
      });
    }
  
    // Handle IPC messages
    ipcMain.handle('send-message', async (_, tabId: string, message: string) => {
      log.info('Main process received message:', message);
      let llm = llmInstances.get(tabId);
      if (!llm) {
        log.info('Creating new LLM instance');
        llm = LLMFactory.create(LLMType.Test);
        llmInstances.set(tabId, llm);
        llmTypes.set(tabId, LLMType.Test);
      }
      const response = await llm.generateResponse(message);
      log.info('Main process sending response:', response);
      return response;
    });

    ipcMain.handle('switch-model', (_, tabId: string, modelType: LLMType) => {
      try {
        const llm = LLMFactory.create(modelType);
        llmInstances.set(tabId, llm);
        llmTypes.set(tabId, modelType);
        return { success: true };
      } catch (error) {
        log.error('Error switching model:', error);
        // Check for specific API key errors
        const errorMessage = error instanceof Error ? error.message : String(error);
        const response = { 
          success: false, 
          error: errorMessage
        };
        log.info('Sending error response:', response);
        return response;
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
      try {
        const configData = await fs.promises.readFile(MCP_CONFIG_PATH, 'utf8');
        const config: { mcpServers: Record<string, McpConfigFileServerConfig> } = JSON.parse(configData);
        return Object.entries(config.mcpServers).map(([name, serverConfig]) => ({
          name,
          ...serverConfig
        }));
      } catch (err) {
        log.error('Error getting server configs:', err);
        return [];  // Return empty list if no config
      }
    });

    ipcMain.handle('get-mcp-client', async (_, serverName: string) => {
      try {
        let client = mcpClients.get(serverName);
        if (!client) {
          const configData = await fs.promises.readFile(MCP_CONFIG_PATH, 'utf8');
          const config: { mcpServers: Record<string, McpConfig> } = JSON.parse(configData);
          const serverConfig = config.mcpServers[serverName];
          if (!serverConfig) {
            log.error(`No configuration found for server: ${serverName}`);
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
      } catch (err) {
        log.error('Error getting MCP client:', err);
        throw err;
      }
    });

    ipcMain.handle('get-system-prompt', async () => {
      try {
        const prompt = await fs.promises.readFile(PROMPT_FILE, 'utf8');
        // Initialize LLM state with loaded prompt
        LLMFactory.getStateManager().setSystemPrompt(prompt);
        return prompt;
      } catch (err) {
        log.error('Error reading system prompt, using default:', err);
        // If file doesn't exist, create it with default prompt
        await fs.promises.writeFile(PROMPT_FILE, DEFAULT_PROMPT, 'utf8');
        LLMFactory.getStateManager().setSystemPrompt(DEFAULT_PROMPT);
        return DEFAULT_PROMPT;
      }
    });

    ipcMain.handle('save-system-prompt', async (_, prompt: string) => {
      try {
        await fs.promises.writeFile(PROMPT_FILE, prompt, 'utf8');
        // Update LLM state with new prompt
        LLMFactory.getStateManager().setSystemPrompt(prompt);
        log.info('System prompt saved successfully');
      } catch (err) {
        log.error('Error saving system prompt:', err);
        throw err;
      }
    });

    // Add new IPC handler
    ipcMain.handle('show-chat-menu', (_, hasSelection: boolean, x: number, y: number) => {
      const menu = Menu.buildFromTemplate([
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          role: hasSelection ? 'copy' as const : undefined,
          enabled: hasSelection,
        },
        { type: 'separator' },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          role: 'selectAll' as const,
        }
      ]);

      menu.popup({ x, y });
    });

    ipcMain.handle('open-external', async (_, url: string) => {
      try {
        await shell.openExternal(url);
        return true;
      } catch (error) {
        log.error('Failed to open external URL:', error);
        return false;
      }
    });

    ipcMain.handle('get-rules', () => {
      return rulesManager.getRules();
    });

    ipcMain.handle('save-rule', (_, rule) => {
      return rulesManager.saveRule(rule);
    });

    ipcMain.handle('delete-rule', (_, name) => {
      return rulesManager.deleteRule(name);
    });

    ipcMain.handle('saveServerConfig', async (_, server: McpConfig) => {
      await saveServerConfig(server);
    });

    ipcMain.handle('deleteServerConfig', async (_, serverName: string) => {
      await deleteServerConfig(serverName);
    });

    ipcMain.handle('get-references', () => {
      return referencesManager.getReferences();
    });

    ipcMain.handle('save-reference', (_, reference) => {
      return referencesManager.saveReference(reference);
    });

    ipcMain.handle('delete-reference', (_, name) => {
      return referencesManager.deleteReference(name);
    });

    // Move initialization into the ready event
    app.whenReady().then(async () => {
      log.info('App ready, starting initialization');
      initialize();
      log.info('Loading MCP clients');
      await loadMCPClients();
      log.info('MCP clients loaded, creating window');
      createWindow();
    });

    // Add a small delay before quitting to ensure cleanup
    app.on('window-all-closed', () => {
      setTimeout(() => {
        app.quit();
      }, 100);
    });

    app.on('activate', () => {
      if (mainWindow === null) {
        createWindow();
      }
    });
  }
}
startApp();

// Add these functions near the top with other config handling
const saveServerConfig = async (server: McpConfig) => {
  try {
    const configData = await fs.promises.readFile(MCP_CONFIG_PATH, 'utf8');
    const config = JSON.parse(configData);
    
    const serverConfig: any = {
      command: server.command
    };
    
    if (server.args?.length > 0) {
      serverConfig.args = server.args;
    }
    
    if (server.env && Object.keys(server.env).length > 0) {
      serverConfig.env = server.env;
    }
    
    config.mcpServers[server.name] = serverConfig;
    await fs.promises.writeFile(MCP_CONFIG_PATH, JSON.stringify(config, null, 2));
    
    // Reconnect the client with new config
    const client = mcpClients.get(server.name);
    if (client) {
      client.disconnect();
      mcpClients.delete(server.name);
    }
  } catch (err) {
    log.error('Error saving server config:', err);
    throw err;
  }
};

const deleteServerConfig = async (serverName: string) => {
  try {
    const configData = await fs.promises.readFile(MCP_CONFIG_PATH, 'utf8');
    const config = JSON.parse(configData);
    delete config.mcpServers[serverName];
    await fs.promises.writeFile(MCP_CONFIG_PATH, JSON.stringify(config, null, 2));
    
    // Disconnect and remove the client
    const client = mcpClients.get(serverName);
    if (client) {
      client.disconnect();
      mcpClients.delete(serverName);
    }
  } catch (err) {
    log.error('Error deleting server config:', err);
    throw err;
  }
}; 