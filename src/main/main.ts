import { app, BrowserWindow, ipcMain, shell, Menu, dialog } from 'electron';
import * as path from 'path';
import { LLMType } from '../shared/llm';
import { createMcpClientFromConfig } from './mcp/client';
import log from 'electron-log';
import * as fs from 'fs';
import { setupCLI } from '../cli/cli';
import { McpConfig } from './mcp/types';
import { WorkspacesManager } from './state/WorkspacesManager';
import { WorkspaceManager } from './state/WorkspaceManager';
import chalk from 'chalk';

const __dirname = path.dirname(__filename);

// Declare managers and paths
let workspacesManager: WorkspacesManager;
const PRODUCT_NAME = 'TeamSpark AI Workbench';
const DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";

async function createWindow(workspace?: WorkspaceManager): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    title: PRODUCT_NAME,
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

  if (workspace) {
    workspacesManager.registerWindow(window.id.toString(), workspace);
  }

  // Load the index.html file
  const indexPath = path.join(__dirname, 'index.html');
  log.info('Loading index.html from:', indexPath);
  log.info('File exists:', fs.existsSync(indexPath));
  window.loadFile(indexPath);

  window.on('close', () => {
    workspacesManager.switchWorkspace(window.id.toString(), null);
  });

  return window;
}

// Helper function to get the Workspace for a window
function getWorkspaceForWindow(windowId?: string): WorkspaceManager | null {
  if (!windowId) {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) {
      log.warn('No window ID provided and no focused window found');
      return null;
    }
    windowId = focusedWindow.id.toString();
  }
  
  const workspace = workspacesManager.getWorkspaceForWindow(windowId);
  if (!workspace) {
    log.warn(`No WorkspaceManager found for window: ${windowId}`);
    return null;
  }
  
  return workspace;
}

function intializeLogging(isElectron: boolean) {
  if (isElectron) {
    log.initialize({ preload: true }); // Required to wire up the renderer (will crash the CLI)
    const userDataPath = app.getPath('userData');
    log.transports.file.resolvePathFn = () => path.join(userDataPath, `tspark.log`);
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
    log.transports.file.maxSize = 1024 * 1024 * 10; // 10MB
    log.transports.file.level = 'info';
    log.transports.console.level = 'info';
  } else {
    log.transports.file.resolvePathFn = () => path.join(process.cwd(), `tspark-console.log`);
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
    log.transports.file.maxSize = 1024 * 1024 * 10; // 10MB
    log.transports.file.level = 'info';
    log.transports.console.level = 'error'; // In CLI mode, only show error and above to the console
  }
  log.info('App starting...');
}

// Initialize paths and managers
async function initializeWorkspaceManager() {
  log.info('Starting initialization process');

  // Create and initialize WorkspaceManager
  workspacesManager = new WorkspacesManager();
  await workspacesManager.initialize();
}

async function startApp() {
  if (process.argv.includes('--cli')) {
    intializeLogging(false);

    // -- workspace (path) the workspace directory or file (tspark.json), defaults to cwd
    // -- create (bool) indicates whether the path should be created if it doesn't exist
    //
    let workspacePath = process.cwd();
    let create = false;
    for (let i = 0; i < process.argv.length; i++) {
      if (process.argv[i] === '--workspace') {
        // Resolve workspace path relative to cwd (unless it's an absolute path)
        workspacePath = path.resolve(process.argv[i + 1]);
      } else if (process.argv[i] === '--create') {
        create = true;
      }
    }

    const workspaceManager = await WorkspaceManager.create(workspacePath, create);
    if (!workspaceManager) {
      console.error(chalk.red(`${PRODUCT_NAME} failed to locate workspace (tspark.json) in directory: `), workspacePath);
      console.error(chalk.dim('  Use '), chalk.bold('--workspace <path>'), chalk.dim(' absolute or relative path to a workspace directory (where tspark.json will be found or created)'));
      console.error(chalk.dim('  Use '), chalk.bold('--create'), chalk.dim(' to create a new workspace in the specified directory, or current working directory if workspace path not specified'));
      process.exit(1);
    }

    setupCLI(workspaceManager);
  } else {
    // Set app name before anything else
    process.env.ELECTRON_APP_NAME = PRODUCT_NAME;
    app.setName(PRODUCT_NAME);

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
        const workspace = await WorkspaceManager.create(workspacePath);
        if (!workspace) {
          log.error('Failed to find workspace (tspark.json) in directory provide on launch command line: ', workspacePath);
          // !!! Ideally we should show the user this message in the UX
          mainWindow = await createWindow();
        } else {
          mainWindow = await createWindow(workspace);
        }
      } else {
        // Else if there is a most recently used workspace, open that 
        const mostRecentlyUsedWorkspace = workspacesManager.getRecentWorkspaces(); // !!! Should this be workspaceManager.getLastActiveWorkspace()?
        if (mostRecentlyUsedWorkspace.length > 0) {
          log.info(`Opening most recently used workspace: ${mostRecentlyUsedWorkspace[0]}`);
          const workspace = await WorkspaceManager.create(mostRecentlyUsedWorkspace[0]);
          if (!workspace) {
            log.error('Failed to find workspace (tspark.json) in most recently used directory: ', mostRecentlyUsedWorkspace[0]);
            // !!! Ideally we should show the user this message in the UX
            mainWindow = await createWindow();
          } else {
            mainWindow = await createWindow(workspace);
          }
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
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.rulesManager) {
      log.warn(`RulesManager not initialized for window: ${windowId}`);
      return [];
    }
    return workspace.rulesManager.getRules();
  });

  ipcMain.handle('rules:save-rule', (event, rule) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.rulesManager) {
      log.warn(`RulesManager not initialized for window: ${windowId}`);
      throw new Error('RulesManager not initialized');
    }
    return workspace.rulesManager.saveRule(rule);
  });

  ipcMain.handle('rules:delete-rule', (event, name) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.rulesManager) {
      log.warn(`RulesManager not initialized for window: ${windowId}`);
      throw new Error('RulesManager not initialized');
    }
    return workspace.rulesManager.deleteRule(name);
  });

  // References IPC handlers
  ipcMain.handle('references:get-references', (event) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.referencesManager) {
      log.warn(`ReferencesManager not initialized for window: ${windowId}`);
      return [];
    }
    return workspace.referencesManager.getReferences();
  });

  ipcMain.handle('references:save-reference', (event, reference) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.referencesManager) {
      log.warn(`ReferencesManager not initialized for window: ${windowId}`);
      throw new Error('ReferencesManager not initialized');
    }
    return workspace.referencesManager.saveReference(reference);
  });

  ipcMain.handle('references:delete-reference', (event, name) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.referencesManager) {
      log.warn(`ReferencesManager not initialized for window: ${windowId}`);
      throw new Error('ReferencesManager not initialized');
    }
    return workspace.referencesManager.deleteReference(name);
  });

  // Chat session IPC handlers
  ipcMain.handle('chat:create-tab', (event, tabId: string, modelProvider?: LLMType, modelId?: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      workspace.chatSessionManager.createSession(tabId, {
        modelProvider: modelProvider,
        modelId: modelId
      });
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
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      workspace.chatSessionManager.deleteSession(tabId);
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
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      if (!workspace.chatSessionManager.hasSession(tabId)) {
        log.info(`No session exists for tab ${tabId}, returning null`);
        return null;
      }
      return workspace.chatSessionManager.getSessionState(tabId);
    } catch (error) {
      log.error('Error getting chat state:', error);
      throw error;
    }
  });

  ipcMain.handle('chat:send-message', async (event, tabId: string, message: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      return await workspace.chatSessionManager.handleMessage(tabId, message);
    } catch (error) {
      log.error('Error sending message:', error);
      throw error;
    }
  });

  ipcMain.handle('chat:add-reference', (event, tabId: string, referenceName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      return workspace.chatSessionManager.addReference(tabId, referenceName);
    } catch (error) {
      log.error(`Error adding reference '${referenceName}' to chat session:`, error);
      throw error;
    }
  });

  ipcMain.handle('chat:remove-reference', (event, tabId: string, referenceName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      return workspace.chatSessionManager.removeReference(tabId, referenceName);
    } catch (error) {
      log.error(`Error removing reference '${referenceName}' from chat session:`, error);
      throw error;
    }
  });

  ipcMain.handle('chat:add-rule', (event, tabId: string, ruleName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      return workspace.chatSessionManager.addRule(tabId, ruleName);
    } catch (error) {
      log.error(`Error adding rule '${ruleName}' to chat session:`, error);
      throw error;
    }
  });

  ipcMain.handle('chat:remove-rule', (event, tabId: string, ruleName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      return workspace.chatSessionManager.removeRule(tabId, ruleName);
    } catch (error) {
      log.error(`Error removing rule '${ruleName}' from chat session:`, error);
      throw error;
    }
  });


  ipcMain.handle('chat:clear-model', (event, tabId: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      const result = workspace.chatSessionManager.clearModel(tabId);
      return { 
        success: true,
        updates: result.updates,
        lastSyncId: result.lastSyncId,
        references: result.references,
        rules: result.rules
      };
    } catch (error) {
      log.error('Error clearing model:', error);
      throw error;
    }
  });

  ipcMain.handle('chat:switch-model', (event, tabId: string, modelType: LLMType, modelId: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      const result = workspace.chatSessionManager.switchModel(tabId, modelType, modelId);
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

  ipcMain.handle('get-server-configs', async (event) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    if (!workspace) {
      log.warn('No workspace found for window:', windowId);
      return [];
    }

    try {
      const mcpServers = await workspace.getMcpConfig();
      
      // If mcpServers is empty or undefined, return an empty array
      if (!mcpServers || Object.keys(mcpServers).length === 0) {
        log.info('No MCP server configurations found in workspace');
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
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    if (!workspace) {
      log.warn('No workspace found for window:', windowId);
      return [];
    }

    try {
      let client = workspace.mcpManager.getClient(serverName);
      let serverType = 'stdio';
      
      if (!client) {
        const mcpServers = await workspace.getMcpConfig();
        
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
        
        // Get the current window's workspace
        const windowworkspace = getWorkspaceForWindow(windowId);
        if (!windowworkspace) {
          throw new Error(`No workspace found for window: ${windowId}`);
        }
        client = createMcpClientFromConfig(windowworkspace, serverConfig);
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
      const workspace = getWorkspaceForWindow(windowId);

      const client = workspace?.mcpManager.getClient(serverName);
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
    const workspace = getWorkspaceForWindow(windowId);

    const client = workspace?.mcpManager.getClient(serverName);
    if (!client) {
      throw new Error(`No MCP client found for server ${serverName}`);
    }
    return client.ping();
  });

  ipcMain.handle('get-system-prompt', async (event) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    if (!workspace) {
      log.warn('No workspace found for window:', windowId);
      return [];
    }

    try {
      log.info('[MAIN PROCESS] getSystemPrompt called');      
      const prompt = await workspace.getSystemPrompt();
      return prompt;
    } catch (err) {
      log.error('[MAIN PROCESS] Error reading system prompt, using default:', err);
      return DEFAULT_PROMPT;
    }
  });

  ipcMain.handle('save-system-prompt', async (event, prompt: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    if (!workspace) {
      log.warn('No workspace found for window:', windowId);
      return [];
    }

    try {      
      // Get the ConfigManager for the current workspace
      await workspace.saveSystemPrompt(prompt);
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
        click: (menuItem, browserWindow) => {
          if (browserWindow) {
            browserWindow.webContents.executeJavaScript(`
              (function() {
                // Select only the chat container content
                const chatContainerEl = document.getElementById('chat-container');
                if (chatContainerEl) {
                  const range = document.createRange();
                  range.selectNodeContents(chatContainerEl);
                  const selection = window.getSelection();
                  selection.removeAllRanges();
                  selection.addRange(range);
                }
              })();
            `);
          }
        }
      }
    ]);

    menu.popup({ x, y });
  });

  // Add IPC handler for edit control context menu
  ipcMain.handle('show-edit-control-menu', (event, editFlags) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    
    const menu = Menu.buildFromTemplate([
      { 
        label: 'Undo', 
        accelerator: 'CmdOrCtrl+Z',
        role: editFlags.canUndo ? 'undo' : undefined,
        enabled: editFlags.canUndo
      },
      { 
        label: 'Redo', 
        accelerator: 'Shift+CmdOrCtrl+Z',
        role: editFlags.canRedo ? 'redo' : undefined,
        enabled: editFlags.canRedo
      },
      { type: 'separator' },
      { 
        label: 'Cut', 
        accelerator: 'CmdOrCtrl+X',
        role: editFlags.canCut ? 'cut' : undefined,
        enabled: editFlags.canCut
      },
      { 
        label: 'Copy', 
        accelerator: 'CmdOrCtrl+C',
        role: editFlags.canCopy ? 'copy' : undefined,
        enabled: editFlags.canCopy
      },
      { 
        label: 'Paste', 
        accelerator: 'CmdOrCtrl+V',
        role: editFlags.canPaste ? 'paste' : undefined,
        enabled: editFlags.canPaste
      },
      { type: 'separator' },
      { 
        label: 'Select All', 
        accelerator: 'CmdOrCtrl+A',
        role: editFlags.canSelectAll ? 'selectAll' : undefined,
        enabled: editFlags.canSelectAll
      }
    ]);

    menu.popup({ window, x: editFlags.x, y: editFlags.y });
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
    const workspace = getWorkspaceForWindow(windowId);
    if (!workspace) {
      log.warn('No workspace found for window:', windowId);
      return [];
    }

    try {      
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
      await workspace.saveMcpConfig(server);
      
      // Reconnect the client with new config
      const client = workspace.mcpManager.getClient(server.name);
      if (client) {
        await client.disconnect();
        // workspace?.mcpManager.deleteClient(server.name);
      }
      
      // Create and connect a new client with the updated configuration
      try {
        const newClient = createMcpClientFromConfig(workspace, server);
        await newClient.connect();
        workspace.mcpManager.updateClient(server.name, newClient);
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
    const workspace = getWorkspaceForWindow(windowId);
    if (!workspace) {
      log.warn('No workspace found for window:', windowId);
      return [];
    }

    try {
      const mcpServers = await workspace.getMcpConfig();
      const serverConfig = mcpServers[serverName];
      
      if (!serverConfig) {
        log.error(`No configuration found for server: ${serverName}`);
        throw new Error(`No configuration found for server: ${serverName}`);
      }
      
      // Disconnect existing client if any
      const client = workspace.mcpManager.getClient(serverName);
      if (client) {
        await client.disconnect();
      }
      
      // Create and connect a new client
      const newClient = createMcpClientFromConfig(workspace, serverConfig);
      await newClient.connect();
      workspace.mcpManager.updateClient(serverName, newClient);
      
      log.info(`Reloaded MCP client for server: ${serverName}`);
    } catch (err) {
      log.error('Error reloading server info:', err);
      throw err;
    }
  });

  ipcMain.handle('deleteServerConfig', async (event, serverName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    if (!workspace) {
      log.warn('No workspace found for window:', windowId);
      return [];
    }

    try {
      await workspace.deleteMcpConfig(serverName);
      
      // Disconnect and remove the client
      const client = workspace.mcpManager.getClient(serverName);
      if (client) {
        client.disconnect();
        // workspace.mcpManager.deleteClient(serverName); // !!!
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
    return workspacesManager.getActiveWindows();
  });

  ipcMain.handle('workspace:getRecentWorkspaces', () => {
    return workspacesManager.getRecentWorkspaces();
  });

  ipcMain.handle('workspace:getCurrentWindowId', (event) => {
    // Get the window that sent the request
    const currentWindow = BrowserWindow.fromWebContents(event.sender);
    if (!currentWindow) {
      log.warn('No window found for the renderer process');
      return null;
    }
    
    return currentWindow.id.toString();
  });

  // Open the workspace at filePath in the current window, or if no current window, create a new one
  //
  ipcMain.handle('workspace:openWorkspace', async (_, filePath: string) => {
    log.info(`[WORKSPACE OPEN] IPC handler called for workspace:openWorkspace ${filePath}`);
    const workspace = await WorkspaceManager.create(filePath);
    if (!workspace) {
      // This is a directory the user just picked, so it should always be a valid workspace
      log.error('Failed to find workspace (tspark.json) in directory provided: ', filePath);
      // !!! Ideally we should show the user this message in the UX
      return null;
    }
    
    // Get the current window
    const currentWindow = BrowserWindow.getFocusedWindow();
    if (currentWindow) {
      log.info(`[WORKSPACE OPEN] Opening workspace ${workspace.workspaceDir} in current window ${currentWindow.id}`);
      workspacesManager.registerWindow(currentWindow.id.toString(), workspace);
            
      // Return the current window's ID
      return currentWindow.id;
    }
    
    // If no current window exists, create a new one
    log.info(`[WORKSPACE OPEN] No current window, creating new window for workspace ${workspace.workspaceDir}`);
    const window = await createWindow(workspace);
    return window.id;
  });

  // Open the workspace at filePath in a new window
  //
  ipcMain.handle('workspace:openInNewWindow', async (_, filePath: string) => {
    log.info(`[WORKSPACE OPEN] Opening workspace ${filePath} in a new window`);
    log.info(`[WORKSPACE OPEN] IPC handler called for workspace:openInNewWindow ${filePath}`);
    const workspace = await WorkspaceManager.create(filePath);
    
    // Always create a new window
    if (!workspace) {
      // This is a directory the user just picked, so it should always be a valid workspace
      log.error('Failed to find workspace (tspark.json) in directory provided: ', filePath);
      // !!! Ideally we should show the user this message in the UX
      return null;
    }

    const window = await createWindow(workspace);
    return window.id;
  });

  // Create NEW workspace
  //
  ipcMain.handle('workspace:createWorkspace', async (_, workspacePath: string) => {
    log.info(`[WORKSPACE CREATE] IPC handler called for workspace:createWorkspace ${workspacePath}`);
    const workspace = await WorkspaceManager.create(workspacePath, true) as WorkspaceManager; // Cannot be null when populateNewWorkspace is true    
    const window = await createWindow(workspace);
    return window.id;
  });

  // Switch to the workspace at workspacePath in the window with id windowId (typically the current window)
  //
  ipcMain.handle('workspace:switchWorkspace', async (_, windowId: string, workspacePath: string) => {
    try {
      log.info(`[WORKSPACE SWITCH] IPC handler called for window ${windowId} to workspace ${workspacePath}`);
      // Convert windowId to string to ensure consistent handling
      const windowIdStr = windowId.toString();

      const workspace = await WorkspaceManager.create(workspacePath);
      if (!workspace) {
        log.error('[WORKSPACE SWITCH] Failed to find workspace (tspark.json) in directory provided: ', workspacePath);
        // !!! Ideally we should show the user this message in the UX
        return false;
      }
      log.info(`[WORKSPACE SWITCH] Workspace found: ${workspace.workspaceDir}`);
      await workspacesManager.switchWorkspace(windowIdStr, workspace);
      return true;
    } catch (error) {
      log.error(`[WORKSPACE SWITCH] Error in IPC handler switching window ${windowId} to workspace ${workspacePath}:`, error);
      return false;
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

  // LLM Provider IPC handlers for model picker
  ipcMain.handle('llm:get-provider-info', (event) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.llmFactory) {
      log.warn(`LLMFactory not initialized for window: ${windowId}`);
      return {};
    }
    return workspace.llmFactory.getProvidersInfo();
  });

  ipcMain.handle('llm:validate-provider-config', async (event, provider: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace) {
      log.warn(`Workspace not found for window: ${windowId}`);
      return { isValid: false, error: 'Workspace not found' };
    }

    const llmType = workspace.llmFactory.getLLMTypeByName(provider);
    if (!llmType) {
      return { isValid: false, error: `Provider with name ${provider} not found` };
    }
    return workspace.llmFactory.validateConfiguration(llmType);
  });

  ipcMain.handle('llm:get-provider-config', (event, provider: string, key: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace) {
      log.warn(`Workspace not found for window: ${windowId}`);
      return null;
    }
    return workspace.getProviderSettingsValue(provider, key);
  });

  ipcMain.handle('llm:set-provider-config', async (event, provider: string, key: string, value: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace) {
      log.warn(`Workspace not found for window: ${windowId}`);
      return false;
    }
    try {
      await workspace.setProviderSettingsValue(provider, key, value);
      return true;
    } catch (error) {
      log.error(`Error setting provider config ${provider}.${key}:`, error);
      return false;
    }
  });

  ipcMain.handle('llm:get-installed-providers', (event) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace) {
      log.warn(`Workspace not found for window: ${windowId}`);
      return [];
    }
    return workspace.getInstalledProviders();
  });

  ipcMain.handle('llm:add-provider', async (event, provider: LLMType) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace) {
      log.warn(`Workspace not found for window: ${windowId}`);
      return false;
    }
    try {
      await workspace.addProvider(provider);
      return true;
    } catch (error) {
      log.error(`Error adding provider ${provider}:`, error);
      return false;
    }
  });

  ipcMain.handle('llm:remove-provider', async (event, provider: LLMType) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace) {
      log.warn(`Workspace not found for window: ${windowId}`);
      return false;
    }
    try {
      await workspace.removeProvider(provider);
      return true;
    } catch (error) {
      log.error(`Error removing provider ${provider}:`, error);
      return false;
    }
  });

  ipcMain.handle("llm:getModels", async (_event, provider: LLMType) => {
    const requestKey = `${provider}`;
    const now = Date.now();

    try {
      const windowId = BrowserWindow.getFocusedWindow()?.id.toString();
      const workspace = getWorkspaceForWindow(windowId);
      if (!workspace?.llmFactory) {
        log.warn(`LLMFactory not initialized for window: ${windowId}`);
        return [];
      }
      const llm = workspace.llmFactory.create(provider);
      return await llm.getModels();
    } catch (error) {
      log.error(`Error getting models for provider ${provider}:`, error);
      return [];
    }
  });

  // Settings IPC handlers
  ipcMain.handle('get-settings-value', (event, key: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    if (!workspace) {
      log.warn('No workspace found for window:', windowId);
      return null;
    }
    return workspace.getSettingsValue(key);
  });

  ipcMain.handle('set-settings-value', async (event, key: string, value: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    if (!workspace) {
      log.warn('No workspace found for window:', windowId);
      return false;
    }
    try {
      await workspace.setSettingsValue(key, value);
      return true;
    } catch (error) {
      log.error(`Error setting setting ${key}:`, error);
      return false;
    }
  });

  ipcMain.handle('chat:update-settings', (event, tabId: string, settings: {
    maxChatTurns: number;
    maxOutputTokens: number;
    temperature: number;
    topP: number;
  }) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const workspace = getWorkspaceForWindow(windowId);
    
    if (!workspace?.chatSessionManager) {
      log.warn(`ChatSessionManager not initialized for window: ${windowId}`);
      throw new Error('ChatSessionManager not initialized');
    }
    try {
      return workspace.chatSessionManager.updateSettings(tabId, settings);
    } catch (error) {
      log.error('Error updating chat settings:', error);
      throw error;
    }
  });
}

startApp(); 