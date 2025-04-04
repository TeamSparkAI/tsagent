import { app, BrowserWindow, ipcMain, shell, Menu, dialog } from 'electron';
import * as path from 'path';
import { LLMFactory } from './llm/llmFactory';
import { LLMType } from './llm/types';
import { McpClientStdio, McpClientSse } from './mcp/client';
import { MCPClientManager } from './mcp/manager';
import { RulesManager } from './state/RulesManager';
import { ReferencesManager } from './state/ReferencesManager';
import log from 'electron-log';
import 'dotenv/config';
import * as fs from 'fs';
import { setupCLI } from './cli';
import { McpClient, McpConfig, McpConfigFileServerConfig } from './mcp/types';
import { ConfigManager } from './state/ConfigManager';
import { ChatSessionManager } from './state/ChatSessionManager';
import { AppState } from './state/AppState';
import { McpClientInternalRules } from './mcp/InternalClientRules';
import { McpClientInternalReferences } from './mcp/InternalClientReferences';
import { WorkspaceManager } from './main/workspaceManager';

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
  rulesManager = new RulesManager(CONFIG_DIR);
  referencesManager = new ReferencesManager(CONFIG_DIR);

  // Create AppState first
  const appState = new AppState(configManager, rulesManager, referencesManager, null as any);

  // Initialize MCP client manager
  const mcpClientManager = new MCPClientManager(appState, mcpClients);

  // Set MCP client manager in AppState
  appState.setMCPManager(mcpClientManager);
  
  // Initialize ChatSessionManager with AppState
  chatSessionManager = new ChatSessionManager(appState);

  // Initialize the LLM Factory with AppState
  log.info('Initializing LLMFactory with AppState');
  LLMFactory.initialize(appState);

  log.info('Initialization complete');
}

// Near the top with other state
const mcpClients = new Map<string, McpClient>();

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

    let mainWindow: BrowserWindow | null = null;
    const llmInstances = new Map<string, ReturnType<typeof LLMFactory.create>>();
    const llmTypes = new Map<string, LLMType>();

    function createWindow(workspacePath?: string): BrowserWindow {
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

      // Set up event listener for rules changes
      rulesManager.on('rulesChanged', () => {
        if (mainWindow) {
          mainWindow.webContents.send('rules-changed');
        }
      });

      // Set up event listener for references changes
      referencesManager.on('referencesChanged', () => {
        if (mainWindow) {
          mainWindow.webContents.send('references-changed');
        }
      });

      // Handle both development and production paths
      log.info('__dirname:', __dirname);
      const indexPath = path.join(__dirname, 'index.html');
      
      log.info('Loading index.html from:', indexPath);
      log.info('File exists:', fs.existsSync(indexPath));
      mainWindow.loadFile(indexPath);

      // If a workspace path was provided, register it with the window
      if (workspacePath && mainWindow) {
        WorkspaceManager.getInstance().registerWindow(mainWindow.id.toString(), workspacePath);
        
        // Track window state changes
        mainWindow.on('minimize', () => {
          if (mainWindow) {
            WorkspaceManager.getInstance().updateWindowState(
              mainWindow.id.toString(),
              true,
              false
            );
          }
        });
        
        mainWindow.on('restore', () => {
          if (mainWindow) {
            WorkspaceManager.getInstance().updateWindowState(
              mainWindow.id.toString(),
              false,
              false
            );
          }
        });
        
        mainWindow.on('focus', () => {
          // Update all windows to set this one as active
          if (mainWindow) {
            BrowserWindow.getAllWindows().forEach(window => {
              const isActive = window.id === mainWindow!.id;
              WorkspaceManager.getInstance().updateWindowState(
                window.id.toString(),
                window.isMinimized(),
                isActive
              );
            });
          }
        });
      }

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

      return mainWindow;
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
          config: {
            ...serverConfig,
            type: serverConfig.type || 'stdio'  // Default to stdio if type is not present
          }
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
          
          switch (serverConfig.type) {
            case 'stdio':
              client = new McpClientStdio({
                command: serverConfig.command,
                args: serverConfig.args,
                env: serverConfig.env
              });
              break;
            case 'sse':
              client = new McpClientSse(new URL(serverConfig.url), serverConfig.headers);
              break;
            case 'internal':
              if (serverConfig.tool === 'rules') {
                client = new McpClientInternalRules(rulesManager);
              } else if (serverConfig.tool === 'references') {
                client = new McpClientInternalReferences(referencesManager);
              } else {
                log.error('Unknown internal server tool:', serverConfig.tool, 'for server:', serverName);
                throw new Error(`Unknown internal server tool: ${serverConfig.tool}`);
              }
              break;
          }
          
          await client.connect();
          mcpClients.set(serverName, client);
        }
        return {
          serverVersion: client.serverVersion ? {
            name: client.serverVersion.name,
            version: client.serverVersion.version
          } : null,
          serverTools: client.serverTools,
          errorLog: client.getErrorLog(),
          isConnected: client.isConnected()
        };
      } catch (err) {
        log.error('Error getting MCP client:', err);
        throw err;
      }
    });

    ipcMain.handle('call-tool', async (_, serverName: string, toolName: string, args: Record<string, unknown>) => {
      try {
        log.info('Calling tool:', { serverName, toolName, args });
        const client = mcpClients.get(serverName);
        if (!client) {
          throw new Error(`No MCP client found for server ${serverName}`);
        }
        const tool = client.serverTools.find(t => t.name === toolName);
        if (!tool) {
          throw new Error(`Tool ${toolName} not found in server ${serverName}`);
        }
        const result = await client.callTool(tool, args);
        log.info('Tool call completed:', result);
        return result;
      } catch (err) {
        log.error('Error calling tool:', err);
        throw err;
      }
    });

    ipcMain.handle('ping-server', async (_, serverName: string) => {
      const client = mcpClients.get(serverName);
      if (!client) {
        throw new Error(`No MCP client found for server ${serverName}`);
      }
      return client.ping();
    });

    ipcMain.handle('get-system-prompt', async () => {
      try {
        const prompt = await configManager.getSystemPrompt();
        return prompt;
      } catch (err) {
        log.error('Error reading system prompt, using default:', err);
        throw err;
      }
    });

    ipcMain.handle('save-system-prompt', async (_, prompt: string) => {
      try {
        await configManager.saveSystemPrompt(prompt);
        log.info('System prompt saved successfully');
        return { success: true };
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

    // Workspace IPC handlers
    ipcMain.handle('workspace:getActiveWindows', async () => {
      // Ensure data is loaded before returning
      await WorkspaceManager.getInstance().ensureInitialized();
      return WorkspaceManager.getInstance().getActiveWindows();
    });

    ipcMain.handle('workspace:getRecentWorkspaces', async () => {
      // Ensure data is loaded before returning
      await WorkspaceManager.getInstance().ensureInitialized();
      return WorkspaceManager.getInstance().getRecentWorkspaces();
    });

    ipcMain.handle('workspace:getCurrentWindowId', () => {
      const currentWindow = BrowserWindow.getFocusedWindow();
      return currentWindow ? currentWindow.id.toString() : null;
    });

    ipcMain.handle('workspace:open', async (_, filePath: string) => {
      // Check if the path is a file or directory
      let workspacePath: string;
      
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          // If it's a file, extract the directory path
          workspacePath = path.dirname(filePath);
        } else {
          // If it's already a directory, use it directly
          workspacePath = filePath;
        }
      } catch (error) {
        log.error(`Error checking path ${filePath}:`, error);
        // Default to treating it as a directory
        workspacePath = filePath;
      }
      
      // Get the current window
      const currentWindow = BrowserWindow.getFocusedWindow();
      if (currentWindow) {
        // Unregister the window from its current workspace
        WorkspaceManager.getInstance().unregisterWindow(currentWindow.id.toString());
        
        // Register the window with the new workspace
        WorkspaceManager.getInstance().registerWindow(currentWindow.id.toString(), workspacePath);
        
        // Return the current window's ID
        return currentWindow.id;
      }
      
      // If no current window exists, create a new one
      const window = createWindow(workspacePath);
      return window.id;
    });

    ipcMain.handle('workspace:openInNewWindow', async (_, filePath: string) => {
      // Check if the path is a file or directory
      let workspacePath: string;
      
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          // If it's a file, extract the directory path
          workspacePath = path.dirname(filePath);
        } else {
          // If it's already a directory, use it directly
          workspacePath = filePath;
        }
      } catch (error) {
        log.error(`Error checking path ${filePath}:`, error);
        // Default to treating it as a directory
        workspacePath = filePath;
      }
      
      // Always create a new window
      const window = createWindow(workspacePath);
      return window.id;
    });

    ipcMain.handle('workspace:create', async (_, workspacePath: string) => {
      // Create workspace directory and initialize workspace.json
      if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
      }
      
      const workspaceJsonPath = path.join(workspacePath, 'workspace.json');
      if (!fs.existsSync(workspaceJsonPath)) {
        const defaultConfig = {
          name: path.basename(workspacePath),
          created: new Date().toISOString(),
          version: '1.0.0'
        };
        fs.writeFileSync(workspaceJsonPath, JSON.stringify(defaultConfig, null, 2));
      }
      
      const window = createWindow(workspacePath);
      return window.id;
    });

    ipcMain.handle('workspace:switch', async (_, windowId: string) => {
      // Find the window to switch to
      const targetWindow = BrowserWindow.getAllWindows().find(window => window.id.toString() === windowId);
      if (targetWindow) {
        // Focus the window
        targetWindow.focus();
        return true;
      }
      return false;
    });

    ipcMain.handle('dialog:showOpenDialog', (_, options) => {
      return dialog.showOpenDialog(options);
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