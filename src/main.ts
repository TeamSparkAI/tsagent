import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron';
import * as path from 'path';
import { LLMFactory } from './llm/llmFactory';
import { LLMType } from './llm/types';
import { MCPClientImpl } from './mcp/client';
import { MCPClientManager } from './mcp/manager';
import { RulesManager } from './state/RulesManager';
import { ReferencesManager } from './state/ReferencesManager';
import log from 'electron-log';
import 'dotenv/config';
import * as fs from 'fs';
import { setupCLI } from './cli';
import { McpConfig } from './mcp/types';
import { ConfigManager } from './state/ConfigManager';
import { ChatSessionManager } from './state/ChatSessionManager';

// Configure electron-log
let configManager: ConfigManager;
const __dirname = path.dirname(__filename);

// Declare managers and paths
let mcpManager: MCPClientManager;
let rulesManager: RulesManager;
let referencesManager: ReferencesManager;
let chatSessionManager: ChatSessionManager;
const DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";

function intializeLogging(isElectron: boolean) {
  if (isElectron) {
    log.initialize({ preload: true }); // Required to wire up the renderer (will crash the CLI)
    log.transports.file.resolvePathFn = () => path.join(configManager.getDataDirectory(), 'app.log');
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
  } else {
    // In CLI mode, only show error and above to the console, no file logging
    log.transports.console.level = 'error';
  }
  log.info('App starting...');
}

// Initialize paths and managers
async function initialize() {
  log.info('Starting initialization process');
  
  // Initialize paths using app.getPath
  const CONFIG_DIR = configManager.getConfigDir();
  
  log.info('Initializing with config directory:', CONFIG_DIR);
  
  // Create config directory
  if (!fs.existsSync(CONFIG_DIR)) {
    log.info('Creating config directory:', CONFIG_DIR);
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Load config first
  log.info('Loading config...');
  await configManager.loadConfig();

  // Initialize managers
  log.info('Initializing managers with config directory:', CONFIG_DIR);
  mcpManager = new MCPClientManager();
  rulesManager = new RulesManager(CONFIG_DIR);
  referencesManager = new ReferencesManager(CONFIG_DIR);
  chatSessionManager = new ChatSessionManager();

  // Initialize the LLM Factory with the manager
  log.info('Initializing LLMFactory with MCPManager');
  LLMFactory.initialize(mcpManager, configManager);

  log.info("Loaded MCP clients");
  try {
    const mcpServers = await configManager.getMcpConfig();
    await mcpManager.loadClients(mcpServers);
  } catch (err) {
    log.error('Error loading MCP config:', err);
  }

  log.info('Initialization complete');
}

// Near the top with other state
const mcpClients = new Map<string, MCPClientImpl>();

async function startApp() {
  if (process.argv.includes('--cli')) {
    configManager = ConfigManager.getInstance(false);
    intializeLogging(false);
    await initialize();
    setupCLI();
  } else {
    configManager = ConfigManager.getInstance(app.isPackaged);
    
    // Set app name before anything else
    process.env.ELECTRON_APP_NAME = 'TeamSpark Workbench';
    app.setName('TeamSpark Workbench');

    intializeLogging(true);

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
    ipcMain.handle('create-chat-tab', (_, tabId: string) => {
      try {
        chatSessionManager.createSession(tabId);
        return { success: true };
      } catch (error) {
        log.error('Error creating chat tab:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    ipcMain.handle('close-chat-tab', (_, tabId: string) => {
      try {
        chatSessionManager.deleteSession(tabId);
        return { success: true };
      } catch (error) {
        log.error('Error closing chat tab:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    ipcMain.handle('get-chat-state', (_, tabId: string) => {
      try {
        return chatSessionManager.getSessionState(tabId);
      } catch (error) {
        log.error('Error getting chat state:', error);
        throw error;
      }
    });

    ipcMain.handle('send-message', async (_, tabId: string, message: string) => {
      try {
        return await chatSessionManager.handleMessage(tabId, message);
      } catch (error) {
        log.error('Error sending message:', error);
        throw error;
      }
    });

    ipcMain.handle('switch-model', (_, tabId: string, modelType: LLMType) => {
      try {
        const result = chatSessionManager.switchModel(tabId, modelType);
        return { 
          success: true,
          updates: result.updates,
          lastSyncId: result.lastSyncId
        };
      } catch (error) {
        log.error('Error switching model:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error)
        };
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
        const mcpServers = await configManager.getMcpConfig();
        return Object.entries(mcpServers).map(([name, serverConfig]) => ({
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
          const mcpServers = await configManager.getMcpConfig();
          const serverConfig = mcpServers[serverName];
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
        const prompt = await configManager.getSystemPrompt();
        // Initialize LLM state with loaded prompt
        LLMFactory.getStateManager().setSystemPrompt(prompt);
        return prompt;
      } catch (err) {
        log.error('Error reading system prompt, using default:', err);
        // If file doesn't exist, create it with default prompt
        await configManager.saveSystemPrompt(DEFAULT_PROMPT);
        LLMFactory.getStateManager().setSystemPrompt(DEFAULT_PROMPT);
        return DEFAULT_PROMPT;
      }
    });

    ipcMain.handle('save-system-prompt', async (_, prompt: string) => {
      try {
        await configManager.saveSystemPrompt(prompt);
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
      await initialize();
      log.info('Initialization complete, creating window');
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

// Add these functions near the top with other config handling
async function saveServerConfig(server: McpConfig) {
  try {
    await configManager.saveMcpConfig(server);
    
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
}

async function deleteServerConfig(serverName: string) {
  try {
    await configManager.deleteMcpConfig(serverName);
    
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
}

startApp(); 