import { app, BrowserWindow, ipcMain, shell, Menu, dialog } from 'electron';
import * as path from 'path';
import { LLMFactory } from './llm/llmFactory';
import { LLMType } from './llm/types';
import { createMcpClientFromConfig } from './mcp/client';
import log from 'electron-log';
import 'dotenv/config';
import * as fs from 'fs';
import { setupCLI } from './cli';
import { McpClient, McpConfig } from './mcp/types';
import { ConfigManager } from './state/ConfigManager';
import { AppState } from './state/AppState';
import { WorkspaceManager } from './main/workspaceManager';

// Configure electron-log
// Remove the global ConfigManager instance
const __dirname = path.dirname(__filename);

// Declare managers and paths
let appState: AppState;
let workspaceManager: WorkspaceManager;
const DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";
const llmTypes = new Map<string, LLMType>();

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

  /* !!! This used to rely on app-global rules and references managers, but now we rely on the workspace-specific ones
  // Set up event listener for rules changes
  // Use global rulesManager if available
  if (appState.rulesManager) {
    appState.rulesManager.on('rulesChanged', () => {
      if (window) {
        window.webContents.send('rules-changed');
      }
    });
  }

  // Set up event listener for references changes
  // Use global referencesManager if available
  if (appState.referencesManager) {
    appState.referencesManager.on('referencesChanged', () => {
      if (window) {
        window.webContents.send('references-changed');
      }
    });
  }
  */

  if (workspacePath) {
    await initializeWorkspace(workspacePath);
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
export async function initializeWorkspace(workspacePath: string) {
  log.info(`Initializing workspace: ${workspacePath}`);
  
  // Get the ConfigManager for this workspace
  const configManager = await workspaceManager.configManager(workspacePath);
  
  // Get the config directory for this workspace
  const configDir = configManager.getConfigDir();
  log.info(`Using config directory: ${configDir}`);
  
  // Create AppState - !!! This is global currently, needs to be per-workspace (window)
  appState = new AppState(configManager);
  await appState.initialize();
  
  log.info('Workspace initialization complete');
}

function intializeLogging(isElectron: boolean) {
  if (isElectron) {
    log.initialize({ preload: true }); // Required to wire up the renderer (will crash the CLI)
    // Use a temporary log file in the user data directory instead of config directory
    const userDataPath = app.getPath('userData');
    log.transports.file.resolvePathFn = () => path.join(userDataPath, 'app.log');
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
  
  // We no longer initialize any configuration, app state, or workspace on startup
  // These will be initialized only when a workspace is selected
  log.info('No workspace selected, skipping initialization of configuration and app state');

  // Create and initialize WorkspaceManager
  workspaceManager = new WorkspaceManager();
  await workspaceManager.initialize();
}

// Near the top with other state
const mcpClients = new Map<string, McpClient>();

async function startApp() {
  if (process.argv.includes('--cli')) {
    // For CLI mode, use the config directory within the current directory
    const workspacePath = path.join(process.cwd(), 'config');
    log.info(`CLI mode: Using config directory: ${workspacePath}`);
    
    // For CLI mode, we still need to create a ConfigManager
    const configManager = ConfigManager.getInstance(false);
    configManager.setConfigPath(workspacePath);
    intializeLogging(false);
    await initialize();

    const appState = new AppState(configManager);
    await appState.initialize();

    // Initialize the LLM Factory with AppState
    setupCLI(appState);
  } else {
    // For GUI mode, we don't create a ConfigManager at all on startup
    log.info(`GUI mode: No workspace selected on startup`);
    
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
      await initialize();
      log.info('Initialization complete, creating window');
      mainWindow = await createWindow();

      /* !!!
      // Initialize workspace if provided via command line
      let workspacePathArg: string | null = null;
      for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        // Ignore flags (arguments starting with - or --)
        if (!arg.startsWith('-')) {
          workspacePathArg = arg;
          break; // Found the first non-flag argument, assume it's the workspace path
        }
      }

      if (workspacePathArg) {
        log.info(`Found potential workspace path argument: ${workspacePathArg}`);
        try {
          // Optional: Add validation here to check if it's a valid path/directory
          // For now, we'll assume it's correct if provided
          await initializeWorkspace(workspacePathArg);
        } catch (error) {
          log.error(`Error initializing workspace from command line argument '${workspacePathArg}':`, error);
          // Handle error appropriately, maybe show a dialog to the user
        }
      } else {
        log.info('No workspace path provided via command line arguments.');
      }
      */

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
  ipcMain.handle('get-rules', () => {
    if (!appState.rulesManager) {
      log.warn('RulesManager not initialized');
      return [];
    }
    return appState.rulesManager.getRules();
  });

  ipcMain.handle('save-rule', (_, rule) => {
    if (!appState.rulesManager) {
      log.warn('RulesManager not initialized');
      throw new Error('RulesManager not initialized');
    }
    return appState.rulesManager.saveRule(rule);
  });

  ipcMain.handle('delete-rule', (_, name) => {
    if (!appState.rulesManager) {
      log.warn('RulesManager not initialized');
      throw new Error('RulesManager not initialized');
    }
    return appState.rulesManager.deleteRule(name);
  });

  // References IPC handlers
  ipcMain.handle('get-references', () => {
    if (!appState.referencesManager) {
      log.warn('ReferencesManager not initialized');
      return [];
    }
    return appState.referencesManager.getReferences();
  });

  ipcMain.handle('save-reference', (_, reference) => {
    if (!appState.referencesManager) {
      log.warn('ReferencesManager not initialized');
      throw new Error('ReferencesManager not initialized');
    }
    return appState.referencesManager.saveReference(reference);
  });

  ipcMain.handle('delete-reference', (_, name) => {
    if (!appState.referencesManager) {
      log.warn('ReferencesManager not initialized');
      throw new Error('ReferencesManager not initialized');
    }
    return appState.referencesManager.deleteReference(name);
  });

  // Chat session IPC handlers
  ipcMain.handle('create-chat-tab', (_, tabId: string) => {
    if (!appState.chatSessionManager) {
      log.warn('ChatSessionManager not initialized');
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

  ipcMain.handle('close-chat-tab', (_, tabId: string) => {
    if (!appState.chatSessionManager) {
      log.warn('ChatSessionManager not initialized');
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

  ipcMain.handle('get-chat-state', (_, tabId: string) => {
    if (!appState.chatSessionManager) {
      log.warn('ChatSessionManager not initialized');
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      return appState.chatSessionManager.getSessionState(tabId);
    } catch (error) {
      log.error('Error getting chat state:', error);
      throw error;
    }
  });

  ipcMain.handle('send-message', async (_, tabId: string, message: string) => {
    try {
      return await appState.chatSessionManager.handleMessage(tabId, message);
    } catch (error) {
      log.error('Error sending message:', error);
      throw error;
    }
  });

  ipcMain.handle('switch-model', (_, tabId: string, modelType: LLMType) => {
    try {
      const result = appState.chatSessionManager.switchModel(tabId, modelType);
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

  ipcMain.handle('get-current-model', (_, tabId: string) => {
    return llmTypes.get(tabId) || LLMType.Test;
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

  ipcMain.handle('get-mcp-client', async (_, serverName: string) => {
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
      
      // Get the ConfigManager for the current workspace
      const configManager = await workspaceManager.configManager(currentWindow.workspacePath);
      
      let client = mcpClients.get(serverName);
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
        
        const config = serverConfig.config;
        
        client = createMcpClientFromConfig(appState, serverConfig);      
        if (client) {
          await client.connect();
          mcpClients.set(serverName, client);
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

  ipcMain.handle('saveServerConfig', async (_, server: McpConfig) => {
    await saveServerConfig(server);
  });

  ipcMain.handle('deleteServerConfig', async (_, serverName: string) => {
    await deleteServerConfig(serverName);
  });

  // Workspace IPC handlers
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
    log.info(`[WINDOW ID] Current window ID: ${windowId}`);
    
    // Log all windows
    const allWindows = BrowserWindow.getAllWindows();
    log.info(`[WINDOW ID] All windows: ${allWindows.map((w: BrowserWindow) => w.id.toString()).join(', ')}`);
    
    // Log active windows in WorkspaceManager
    const activeWindows = workspaceManager.getActiveWindows();
    log.info(`[WINDOW ID] Active windows in WorkspaceManager: ${activeWindows.map((w: any) => w.windowId).join(', ')}`);
    
    // Check if the window is registered with the WorkspaceManager
    const isRegistered = activeWindows.some(window => window.windowId === windowId);
    if (!isRegistered) {
      log.info(`[WINDOW ID] Window ${windowId} is not registered with WorkspaceManager. No workspace selected.`);
      // No longer automatically registering with a default workspace
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
      log.info(`[WORKSPACE OPEN] Opening workspace ${workspacePath} in current window ${currentWindow.id}`);
      
      // Unregister the window from its current workspace
      workspaceManager.unregisterWindow(currentWindow.id.toString());
      
      // Register the window with the new workspace
      await workspaceManager.registerWindow(currentWindow.id.toString(), workspacePath);
      
      await initializeWorkspace(workspacePath); // !!! ???

      // Return the current window's ID
      return currentWindow.id;
    }
    
    // If no current window exists, create a new one
    log.info(`[WORKSPACE OPEN] No current window, creating new window for workspace ${workspacePath}`);
    const window = await createWindow(workspacePath);
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
    const window = await createWindow(workspacePath);
    return window.id;
  });

  ipcMain.handle('workspace:create', async (_, workspacePath: string) => {
    // Create workspace using WorkspaceManager
    await workspaceManager.createWorkspace(workspacePath);
    
    const window = await createWindow(workspacePath);
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
      
      // Check if the window is registered with the WorkspaceManager
      const activeWindows = workspaceManager.getActiveWindows();
      const isRegistered = activeWindows.some(window => window.windowId === windowIdStr);
      
      if (!isRegistered) {
        log.info(`[WORKSPACE SWITCH] Window ${windowIdStr} is not registered with WorkspaceManager, registering first`);
        // Register the window with the workspace
        workspaceManager.registerWindow(windowIdStr, workspacePath);
      } else {
        // Switch to the workspace
        await workspaceManager.switchWorkspace(windowIdStr, workspacePath);
      }

      await initializeWorkspace(workspacePath); // !!! ???
      
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
      await initializeWorkspace(workspacePath);
      
      log.info(`[WORKSPACE MANAGER] Workspace initialization completed for ${workspacePath}`);
    } catch (error) {
      log.error('[WORKSPACE MANAGER] Error during workspace initialization:', error);
    }
  });
}

// Add these functions near the top with other config handling
async function saveServerConfig(server: McpConfig) {
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