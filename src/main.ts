import { app, BrowserWindow, ipcMain, shell, Menu, dialog } from 'electron';
import * as path from 'path';
import { LLMType } from './llm/types';
import { createMcpClientFromConfig } from './mcp/client';
import log from 'electron-log';
import * as fs from 'fs';
import { setupCLI } from './cli';
import { McpConfig } from './mcp/types';
import { ConfigManager } from './state/ConfigManager';
import { AppState } from './state/AppState';
import { WorkspaceManager } from './main/workspaceManager';

const __dirname = path.dirname(__filename);

// Declare managers and paths
let workspaceManager: WorkspaceManager;
const DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";

// Add Map to store AppState instances per window
const appStateMap = new Map<string, AppState>();

async function createWindow(workspacePath?: string): Promise<BrowserWindow> {
  const window = new BrowserWindow({
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
  
  // This can be useful for debuggging frontend events that may be emitted before logging is initialized
  // window.webContents.openDevTools();

  if (workspacePath) {
    await initializeWorkspace(workspacePath, window.id.toString());
    workspaceManager.registerWindow(window.id.toString(), workspacePath);
  }

  // Set up event listener for workspace changes
  workspaceManager.on('workspace:switched', (event) => {
    log.info(`[MAIN] Received workspace:switched event from WorkspaceManager:`, event);
    if (window) {
      log.info(`[MAIN] Sending workspace:switched event to main window ${window.id}`);
      window.webContents.send('workspace:switched', {
        windowId: event.windowId,
        workspacePath: event.workspacePath,
        targetWindowId: event.windowId
      });
    } else {
      log.warn(`[MAIN] Cannot send workspace:switched event - mainWindow is null`);
    }
  });

  // Load the index.html file
  const indexPath = path.join(__dirname, 'index.html');
  log.info('Loading index.html from:', indexPath);
  log.info('File exists:', fs.existsSync(indexPath));
  window.loadFile(indexPath);

  return window;
}

// Initialize a workspace when one is selected
export async function initializeWorkspace(workspacePath: string, windowId?: string) {
  log.info(`Initializing workspace: ${workspacePath} for window: ${windowId}`);
  
  if (!windowId) {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) {
      log.error('No window ID provided and no focused window found');
      throw new Error('No window ID provided and no focused window found');
    }
    windowId = focusedWindow.id.toString();
    log.info(`No window ID provided, using focused window: ${windowId}`);
  }
  
  // Get the ConfigManager for this workspace
  const configManager = await workspaceManager.configManager(workspacePath);
  
  // Get the config directory for this workspace
  const configDir = configManager.getConfigDir();
  log.info(`Using config directory: ${configDir}`);
  
  // Create AppState for this window and store it in the map
  const windowAppState = new AppState(configManager);
  await windowAppState.initialize();
  appStateMap.set(windowId, windowAppState);
  
  // Set up event listeners for this window's AppState
  if (windowAppState.rulesManager) {
    windowAppState.rulesManager.on('rulesChanged', () => {
      // Find the BrowserWindow for this windowId
      const window = BrowserWindow.getAllWindows().find(w => w.id.toString() === windowId);
      if (window) {
        window.webContents.send('rules-changed');
      }
    });
  }

  if (windowAppState.referencesManager) {
    windowAppState.referencesManager.on('referencesChanged', () => {
      // Find the BrowserWindow for this windowId
      const window = BrowserWindow.getAllWindows().find(w => w.id.toString() === windowId);
      if (window) {
        window.webContents.send('references-changed');
      }
    });
  }

  log.info(`Workspace initialization complete for window: ${windowId}`);
}

// Helper function to get the AppState for a window
function getAppStateForWindow(windowId?: string): AppState | null {
  if (!windowId) {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) {
      log.warn('No window ID provided and no focused window found');
      return null;
    }
    windowId = focusedWindow.id.toString();
  }
  
  const appState = appStateMap.get(windowId);
  if (!appState) {
    log.warn(`No AppState found for window: ${windowId}`);
    return null;
  }
  
  return appState;
}

function intializeLogging(isElectron: boolean) {
  if (isElectron) {
    log.initialize({ preload: true }); // Required to wire up the renderer (will crash the CLI)
    
    // Use timestamp in filename to create a new log file each time the app starts
    const userDataPath = app.getPath('userData');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    log.transports.file.resolvePathFn = () => path.join(userDataPath, `app-${timestamp}.log`);
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
    log.transports.file.level = 'info';
    log.transports.console.level = 'info';
  } else {
    // In CLI mode, only show error and above to the console, no file logging
    log.transports.console.level = 'error';
  }
  log.info('App starting...');
}

// Initialize paths and managers
async function initializeWorkspaceManager() {
  log.info('Starting initialization process');

  // Create and initialize WorkspaceManager
  workspaceManager = new WorkspaceManager();
  await workspaceManager.initialize();
}

async function startApp() {
  if (process.argv.includes('--cli')) {
    intializeLogging(false);
    
    // For CLI mode, use the config directory within the current directory
    const workspacePath = path.join(process.cwd(), 'config');
    log.info(`CLI mode: Using config directory: ${workspacePath}`);

    // For CLI mode, we still need to create a ConfigManager
    const configManager = ConfigManager.getInstance(false);
    configManager.setConfigPath(workspacePath);
    
    // Use CLI-specific AppState directly
    const cliAppState = new AppState(configManager);
    await cliAppState.initialize();

    // Initialize the LLM Factory with AppState
    setupCLI(cliAppState);
  } else {
        // Set app name before anything else
    process.env.ELECTRON_APP_NAME = 'TeamSpark Workbench';
    app.setName('TeamSpark Workbench');

    intializeLogging(true);

    // Implement single instance lock
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      log.info('Another instance is already running, quitting this instance');
      app.quit();
      return;
    } else {
      // We're the first instance, set up the second-instance handler
      app.on('second-instance', (event, commandLine, workingDirectory) => {
        log.info('Second instance launched, focusing existing window');
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.focus();
        }
      });
    }

    let mainWindow: BrowserWindow | null = null;

    // Move initialization into the ready event
    app.whenReady().then(async () => {
      log.info('App ready, starting initialization');
      await initializeWorkspaceManager();
      log.info('Initialization complete, creating window');

      // If workspace path on command line, open that workspace 
      const filteredArgs = process.argv.slice(2).filter(arg => !arg.startsWith('-'));
      const workspacePath = filteredArgs.length > 0 ? filteredArgs[0] : null;
      
      if (workspacePath) {
        log.info(`Opening workspace from command line: ${workspacePath}`);
        mainWindow = await createWindow(workspacePath);
      } else {
        // Else if there is a most recently used workspace, open that 
        const mostRecentlyUsedWorkspace = workspaceManager.getRecentWorkspaces(); // !!! Should this be workspaceManager.getLastActiveWorkspace()?
        if (mostRecentlyUsedWorkspace.length > 0) {
          log.info(`Opening most recently used workspace: ${mostRecentlyUsedWorkspace[0]}`);
          mainWindow = await createWindow(mostRecentlyUsedWorkspace[0]);
        } else {
          log.info('No most recently used workspace, creating new window with no workspace');
          mainWindow = await createWindow();
        }
      }

      // Set up IPC handlers after potential workspace initialization
      setupIpcHandlers(mainWindow);
    });

    // Add a small delay before quitting to ensure cleanup
    app.on('window-all-closed', () => {
      setTimeout(() => {
        app.quit();
      }, 100);
    });

    app.on('activate', async () => {
      if (mainWindow === null) {
        mainWindow = await createWindow();
      }
    });
  }
}

function setupIpcHandlers(mainWindow: BrowserWindow | null) {
  // Rules IPC handlers
  ipcMain.handle('rules:get-rules', (event) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    
    if (!appState?.rulesManager) {
      log.warn(`RulesManager not initialized for window: ${windowId}`);
      return [];
    }
    return appState.rulesManager.getRules();
  });

  ipcMain.handle('rules:save-rule', (event, rule) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    
    if (!appState?.rulesManager) {
      log.warn(`RulesManager not initialized for window: ${windowId}`);
      throw new Error('RulesManager not initialized');
    }
    return appState.rulesManager.saveRule(rule);
  });

  ipcMain.handle('rules:delete-rule', (event, name) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    
    if (!appState?.rulesManager) {
      log.warn(`RulesManager not initialized for window: ${windowId}`);
      throw new Error('RulesManager not initialized');
    }
    return appState.rulesManager.deleteRule(name);
  });

  // References IPC handlers
  ipcMain.handle('references:get-references', (event) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    
    if (!appState?.referencesManager) {
      log.warn(`ReferencesManager not initialized for window: ${windowId}`);
      return [];
    }
    return appState.referencesManager.getReferences();
  });

  ipcMain.handle('references:save-reference', (event, reference) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    
    if (!appState?.referencesManager) {
      log.warn(`ReferencesManager not initialized for window: ${windowId}`);
      throw new Error('ReferencesManager not initialized');
    }
    return appState.referencesManager.saveReference(reference);
  });

  ipcMain.handle('references:delete-reference', (event, name) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    
    if (!appState?.referencesManager) {
      log.warn(`ReferencesManager not initialized for window: ${windowId}`);
      throw new Error('ReferencesManager not initialized');
    }
    return appState.referencesManager.deleteReference(name);
  });

  // Chat session IPC handlers
  ipcMain.handle('chat:create-tab', (event, tabId: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    
    if (!appState?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      appState.chatSessionManager.createSession(tabId);
      return { success: true };
    } catch (error) {
      log.error('Error creating chat tab:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('chat:close-tab', (event, tabId: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    
    if (!appState?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      appState.chatSessionManager.deleteSession(tabId);
      return { success: true };
    } catch (error) {
      log.error('Error closing chat tab:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('chat:get-state', (event, tabId: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    
    if (!appState?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      return appState.chatSessionManager.getSessionState(tabId);
    } catch (error) {
      log.error('Error getting chat state:', error);
      throw error;
    }
  });

  ipcMain.handle('chat:send-message', async (event, tabId: string, message: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    
    if (!appState?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      return await appState.chatSessionManager.handleMessage(tabId, message);
    } catch (error) {
      log.error('Error sending message:', error);
      throw error;
    }
  });

  // Chat context (references and rules) IPC handlers
  ipcMain.handle('chat:add-reference', (event, tabId: string, referenceName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    
    if (!appState?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      return appState.chatSessionManager.addReference(tabId, referenceName);
    } catch (error) {
      log.error(`Error adding reference '${referenceName}' to chat session:`, error);
      throw error;
    }
  });

  ipcMain.handle('chat:remove-reference', (event, tabId: string, referenceName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    
    if (!appState?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      return appState.chatSessionManager.removeReference(tabId, referenceName);
    } catch (error) {
      log.error(`Error removing reference '${referenceName}' from chat session:`, error);
      throw error;
    }
  });

  ipcMain.handle('chat:add-rule', (event, tabId: string, ruleName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    
    if (!appState?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      return appState.chatSessionManager.addRule(tabId, ruleName);
    } catch (error) {
      log.error(`Error adding rule '${ruleName}' to chat session:`, error);
      throw error;
    }
  });

  ipcMain.handle('chat:remove-rule', (event, tabId: string, ruleName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    
    if (!appState?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      return appState.chatSessionManager.removeRule(tabId, ruleName);
    } catch (error) {
      log.error(`Error removing rule '${ruleName}' from chat session:`, error);
      throw error;
    }
  });

  ipcMain.handle('chat:switch-model', (event, tabId: string, modelType: LLMType) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    
    if (!appState?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      const result = appState.chatSessionManager.switchModel(tabId, modelType);
      return { 
        success: true,
        updates: result.updates,
        lastSyncId: result.lastSyncId,
        references: result.references,
        rules: result.rules
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
    if (mainWindow) {
      log.info('Toggling DevTools');
      mainWindow.webContents.toggleDevTools();
    } else {
      // If mainWindow is null, try to use the focused window
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (focusedWindow) {
        log.info('Toggling DevTools on focused window');
        focusedWindow.webContents.toggleDevTools();
      } else {
        log.warn('No window available to toggle DevTools');
      }
    }
    return true;
  });

  ipcMain.handle('get-server-configs', async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) {
      log.warn('No focused window found when getting server configs');
      return [];
    }

    const windowId = focusedWindow.id;
    const activeWindows = workspaceManager.getActiveWindows();
    const currentWindow = activeWindows.find(w => w.windowId === windowId.toString());
    
    if (!currentWindow) {
      log.warn('No workspace found for window when getting server configs');
      return [];
    }

    try {
      const configManager = await workspaceManager.configManager(currentWindow.workspacePath);
      const mcpServers = await configManager.getMcpConfig();
      
      // If mcpServers is empty or undefined, return an empty array
      if (!mcpServers || Object.keys(mcpServers).length === 0) {
        log.info('No MCP server configurations found in mcp_config.json');
        return [];
      }

      // Map the server configurations to the expected format
      return Object.entries(mcpServers).map(([name, serverConfig]) => {
        // Ensure serverConfig and serverConfig.config exist
        if (!serverConfig || !serverConfig.config) {
          log.warn(`Invalid server configuration for ${name}: missing config property`);
          return {
            name,
            config: {
              type: 'stdio' as const
            }
          };
        }
        return {
          name,
          config: serverConfig.config
        };
      });
    } catch (error) {
      log.error('Error getting server configs:', error);
      return [];
    }
  });

  ipcMain.handle('get-mcp-client', async (event, serverName: string) => {
    try {
      // Check if a workspace is selected
      const currentWindowId = BrowserWindow.getFocusedWindow()?.id.toString();
      if (!currentWindowId) {
        log.warn('No focused window found when getting MCP client');
        throw new Error('No focused window found');
      }
      
      const activeWindows = workspaceManager.getActiveWindows();
      const currentWindow = activeWindows.find(w => w.windowId === currentWindowId);
      
      if (!currentWindow) {
        log.warn('No workspace selected, cannot get MCP client');
        throw new Error('No workspace selected');
      }
      
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
      const appState = getAppStateForWindow(windowId);

      // Get the ConfigManager for the current workspace
      const configManager = await workspaceManager.configManager(currentWindow.workspacePath);
      
      let client = appState?.mcpManager.getClient(serverName);
      let serverType = 'stdio';
      
      if (!client) {
        const mcpServers = await configManager.getMcpConfig();
        
        // Check if mcpServers is empty or undefined
        if (!mcpServers || Object.keys(mcpServers).length === 0) {
          log.warn('No MCP server configurations found');
          throw new Error(`No server configurations found`);
        }
        
        const serverConfig = mcpServers[serverName];
        if (!serverConfig) {
          log.error(`No configuration found for server: ${serverName}`);
          throw new Error(`No configuration found for server: ${serverName}`);
        }
        
        // Check if serverConfig.config exists
        if (!serverConfig.config) {
          log.error(`Invalid server configuration for ${serverName}: missing config property`);
          throw new Error(`Invalid server configuration for ${serverName}: missing config property`);
        }
        
        // Get the current window's AppState
        const windowAppState = getAppStateForWindow(currentWindowId);
        if (!windowAppState) {
          throw new Error(`No AppState found for window: ${currentWindowId}`);
        }
        client = createMcpClientFromConfig(windowAppState, serverConfig);
        if (client) {
          await client.connect();
          // !!! mcpClients.set(serverName, client);
        } else {
          throw new Error(`Failed to create client for server: ${serverName}`);
        }
      }
      
      if (!client) {
        throw new Error(`Failed to get client for server: ${serverName}`);
      }
      
      return {
        serverVersion: client.serverVersion ? {
          name: client.serverVersion.name,
          version: client.serverVersion.version
        } : null,
        serverTools: client.serverTools,
        errorLog: client.getErrorLog(),
        isConnected: client.isConnected(),
        serverType: serverType
      };
    } catch (err) {
      log.error('Error getting MCP client:', err);
      throw err;
    }
  });

  ipcMain.handle('call-tool', async (event, serverName: string, toolName: string, args: Record<string, unknown>) => {
    try {
      log.info('Calling tool:', { serverName, toolName, args });
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
      const appState = getAppStateForWindow(windowId);

      const client = appState?.mcpManager.getClient(serverName);
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

  ipcMain.handle('ping-server', async (event, serverName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);

    const client = appState?.mcpManager.getClient(serverName);
    if (!client) {
      throw new Error(`No MCP client found for server ${serverName}`);
    }
    return client.ping();
  });

  ipcMain.handle('get-system-prompt', async () => {
    try {
      log.info('[MAIN PROCESS] getSystemPrompt called');
      
      // Check if a workspace is selected
      const currentWindowId = BrowserWindow.getFocusedWindow()?.id.toString();
      if (!currentWindowId) {
        log.warn('No focused window found when getting system prompt');
        return DEFAULT_PROMPT;
      }
      
      const activeWindows = workspaceManager.getActiveWindows();
      const currentWindow = activeWindows.find(w => w.windowId === currentWindowId);
      
      if (!currentWindow) {
        log.warn('No workspace selected, using default prompt');
        return DEFAULT_PROMPT;
      }
      
      // Get the ConfigManager for the current workspace
      const configManager = await workspaceManager.configManager(currentWindow.workspacePath);
      const prompt = await configManager.getSystemPrompt();
      log.info(`[MAIN PROCESS] System prompt retrieved: ${prompt.substring(0, 50)}...`);
      log.info(`[MAIN PROCESS] Prompt file path: ${configManager.getPromptFile()}`);
      return prompt;
    } catch (err) {
      log.error('[MAIN PROCESS] Error reading system prompt, using default:', err);
      return DEFAULT_PROMPT;
    }
  });

  ipcMain.handle('save-system-prompt', async (_, prompt: string) => {
    try {
      // Check if a workspace is selected
      const currentWindowId = BrowserWindow.getFocusedWindow()?.id.toString();
      if (!currentWindowId) {
        log.warn('No focused window found when saving system prompt');
        throw new Error('No focused window found');
      }
      
      const activeWindows = workspaceManager.getActiveWindows();
      const currentWindow = activeWindows.find(w => w.windowId === currentWindowId);
      
      if (!currentWindow) {
        log.warn('No workspace selected, cannot save system prompt');
        throw new Error('No workspace selected');
      }
      
      // Get the ConfigManager for the current workspace
      const configManager = await workspaceManager.configManager(currentWindow.workspacePath);
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

  ipcMain.handle('saveServerConfig', async (event, server: McpConfig) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    if (!appState) {
      log.warn('[MAIN] saveServerConfig: No app state found for window');
      return;
    }

    try {
      // Check if a workspace is selected
      const currentWindowId = BrowserWindow.getFocusedWindow()?.id.toString();
      if (!currentWindowId) {
        log.warn('No focused window found when saving server config');
        throw new Error('No focused window found');
      }
      
      const activeWindows = workspaceManager.getActiveWindows();
      const currentWindow = activeWindows.find(w => w.windowId === currentWindowId);
      
      if (!currentWindow) {
        log.warn('No workspace selected, cannot save server config');
        throw new Error('No workspace selected');
      }
      
      // Validate server configuration
      if (!server || !server.name) {
        log.error('Invalid server configuration: missing name');
        throw new Error('Invalid server configuration: missing name');
      }
      
      if (!server.config) {
        log.error('Invalid server configuration: missing config property');
        throw new Error('Invalid server configuration: missing config property');
      }
      
      // Ensure config has a type
      if (!server.config.type) {
        log.warn(`Server configuration for ${server.name} missing type, defaulting to stdio`);
        server.config = { type: 'stdio', command: '', args: [] };
      }
      
      // Get the ConfigManager for the current workspace
      const configManager = await workspaceManager.configManager(currentWindow.workspacePath);
      await configManager.saveMcpConfig(server);
      
      // Reconnect the client with new config
      const client = appState?.mcpManager.getClient(server.name);
      if (client) {
        await client.disconnect();
        // appState?.mcpManager.deleteClient(server.name);
      }
      
      // Create and connect a new client with the updated configuration
      try {
        const newClient = createMcpClientFromConfig(appState, server);
        await newClient.connect();
        appState.mcpManager.updateClient(server.name, newClient);
        log.info(`Reconnected MCP client for server: ${server.name}`);
      } catch (error) {
        log.error(`Error reconnecting MCP client for ${server.name}:`, error);
        throw new Error(`Failed to reconnect server: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (err) {
      log.error('Error saving server config:', err);
      throw err;
    }
  });

  ipcMain.handle('reloadServerInfo', async (event, serverName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    if (!appState) {
      log.warn('[MAIN] reloadServerInfo: No app state found for window');
      return;
    }

    try {
      // Get current server configuration
      const currentWindowId = BrowserWindow.getFocusedWindow()?.id.toString();
      if (!currentWindowId) {
        log.warn('No focused window found when reloading server info');
        throw new Error('No focused window found');
      }
      
      const activeWindows = workspaceManager.getActiveWindows();
      const currentWindow = activeWindows.find(w => w.windowId === currentWindowId);
      
      if (!currentWindow) {
        log.warn('No workspace selected, cannot reload server info');
        throw new Error('No workspace selected');
      }

      const configManager = await workspaceManager.configManager(currentWindow.workspacePath);
      const mcpServers = await configManager.getMcpConfig();
      const serverConfig = mcpServers[serverName];
      
      if (!serverConfig) {
        log.error(`No configuration found for server: ${serverName}`);
        throw new Error(`No configuration found for server: ${serverName}`);
      }
      
      // Disconnect existing client if any
      const client = appState?.mcpManager.getClient(serverName);
      if (client) {
        await client.disconnect();
      }
      
      // Create and connect a new client
      const newClient = createMcpClientFromConfig(appState, serverConfig);
      await newClient.connect();
      appState.mcpManager.updateClient(serverName, newClient);
      
      log.info(`Reloaded MCP client for server: ${serverName}`);
    } catch (err) {
      log.error('Error reloading server info:', err);
      throw err;
    }
  });

  ipcMain.handle('deleteServerConfig', async (event, serverName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const appState = getAppStateForWindow(windowId);
    if (!appState) {
      log.warn('[MAIN] deleteServerConfig: No app state found for window');
      return;
    }

    try {
      // Check if a workspace is selected
      const currentWindowId = BrowserWindow.getFocusedWindow()?.id.toString();
      if (!currentWindowId) {
        log.warn('No focused window found when deleting server config');
        throw new Error('No focused window found');
      }
      
      const activeWindows = workspaceManager.getActiveWindows();
      const currentWindow = activeWindows.find(w => w.windowId === currentWindowId);
      
      if (!currentWindow) {
        log.warn('No workspace selected, cannot delete server config');
        throw new Error('No workspace selected');
      }
      
      // Get the ConfigManager for the current workspace
      const configManager = await workspaceManager.configManager(currentWindow.workspacePath);
      await configManager.deleteMcpConfig(serverName);
      
      // Disconnect and remove the client
      const client = appState?.mcpManager.getClient(serverName);
      if (client) {
        client.disconnect();
        // appState?.mcpManager.deleteClient(serverName);
      }
    } catch (err) {
      log.error('Error deleting server config:', err);
      throw err;
    }  
  });

  // Workspace IPC handlers
  ipcMain.handle('dialog:showOpenDialog', (_, options) => {
    return dialog.showOpenDialog(options);
  });

  ipcMain.handle('workspace:getActiveWindows', () => {
    return workspaceManager.getActiveWindows();
  });

  ipcMain.handle('workspace:getRecentWorkspaces', () => {
    return workspaceManager.getRecentWorkspaces();
  });

  ipcMain.handle('workspace:getCurrentWindowId', (event) => {
    // Get the window that sent the request
    const currentWindow = BrowserWindow.fromWebContents(event.sender);
    if (!currentWindow) {
      log.warn('No window found for the renderer process');
      return null;
    }
    
    const windowId = currentWindow.id.toString();
    // Log active windows in WorkspaceManager
    const activeWindows = workspaceManager.getActiveWindows();
    log.info(`[WINDOW ID] Current window ID: ${windowId}, Active windows in WorkspaceManager: ${activeWindows.map((w: any) => w.windowId).join(', ')}`);
    
    // Check if the window is registered with the WorkspaceManager
    const isRegistered = activeWindows.some(window => window.windowId === windowId);
    if (!isRegistered) {
      log.info(`[WINDOW ID] Window ${windowId} is not registered with WorkspaceManager. No workspace selected.`);
      // No longer automatically registering with a default workspace
    }
    
    return windowId;
  });

  // Open the workspace at filePath in the current window, or if no current window, create a new one
  //
  ipcMain.handle('workspace:openWorkspace', async (_, filePath: string) => {
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
      log.info(`[WORKSPACE OPEN] Opening workspace ${workspacePath} in current window ${currentWindow.id}`);
      
      await initializeWorkspace(workspacePath, currentWindow.id.toString());

      // Unregister the window from its current workspace
      workspaceManager.unregisterWindow(currentWindow.id.toString());
      
      // Register the window with the new workspace
      await workspaceManager.registerWindow(currentWindow.id.toString(), workspacePath);
            
      // Return the current window's ID
      return currentWindow.id;
    }
    
    // If no current window exists, create a new one
    log.info(`[WORKSPACE OPEN] No current window, creating new window for workspace ${workspacePath}`);
    const window = await createWindow(workspacePath);
    return window.id;
  });

  // Open the workspace at filePath in a new window
  //
  ipcMain.handle('workspace:openInNewWindow', async (_, filePath: string) => {
    log.info(`[WORKSPACE OPEN] Opening workspace ${filePath} in a new window`);
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
    const window = await createWindow(workspacePath);
    return window.id;
  });

  ipcMain.handle('workspace:createWorkspace', async (_, workspacePath: string) => {
    // Create workspace using WorkspaceManager
    await workspaceManager.createWorkspace(workspacePath);
    
    const window = await createWindow(workspacePath);
    return window.id;
  });

  // Switch to the workspace at workspacePath in the window with id windowId (typically the current window)
  //
  ipcMain.handle('workspace:switchWorkspace', async (_, windowId: string, workspacePath: string) => {
    try {
      log.info(`[WORKSPACE SWITCH] IPC handler called for window ${windowId} to workspace ${workspacePath}`);
      // Convert windowId to string to ensure consistent handling
      const windowIdStr = windowId.toString();
      
      // Check if the window is registered with the WorkspaceManager
      const activeWindows = workspaceManager.getActiveWindows();
      const isRegistered = activeWindows.some(window => window.windowId === windowIdStr);

      await initializeWorkspace(workspacePath, windowIdStr);

      if (!isRegistered) {
        log.info(`[WORKSPACE SWITCH] Window ${windowIdStr} is not registered with WorkspaceManager, registering first`);
        // Register the window with the workspace
        await workspaceManager.registerWindow(windowIdStr, workspacePath);
      } else {
        // Switch to the workspace
        await workspaceManager.switchWorkspace(windowIdStr, workspacePath);
      }
      
      log.info(`[WORKSPACE SWITCH] Successfully switched workspace in IPC handler`);
      return true;
    } catch (error) {
      log.error(`[WORKSPACE SWITCH] Error in IPC handler switching window ${windowId} to workspace ${workspacePath}:`, error);
      return false;
    }
  });

  // Handle workspace switching
  ipcMain.on('workspace:switched', async (event, { windowId, workspacePath }) => {
    try {
      log.info(`[WORKSPACE MANAGER] Reloading workspace for window ${windowId} at ${workspacePath}`);
      
      // Get the window that sent the request
      const currentWindow = BrowserWindow.fromWebContents(event.sender);
      if (!currentWindow) {
        log.warn('No window found for the renderer process');
        return;
      }
      
      // Verify that the window ID matches the window that sent the request
      if (currentWindow.id.toString() !== windowId) {
        log.warn(`[WORKSPACE MANAGER] Window ID mismatch: expected ${windowId}, got ${currentWindow.id}`);
        return;
      }
      
      // Unregister and register the window to update the workspace
      workspaceManager.unregisterWindow(windowId);
      await workspaceManager.registerWindow(windowId, workspacePath);
      
      // Re-initialize global managers and state based on the new workspace path
      await initializeWorkspace(workspacePath, windowId);
      
      log.info(`[WORKSPACE MANAGER] Workspace initialization completed for ${workspacePath}`);
    } catch (error) {
      log.error('[WORKSPACE MANAGER] Error during workspace initialization:', error);
    }
  });

  // After the other workspace IPC handlers
  ipcMain.handle('workspace:focusWindow', (_, windowId: string) => {
    try {
      log.info(`[WINDOW FOCUS] Focusing window: ${windowId}`);
      const allWindows = BrowserWindow.getAllWindows();
      const window = allWindows.find(w => w.id.toString() === windowId);
      
      if (!window) {
        log.warn(`[WINDOW FOCUS] Window with ID ${windowId} not found`);
        return false;
      }
      
      if (window.isMinimized()) {
        window.restore();
      }
      window.focus();
      return true;
    } catch (error) {
      log.error(`[WINDOW FOCUS] Error focusing window ${windowId}:`, error);
      return false;
    }
  });
}

startApp(); 