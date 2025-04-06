import { app, BrowserWindow, ipcMain, shell, Menu, dialog } from 'electron';
import * as path from 'path';
import { LLMFactory } from './llm/llmFactory';
import { LLMType } from './llm/types';
import { createMcpClientFromConfig } from './mcp/client';
import { MCPClientManager } from './mcp/manager';
import { RulesManager } from './state/RulesManager';
import { ReferencesManager } from './state/ReferencesManager';
import log from 'electron-log';
import 'dotenv/config';
import * as fs from 'fs';
import { setupCLI } from './cli';
import { McpClient, McpConfig, McpConfigFileServerConfig, determineServerType } from './mcp/types';
import { ConfigManager } from './state/ConfigManager';
import { ChatSessionManager } from './state/ChatSessionManager';
import { AppState } from './state/AppState';
import { WorkspaceManager } from './main/workspaceManager';

// Configure electron-log
// Remove the global ConfigManager instance
const __dirname = path.dirname(__filename);

// Declare managers and paths
let mcpManager: MCPClientManager;
let rulesManager: RulesManager;
let referencesManager: ReferencesManager;
let chatSessionManager: ChatSessionManager;
let appState: AppState;
let mainWindow: BrowserWindow | null = null;
const DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";
const llmTypes = new Map<string, LLMType>();

function createWindow(workspacePath?: string): BrowserWindow {
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
  
  window.webContents.openDevTools();

  // Set up event listener for rules changes
  // Use global rulesManager if available
  if (rulesManager) {
    rulesManager.on('rulesChanged', () => {
      if (window) {
        window.webContents.send('rules-changed');
      }
    });
  }

  // Set up event listener for references changes
  // Use global referencesManager if available
  if (referencesManager) {
    referencesManager.on('referencesChanged', () => {
      if (window) {
        window.webContents.send('references-changed');
      }
    });
  }

  // Set up event listener for workspace changes
  const workspaceManager = WorkspaceManager.getInstance();
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
}

// Initialize a workspace when one is selected
export async function initializeWorkspace(workspacePath: string) {
  log.info(`Initializing workspace: ${workspacePath}`);
  
  // Get the ConfigManager for this workspace
  const configManager = await WorkspaceManager.getInstance().getConfigManager(workspacePath);
  
  // Get the config directory for this workspace
  const configDir = configManager.getConfigDir();
  log.info(`Using config directory: ${configDir}`);
  
  // Initialize managers
  log.info('Initializing managers with config directory:', configDir);
  rulesManager = new RulesManager(configDir);
  referencesManager = new ReferencesManager(configDir);

  // Create AppState
  appState = new AppState(configManager, rulesManager, referencesManager, null as any);

  // Initialize MCP clients
  const mcpServers = await configManager.getMcpConfig();
  for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
    try {
      if (!serverConfig || !serverConfig.config) {
        log.error(`Invalid server configuration for ${serverName}: missing config property`);
        continue;
      }

      const client = createMcpClientFromConfig(appState, serverConfig);      
      if (client) {
        await client.connect();
        mcpClients.set(serverName, client);
      } else {
        throw new Error(`Failed to create client for server: ${serverName}`);
      }
    } catch (error) {
      log.error(`Error initializing MCP client for ${serverName}:`, error);
    }
  }

  // Initialize MCP client manager with the connected clients
  const mcpClientManager = new MCPClientManager(appState, mcpClients);

  // Set MCP client manager in AppState
  appState.setMCPManager(mcpClientManager);
  
  // Initialize ChatSessionManager with AppState
  chatSessionManager = new ChatSessionManager(appState);

  // Initialize the LLM Factory with AppState
  log.info('Initializing LLMFactory with AppState');
  LLMFactory.initialize(appState);

  log.info('Workspace initialization complete');
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
    setupCLI();
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
    const llmInstances = new Map<string, ReturnType<typeof LLMFactory.create>>();

    // Move initialization into the ready event
    app.whenReady().then(async () => {
      log.info('App ready, starting initialization');
      await initialize();
      log.info('Initialization complete, creating window');
      mainWindow = createWindow();
      
      // Initialize workspace if provided
      if (process.argv.length > 2) {
        const workspacePath = process.argv[2];
        await initializeWorkspace(workspacePath);
      }

      // Set up IPC handlers after workspace initialization
      setupIpcHandlers();
    });

    // Add a small delay before quitting to ensure cleanup
    app.on('window-all-closed', () => {
      setTimeout(() => {
        app.quit();
      }, 100);
    });

    app.on('activate', () => {
      if (mainWindow === null) {
        mainWindow = createWindow();
      }
    });
  }
}

function setupIpcHandlers() {
  // Rules IPC handlers
  ipcMain.handle('get-rules', () => {
    if (!rulesManager) {
      log.warn('RulesManager not initialized');
      return [];
    }
    return rulesManager.getRules();
  });

  ipcMain.handle('save-rule', (_, rule) => {
    if (!rulesManager) {
      log.warn('RulesManager not initialized');
      throw new Error('RulesManager not initialized');
    }
    return rulesManager.saveRule(rule);
  });

  ipcMain.handle('delete-rule', (_, name) => {
    if (!rulesManager) {
      log.warn('RulesManager not initialized');
      throw new Error('RulesManager not initialized');
    }
    return rulesManager.deleteRule(name);
  });

  // References IPC handlers
  ipcMain.handle('get-references', () => {
    if (!referencesManager) {
      log.warn('ReferencesManager not initialized');
      return [];
    }
    return referencesManager.getReferences();
  });

  ipcMain.handle('save-reference', (_, reference) => {
    if (!referencesManager) {
      log.warn('ReferencesManager not initialized');
      throw new Error('ReferencesManager not initialized');
    }
    return referencesManager.saveReference(reference);
  });

  ipcMain.handle('delete-reference', (_, name) => {
    if (!referencesManager) {
      log.warn('ReferencesManager not initialized');
      throw new Error('ReferencesManager not initialized');
    }
    return referencesManager.deleteReference(name);
  });

  // Chat session IPC handlers
  ipcMain.handle('create-chat-tab', (_, tabId: string) => {
    if (!chatSessionManager) {
      log.warn('ChatSessionManager not initialized');
      throw new Error('ChatSessionManager not initialized');
    }
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
    if (!chatSessionManager) {
      log.warn('ChatSessionManager not initialized');
      throw new Error('ChatSessionManager not initialized');
    }
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
    if (!chatSessionManager) {
      log.warn('ChatSessionManager not initialized');
      throw new Error('ChatSessionManager not initialized');
    }
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
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) {
      log.warn('No focused window found when getting server configs');
      return [];
    }

    const windowId = focusedWindow.id;
    const workspaceManager = WorkspaceManager.getInstance();
    const activeWindows = workspaceManager.getActiveWindows();
    const currentWindow = activeWindows.find(w => w.windowId === windowId.toString());
    
    if (!currentWindow) {
      log.warn('No workspace found for window when getting server configs');
      return [];
    }

    try {
      const configManager = await workspaceManager.getConfigManager(currentWindow.workspacePath);
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
      
      const workspaceManager = WorkspaceManager.getInstance();
      const activeWindows = workspaceManager.getActiveWindows();
      const currentWindow = activeWindows.find(w => w.windowId === currentWindowId);
      
      if (!currentWindow) {
        log.warn('No workspace selected, cannot get MCP client');
        throw new Error('No workspace selected');
      }
      
      // Get the ConfigManager for the current workspace
      const configManager = await workspaceManager.getConfigManager(currentWindow.workspacePath);
      
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
      
      const workspaceManager = WorkspaceManager.getInstance();
      const activeWindows = workspaceManager.getActiveWindows();
      const currentWindow = activeWindows.find(w => w.windowId === currentWindowId);
      
      if (!currentWindow) {
        log.warn('No workspace selected, using default prompt');
        return DEFAULT_PROMPT;
      }
      
      // Get the ConfigManager for the current workspace
      const configManager = await workspaceManager.getConfigManager(currentWindow.workspacePath);
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
      
      const workspaceManager = WorkspaceManager.getInstance();
      const activeWindows = workspaceManager.getActiveWindows();
      const currentWindow = activeWindows.find(w => w.windowId === currentWindowId);
      
      if (!currentWindow) {
        log.warn('No workspace selected, cannot save system prompt');
        throw new Error('No workspace selected');
      }
      
      // Get the ConfigManager for the current workspace
      const configManager = await workspaceManager.getConfigManager(currentWindow.workspacePath);
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
    log.info(`[WINDOW ID] All windows: ${allWindows.map(w => w.id.toString()).join(', ')}`);
    
    // Log active windows in WorkspaceManager
    const workspaceManager = WorkspaceManager.getInstance();
    const activeWindows = workspaceManager.getActiveWindows();
    log.info(`[WINDOW ID] Active windows in WorkspaceManager: ${activeWindows.map(w => w.windowId).join(', ')}`);
    
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
      WorkspaceManager.getInstance().unregisterWindow(currentWindow.id.toString());
      
      // Register the window with the new workspace
      await WorkspaceManager.getInstance().registerWindow(currentWindow.id.toString(), workspacePath);
      
      // Return the current window's ID
      return currentWindow.id;
    }
    
    // If no current window exists, create a new one
    log.info(`[WORKSPACE OPEN] No current window, creating new window for workspace ${workspacePath}`);
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
      
      // Check if the window is registered with the WorkspaceManager
      const workspaceManager = WorkspaceManager.getInstance();
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
      
      // Re-initialize global managers and state based on the new workspace path
      await initializeWorkspace(workspacePath);
      
      // Notify the renderer process about the workspace switch
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('workspace:switched', {
          windowId,
          workspacePath,
          targetWindowId: windowId // Add targetWindowId to indicate which window should update its content
        });
      });
      
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
    
    const workspaceManager = WorkspaceManager.getInstance();
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
    const configManager = await workspaceManager.getConfigManager(currentWindow.workspacePath);
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
    
    const workspaceManager = WorkspaceManager.getInstance();
    const activeWindows = workspaceManager.getActiveWindows();
    const currentWindow = activeWindows.find(w => w.windowId === currentWindowId);
    
    if (!currentWindow) {
      log.warn('No workspace selected, cannot delete server config');
      throw new Error('No workspace selected');
    }
    
    // Get the ConfigManager for the current workspace
    const configManager = await workspaceManager.getConfigManager(currentWindow.workspacePath);
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