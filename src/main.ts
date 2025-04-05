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
import { EventEmitter } from 'events';

// Configure electron-log
let configManager: ConfigManager;
const __dirname = path.dirname(__filename);

// Declare managers and paths
let mcpManager: MCPClientManager;
let rulesManager: RulesManager;
let referencesManager: ReferencesManager;
let chatSessionManager: ChatSessionManager;
let appState: AppState;
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
  appState = new AppState(configManager, rulesManager, referencesManager, null as any);

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
    // For CLI mode, use the config directory within the current directory
    const workspacePath = path.join(process.cwd(), 'config');
    log.info(`CLI mode: Using config directory: ${workspacePath}`);
    configManager = ConfigManager.getInstance(false, workspacePath);
    intializeLogging(false);
    await initialize();
    setupCLI();
  } else {
    // For GUI mode, use the config directory within the user data directory
    const userDataPath = path.join(app.getPath('userData'), 'config');
    log.info(`GUI mode: Using config directory: ${userDataPath}`);
    configManager = ConfigManager.getInstance(app.isPackaged, userDataPath);
    
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
      
      mainWindow.webContents.openDevTools();

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

      // Set up event listener for workspace changes
      const workspaceManager = WorkspaceManager.getInstance();
      workspaceManager.on('workspace:switched', () => {
        if (mainWindow) {
          mainWindow.webContents.send('workspace:switched');
        }
      });

      // Load the index.html file
      const indexPath = path.join(__dirname, 'index.html');
      log.info('Loading index.html from:', indexPath);
      log.info('File exists:', fs.existsSync(indexPath));
      mainWindow.loadFile(indexPath);

      // Always register the window with the WorkspaceManager
      if (mainWindow) {
        // If no workspace path is provided, use the current working directory
        const defaultWorkspacePath = workspacePath || process.cwd();
        log.info(`Registering window ${mainWindow.id} with workspace ${defaultWorkspacePath}`);
        WorkspaceManager.getInstance().registerWindow(mainWindow.id.toString(), defaultWorkspacePath);
        
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
        log.info('[MAIN PROCESS] getSystemPrompt called');
        const prompt = await configManager.getSystemPrompt();
        log.info(`[MAIN PROCESS] System prompt retrieved: ${prompt.substring(0, 50)}...`);
        log.info(`[MAIN PROCESS] Prompt file path: ${configManager.getPromptFile()}`);
        return prompt;
      } catch (err) {
        log.error('[MAIN PROCESS] Error reading system prompt, using default:', err);
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
      if (!currentWindow) {
        log.warn('No focused window found when getting current window ID');
        return null;
      }
      
      const windowId = currentWindow.id.toString();
      log.info(`[WINDOW ID] Current window ID: ${windowId}`);
      
      // Log all windows
      const allWindows = BrowserWindow.getAllWindows();
      log.info(`[WINDOW ID] All windows: ${allWindows.map(w => w.id.toString()).join(', ')}`);
      
      // Log active windows in WorkspaceManager
      const workspaceManager = WorkspaceManager.getInstance();
      const activeWindows = workspaceManager.getActiveWindows();
      log.info(`[WINDOW ID] Active windows in WorkspaceManager: ${activeWindows.map(w => w.windowId).join(', ')}`);
      
      // Check if the window is registered with the WorkspaceManager
      const isRegistered = activeWindows.some(window => window.windowId === windowId);
      if (!isRegistered) {
        log.warn(`[WINDOW ID] Window ${windowId} is not registered with WorkspaceManager, registering now`);
        // Register the window with a default workspace path
        const defaultWorkspacePath = path.join(app.getPath('userData'), 'default-workspace');
        workspaceManager.registerWindow(windowId, defaultWorkspacePath);
      }
      
      return windowId;
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
      // Create workspace using WorkspaceManager
      await WorkspaceManager.getInstance().createWorkspace(workspacePath);
      
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

    // Add this with the other workspace handlers
    ipcMain.handle('workspace:switchWorkspace', async (_, windowId: string, workspacePath: string) => {
      try {
        log.info(`[WORKSPACE SWITCH] IPC handler called for window ${windowId} to workspace ${workspacePath}`);
        // Convert windowId to string to ensure consistent handling
        const windowIdStr = windowId.toString();
        await WorkspaceManager.getInstance().switchWorkspace(windowIdStr, workspacePath);
        log.info(`[WORKSPACE SWITCH] Successfully switched workspace in IPC handler`);
        return true;
      } catch (error) {
        log.error(`[WORKSPACE SWITCH] Error in IPC handler switching window ${windowId} to workspace ${workspacePath}:`, error);
        return false;
      }
    });

    // Set up event listener for workspace switched event on the WorkspaceManager instance
    const workspaceManager = WorkspaceManager.getInstance();
    workspaceManager.on('workspace:switched', async (event: { windowId: string, workspacePath: string }) => {
      try {
        const { windowId, workspacePath } = event;
        log.info(`[WORKSPACE RELOAD] Starting reload for window ${windowId} with workspace ${workspacePath}`);
        
        // Get the ConfigManager for this workspace
        log.info(`[WORKSPACE RELOAD] Getting ConfigManager for workspace`);
        const configManager = WorkspaceManager.getInstance().getConfigManager(workspacePath);
        
        // Reload configuration
        log.info(`[WORKSPACE RELOAD] Loading configuration`);
        await configManager.loadConfig();
        
        // Get the config directory for this workspace
        const configDir = configManager.getConfigDir();
        log.info(`[WORKSPACE RELOAD] Using config directory for reload: ${configDir}`);
        
        // Reinitialize RulesManager with the new config directory
        log.info(`[WORKSPACE RELOAD] Reinitializing RulesManager`);
        rulesManager = new RulesManager(configDir);
        
        // Reinitialize ReferencesManager with the new config directory
        log.info(`[WORKSPACE RELOAD] Reinitializing ReferencesManager`);
        referencesManager = new ReferencesManager(configDir);
        
        // Create a new AppState with the updated managers
        log.info(`[WORKSPACE RELOAD] Creating new AppState`);
        const newAppState = new AppState(configManager, rulesManager, referencesManager, null as any);
        
        // Reinitialize MCPClientManager
        log.info(`[WORKSPACE RELOAD] Reinitializing MCPClientManager`);
        const mcpClientManager = new MCPClientManager(newAppState, mcpClients);
        newAppState.setMCPManager(mcpClientManager);
        mcpManager = mcpClientManager;
        
        // Reinitialize ChatSessionManager with the new AppState
        log.info(`[WORKSPACE RELOAD] Reinitializing ChatSessionManager`);
        chatSessionManager = new ChatSessionManager(newAppState);
        
        // Reinitialize the LLM Factory with the new AppState
        log.info(`[WORKSPACE RELOAD] Reinitializing LLMFactory`);
        LLMFactory.initialize(newAppState);
        
        // Update the global appState variable
        log.info(`[WORKSPACE RELOAD] Updating global appState`);
        appState = newAppState;
        
        // Get the window
        log.info(`[WORKSPACE RELOAD] Getting window ${windowId}`);
        // Convert windowId to number for BrowserWindow.fromId
        const window = BrowserWindow.fromId(parseInt(windowId, 10));
        if (window) {
          log.info(`[WORKSPACE RELOAD] Sending reload notifications to renderer`);
          // Notify the renderer process that configuration has changed
          window.webContents.send('configuration:changed');
          
          // Notify the renderer process that rules have changed
          window.webContents.send('rules-changed');
          
          // Notify the renderer process that references have changed
          window.webContents.send('references-changed');
          
          // Send the workspace:switched event to all windows
          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('workspace:switched');
          });
          
          log.info(`[WORKSPACE RELOAD] All notifications sent to renderer`);
        } else {
          log.error(`[WORKSPACE RELOAD] Could not find window with ID ${windowId}`);
        }
        
        log.info(`[WORKSPACE RELOAD] All components reloaded for window ${windowId}`);
      } catch (error) {
        log.error(`[WORKSPACE RELOAD] Error reloading components:`, error);
      }
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