import { app, BrowserWindow, ipcMain, shell, Menu, dialog, MenuItemConstructorOptions, OpenDialogOptions, MessageBoxOptions } from 'electron';
import * as path from 'path';
import { ProviderType as LLMType, ProviderType } from 'agent-api';
import log from 'electron-log';
import * as fs from 'fs';
import { setupCLI } from '../cli/cli';
import { McpConfig } from 'agent-api';
import { AgentsManager } from './agents-manager';
import { agentExists, loadAgent, createAgent } from 'agent-api/runtime';
import { Agent } from 'agent-api';
import { ElectronLoggerAdapter } from './logger-adapter';
import chalk from 'chalk';
import { SessionToolPermission, SETTINGS_KEY_THEME, ChatMessage } from 'agent-api';

const __dirname = path.dirname(__filename);

// Declare managers and paths
let agentsManager: AgentsManager;
const PRODUCT_NAME = 'TeamSpark AI Workbench';
const DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";

async function createWindow(agent?: Agent): Promise<BrowserWindow> {
  // Get the current window's position if it exists
  const currentWindow = BrowserWindow.getFocusedWindow();
  let x = undefined;
  let y = undefined;
  
  if (currentWindow) {
    const [currentX, currentY] = currentWindow.getPosition();
    // Offset by 50 pixels down and right
    x = currentX + 50;
    y = currentY + 50;
  }

  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    x,
    y,
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

  if (agent) {
    agentsManager.registerWindow(window.id.toString(), agent);
    // Set initial theme from agent
    const theme = agent.getSetting(SETTINGS_KEY_THEME);
    if (theme) {
      window.webContents.executeJavaScript(`document.documentElement.setAttribute('data-theme', '${theme}')`);
    }
  }

  // Load the index.html file
  const indexPath = path.join(__dirname, 'index.html');
  log.info('Loading index.html from:', indexPath);
  log.info('File exists:', fs.existsSync(indexPath));
  window.loadFile(indexPath);

  window.on('close', () => {
    agentsManager.switchAgent(window.id.toString(), null);
  });

  return window;
}

// Helper function to get the Agent for a window
function getAgentForWindow(windowId?: string): Agent | null {
  if (!windowId) {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) {
      log.warn('No window ID provided and no focused window found');
      return null;
    }
    windowId = focusedWindow.id.toString();
  }
  
  const agent = agentsManager.getAgentForWindow(windowId);
  if (!agent) {
    log.warn(`No Agent found for window: ${windowId}`);
    return null;
  }
  
  return agent;
}

function initializeLogging(isElectron: boolean) {
  if (isElectron) {
    log.initialize({ preload: true }); // Required to wire up the renderer (will crash the CLI)
    const userDataPath = app.getPath('userData');
    log.transports.file.resolvePathFn = () => path.join(userDataPath, `tspark.log`);
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
    log.transports.file.maxSize = 1024 * 1024 * 10; // 10MB
    log.transports.file.level = 'info';
    if (app.isPackaged) {
      log.transports.console.level = 'error';
    } else {
      log.transports.console.level = 'info';
    }
    log.info(`App starting v${app.getVersion()} (${process.argv[0]})...`);
  } else {
    log.transports.file.resolvePathFn = () => path.join(process.cwd(), `tspark-console.log`);
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
    log.transports.file.maxSize = 1024 * 1024 * 10; // 10MB
    log.transports.file.level = 'info';
    log.transports.console.level = 'error'; // In CLI mode, only show error and above to the console
    log.info(`App starting (${process.argv[0]})...`);
  }
}

// Initialize paths and managers
async function initializeAgentManager() {
  log.info('Starting initialization process');

  // Create and initialize AgentsManager with logger
  const logger = new ElectronLoggerAdapter();
  agentsManager = new AgentsManager(logger);
  await agentsManager.initialize();
}

async function showLicenseAgreement() {
  try {
    const licensePath = path.join(__dirname, '..', 'LICENSE.md');
    const licenseText = await fs.promises.readFile(licensePath, 'utf-8');
    
    // Format the text for the dialog:
    // 1. Split by double newlines to preserve paragraphs
    // 2. For each paragraph, remove single newlines and trim
    // 3. Join paragraphs with double newlines
    const formattedText = licenseText
      .split(/\n\s*\n/)  // Split by double newlines (with optional whitespace)
      .map(paragraph => 
        paragraph
          .split('\n')    // Split by single newlines
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join(' ')      // Join lines within paragraph with spaces
      )
      .filter(paragraph => paragraph.length > 0)
      .join('\n\n');      // Join paragraphs with double newlines
    
    await dialog.showMessageBox({
      type: 'info',
      buttons: ['OK'],
      title: 'License Agreement',
      message: 'TeamSpark AI Workbench License Agreement',
      detail: formattedText,
      noLink: true
    });
  } catch (error) {
    log.error('Error reading license file:', error);
    dialog.showErrorBox('Error', 'Could not read license file');
  }
}

function createApplicationMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'TeamSpark AI Workbench',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'License Agreement',
          click: async () => {
            await showLicenseAgreement();
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { role: 'help' }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function startApp() {
  if (process.argv.includes('--cli')) {
    initializeLogging(false);

    // -- agent (path) the agent directory or file (tspark.json), defaults to cwd
    // -- create (bool) indicates whether the path should be created if it doesn't exist
    //
    let agentPath = process.cwd();
    let create = false;
    for (let i = 0; i < process.argv.length; i++) {
      if (process.argv[i] === '--agent') {
        // Resolve agent path relative to cwd (unless it's an absolute path)
        agentPath = path.resolve(process.argv[i + 1]);
      } else if (process.argv[i] === '--create') {
        create = true;
      }
    }

    const logger = new ElectronLoggerAdapter();
    let agent: Agent | null = null;
    
    if (create) {
      try {
        agent = await createAgent(agentPath, logger);
        console.log(chalk.green(`Created new agent at: ${agentPath}`));
      } catch (error) {
        console.log(chalk.red(`Failed to create agent: ${error}`));
        process.exit(1);
      }
    } else {
      try {
        // First check if agent exists
        if (!(await agentExists(agentPath))) {
          console.log(chalk.red(`${PRODUCT_NAME} failed to locate agent (tspark.json) in directory: `), agentPath);
          console.log(chalk.dim('  Use '), chalk.bold('--agent <path>'), chalk.dim(' absolute or relative path to a agent directory (where tspark.json will be found or created)'));
          console.log(chalk.dim('  Use '), chalk.bold('--create'), chalk.dim(' to create a new agent in the specified directory, or current working directory if agent path not specified'));
          process.exit(1);
        }
        
        // Agent exists, try to load it
        agent = await loadAgent(agentPath, logger);
      } catch (error) {
        console.log(chalk.red(`Error loading agent: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
      }
    }

    let version = "unknown";
    if (app) {
      version = app.getVersion();
    } else if (process.env.npm_package_version) {
      version = process.env.npm_package_version;
    }

    setupCLI(agent, version);
  } else {
    // Set app name before anything else
    process.env.ELECTRON_APP_NAME = PRODUCT_NAME;
    app.setName(PRODUCT_NAME);

    initializeLogging(true);

    // Create application menu
    createApplicationMenu();

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
      await initializeAgentManager();
      log.info('Initialization complete, creating window');

      // If agent path on command line, open that agent 
      const filteredArgs = process.argv.slice(2).filter(arg => !arg.startsWith('-'));
      const agentPath = filteredArgs.length > 0 ? filteredArgs[0] : null;
      
      if (agentPath) {
        log.info(`Opening agent from command line: ${agentPath}`);
        const logger = new ElectronLoggerAdapter();
        const agent = await loadAgent(agentPath, logger);
        if (!agent) {
          log.error('Failed to find agent (tspark.json) in directory provide on launch command line: ', agentPath);
          // !!! Ideally we should show the user this message in the UX
          mainWindow = await createWindow();
        } else {
          mainWindow = await createWindow(agent);
        }
      } else {
        // Else if there is a most recently used agent, open that 
        const mostRecentlyUsedAgent = agentsManager.getRecentAgents(); // !!! Should this be agentsManager.getLastActiveAgent()?
        if (mostRecentlyUsedAgent.length > 0) {
          log.info(`Opening most recently used agent: ${mostRecentlyUsedAgent[0]}`);
          const logger = new ElectronLoggerAdapter();
          const agent = await loadAgent(mostRecentlyUsedAgent[0], logger);
          if (!agent) {
            log.error('Failed to find agent (tspark.json) in most recently used directory: ', mostRecentlyUsedAgent[0]);
            // !!! Ideally we should show the user this message in the UX
            mainWindow = await createWindow();
          } else {
            mainWindow = await createWindow(agent);
          }
        } else {
          log.info('No most recently used agent, creating new window with no agent');
          mainWindow = await createWindow();
        }
      }

      // Set up IPC handlers after potential agent initialization
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
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return [];
    }
    return agent.getAllRules();
  });

  ipcMain.handle('rules:save-rule', (event, rule) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return false;
    }
    agent.addRule(rule);
  });

  ipcMain.handle('rules:delete-rule', (event, name) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return false;
    }
    return agent.deleteRule(name);
  });

  // References IPC handlers
  ipcMain.handle('references:get-references', (event) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return [];
    }
    return agent.getAllReferences();
  });

  ipcMain.handle('references:save-reference', (event, reference) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return false;
    }
    agent.addReference(reference);
  });

  ipcMain.handle('references:delete-reference', (event, name) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return false;
    }
    return agent.deleteReference(name);
  });

  // Chat session IPC handlers
  ipcMain.handle('chat:create-tab', (event, tabId: string, modelProvider?: LLMType, modelId?: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return { success: false };
    }
    try {
      agent.createChatSession(tabId, {
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
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return { success: false };
    }
    try {
      agent.deleteChatSession(tabId);
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
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return null;
    }
    try {
      const session = agent.getChatSession(tabId);
      if (!session) {
        log.info(`No session exists for tab ${tabId}, returning null`);
        return null;
      }
      return session.getState();
    } catch (error) {
      log.error('Error getting chat state:', error);
      throw error;
    }
  });

  ipcMain.handle('chat:send-message', async (event, tabId: string, message: string | ChatMessage) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return { success: false };
    }
    try {
      const session = agent.getChatSession(tabId);
      if (!session) {
        throw new Error(`No chat session found for tab ${tabId}`);
      }
      return await session.handleMessage(message);
    } catch (error) {
      log.error('Error sending message:', error);
      throw error;
    }
  });

  ipcMain.handle('chat:add-reference', (event, tabId: string, referenceName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return false;
    }
    try {
      const session = agent.getChatSession(tabId);
      if (!session) {
        throw new Error(`No chat session found for tab ${tabId}`);
      }
      return session.addReference(referenceName);
    } catch (error) {
      log.error(`Error adding reference '${referenceName}' to chat session:`, error);
      throw error;
    }
  });

  ipcMain.handle('chat:remove-reference', (event, tabId: string, referenceName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return false;
    }
    try {
      const session = agent.getChatSession(tabId);
      if (!session) {
        throw new Error(`No chat session found for tab ${tabId}`);
      }
      return session.removeReference(referenceName);
    } catch (error) {
      log.error(`Error removing reference '${referenceName}' from chat session:`, error);
      throw error;
    }
  });

  ipcMain.handle('chat:add-rule', (event, tabId: string, ruleName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return false;
    }
    try {
      const session = agent.getChatSession(tabId);
      if (!session) {
        throw new Error(`No chat session found for tab ${tabId}`);
      }
      return session.addRule(ruleName);
    } catch (error) {
      log.error(`Error adding rule '${ruleName}' to chat session:`, error);
      throw error;
    }
  });

  ipcMain.handle('chat:remove-rule', (event, tabId: string, ruleName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return false;
    }
    try {
      const session = agent.getChatSession(tabId);
      if (!session) {
        throw new Error(`No chat session found for tab ${tabId}`);
      }
      return session.removeRule(ruleName);
    } catch (error) {
      log.error(`Error removing rule '${ruleName}' from chat session:`, error);
      throw error;
    }
  });


  ipcMain.handle('chat:clear-model', (event, tabId: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return { success: false };
    }
    try {
      const session = agent.getChatSession(tabId);
      if (!session) {
        throw new Error(`No chat session found for tab ${tabId}`);
      }
      const result = session.clearModel();
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
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return { success: false };
    }
    try {
      const session = agent.getChatSession(tabId);
      if (!session) {
        throw new Error(`No chat session found for tab ${tabId}`);
      }
      // !!! This is ugly (rendered code can't import ProviderType from agent-api)
      const result = session.switchModel(modelType as any, modelId);
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
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn('No agent found for window:', windowId);
      return [];
    }

    try {
      const mcpServers = await agent.getAllMcpServers();
      
      // If mcpServers is empty or undefined, return an empty array
      if (!mcpServers || Object.keys(mcpServers).length === 0) {
        log.info('No MCP server configurations found in agent');
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
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn('No agent found for window:', windowId);
      return [];
    }

    try {
      let client = agent.getMcpClient(serverName);
      let serverType = 'stdio';
      
      if (!client) {
        const mcpServers = await agent.getAllMcpServers();
        
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
        
        client = agent.getMcpClient(serverName);
        if (!client) {
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
      const agent = getAgentForWindow(windowId);

      const client = agent?.getMcpClient(serverName);
      if (!client) {
        throw new Error(`No MCP client found for server ${serverName}`);
      }
      const tool = client.serverTools.find((t: any) => t.name === toolName);
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
    const agent = getAgentForWindow(windowId);

    const client = agent?.getMcpClient(serverName);
    if (!client) {
      throw new Error(`No MCP client found for server ${serverName}`);
    }
    return client.ping();
  });

  ipcMain.handle('get-system-prompt', async (event) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn('No agent found for window:', windowId);
      return [];
    }

    try {
      log.info('[MAIN PROCESS] getSystemPrompt called');      
      const prompt = await agent.getSystemPrompt();
      return prompt;
    } catch (err) {
      log.error('[MAIN PROCESS] Error reading system prompt, using default:', err);
      return DEFAULT_PROMPT;
    }
  });

  ipcMain.handle('save-system-prompt', async (event, prompt: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn('No agent found for window:', windowId);
      return [];
    }

    try {      
      await agent.setSystemPrompt(prompt);
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
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn('No agent found for window:', windowId);
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
      
      // Save the server configuration using AgentAPI
      await agent.saveMcpServer(server);
    } catch (err) {
      log.error('Error saving server config:', err);
      throw err;
    }
  });

  ipcMain.handle('deleteServerConfig', async (event, serverName: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn('No agent found for window:', windowId);
      return [];
    }

    try {
      await agent.deleteMcpServer(serverName);
    } catch (err) {
      log.error('Error deleting server config:', err);
      throw err;
    }  
  });

  // Agent IPC handlers
  ipcMain.handle('dialog:showOpenDialog', (_, options: OpenDialogOptions) => {
    return dialog.showOpenDialog(options);
  });

  ipcMain.handle('dialog:showMessageBox', (_, options: MessageBoxOptions) => {
    return dialog.showMessageBox(options);
  });

  ipcMain.handle('agent:getActiveWindows', () => {
    return agentsManager.getActiveWindows();
  });

  ipcMain.handle('agent:getRecentAgents', () => {
    return agentsManager.getRecentAgents();
  });

  ipcMain.handle('agent:getCurrentWindowId', (event) => {
    // Get the window that sent the request
    const currentWindow = BrowserWindow.fromWebContents(event.sender);
    if (!currentWindow) {
      log.warn('No window found for the renderer process');
      return null;
    }
    
    return currentWindow.id.toString();
  });

  ipcMain.handle('agent:agentExists', async (_, path: string) => {
    return await agentExists(path);
  });

  // Open the agent at filePath in the current window, or if no current window, create a new one
  //
  ipcMain.handle('agent:openAgent', async (_, filePath: string) => {
    log.info(`[AGENT OPEN] IPC handler called for agent:openAgent ${filePath}`);
    const logger = new ElectronLoggerAdapter();
    const agent = await loadAgent(filePath, logger);
    if (!agent) {
      // This is a directory the user just picked, so it should always be a valid agent
      log.error('Failed to find agent (tspark.json) in directory provided: ', filePath);
      // !!! Ideally we should show the user this message in the UX
      return null;
    }
    
    // Get the current window
    const currentWindow = BrowserWindow.getFocusedWindow();
    if (currentWindow) {
      log.info(`[AGENT OPEN] Opening agent ${agent.path} in current window ${currentWindow.id}`);
      agentsManager.registerWindow(currentWindow.id.toString(), agent);
            
      // Return the current window's ID
      return currentWindow.id;
    }
    
    // If no current window exists, create a new one
    log.info(`[AGENT OPEN] No current window, creating new window for agent ${agent.path}`);
    const window = await createWindow(agent);
    return window.id;
  });

  // Open the agent at filePath in a new window
  //
  ipcMain.handle('agent:openInNewWindow', async (_, filePath: string) => {
    log.info(`[AGENT OPEN] Opening agent ${filePath} in a new window`);
    log.info(`[AGENT OPEN] IPC handler called for agent:openInNewWindow ${filePath}`);
    const logger = new ElectronLoggerAdapter();
    const agent = await loadAgent(filePath, logger);
    
    // Always create a new window
    if (!agent) {
      // This is a directory the user just picked, so it should always be a valid agent
      log.error('Failed to find agent (tspark.json) in directory provided: ', filePath);
      // !!! Ideally we should show the user this message in the UX
      return null;
    }

    const window = await createWindow(agent);
    return window.id;
  });

  // Create NEW agent in the specified window
  //
  ipcMain.handle('agent:createAgent', async (_, windowId: string, agentPath: string) => {
    log.info(`[AGENT CREATE] IPC handler called for window ${windowId} to agent ${agentPath}`);
    // Convert windowId to string to ensure consistent handling
    const windowIdStr = windowId.toString();

    const logger = new ElectronLoggerAdapter();
    const agent = await loadAgent(agentPath, logger);

    log.info(`[AGENT SWITCH] Agent found: ${agent.path}`);
    await agentsManager.switchAgent(windowIdStr, agent);
    return true;
  });

  // Create NEW agent in a new window
  //
  ipcMain.handle('agent:createAgentInNewWindow', async (_, agentPath: string) => {
    log.info(`[AGENT CREATE] IPC handler called for agent:createAgentInNewWindow ${agentPath}`);
    const logger = new ElectronLoggerAdapter();
    const agent = await loadAgent(agentPath, logger);
    const window = await createWindow(agent);
    return window.id;
  });

  // Clone agent to a new location
  //
  ipcMain.handle('agent:cloneAgent', async (_, sourcePath: string, targetPath: string) => {
    log.info(`[AGENT CLONE] IPC handler called for agent:cloneAgent from ${sourcePath} to ${targetPath}`);
    
    // Check if target agent already exists
    if (await agentExists(targetPath)) {
      log.error(`[AGENT CLONE] Target agent already exists: ${targetPath}`);
      return { success: false, error: 'An agent already exists at the target location' };
    }

    // Clone the agent
    const logger = new ElectronLoggerAdapter();
    const sourceAgent = await loadAgent(sourcePath, logger);
    if (!sourceAgent) {
      log.error(`[AGENT CLONE] Failed to load source agent: ${sourcePath}`);
      return { success: false, error: 'Failed to load source agent' };
    }
    
    const clonedAgent = await sourceAgent.clone(targetPath);
    if (!clonedAgent) {
      log.error(`[AGENT CLONE] Failed to clone agent from ${sourcePath} to ${targetPath}`);
      return { success: false, error: 'Failed to clone agent' };
    }

    // Always create a new window for the cloned agent
    log.info(`[AGENT CLONE] Creating new window for cloned agent ${clonedAgent.path}`);
    const window = await createWindow(clonedAgent);
    return { success: true, windowId: window.id };
  });

  // Switch to the agent at agentPath in the specified window
  //
  ipcMain.handle('agent:switchAgent', async (_, windowId: string, agentPath: string) => {
    try {
      log.info(`[AGENT SWITCH] IPC handler called for window ${windowId} to agent ${agentPath}`);
      // Convert windowId to string to ensure consistent handling
      const windowIdStr = windowId.toString();

      const logger = new ElectronLoggerAdapter();
      const agent = await loadAgent(agentPath, logger);
      if (!agent) {
        log.error('[AGENT SWITCH] Failed to find agent (tspark.json) in directory provided: ', agentPath);
        // !!! Ideally we should show the user this message in the UX
        return false;
      }
      log.info(`[AGENT SWITCH] Agent found: ${agent.path}`);
      await agentsManager.switchAgent(windowIdStr, agent);
      return true;
    } catch (error) {
      log.error(`[AGENT SWITCH] Error in IPC handler switching window ${windowId} to agent ${agentPath}:`, error);
      return false;
    }
  });

  // After the other agent IPC handlers
  ipcMain.handle('agent:focusWindow', (_, windowId: string) => {
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
  ipcMain.handle('llm:get-provider-info', (event, provider: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return {};
    }
    const providerType = provider as ProviderType;
    return agent.getProviderInfo(providerType);
  });

  ipcMain.handle('llm:validate-provider-config', async (event, provider: string, config: Record<string, string>) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return { isValid: false, error: 'Agent not found' };
    }

    const providerType = provider as ProviderType;
    return agent.validateProviderConfiguration(providerType, config);
  });

  ipcMain.handle('llm:get-provider-config', (event, provider: string, key: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return null;
    }
    const providerType = provider as ProviderType;
    const config = agent.getInstalledProviderConfig(providerType);
    return config?.[key] || null;
  });

  ipcMain.handle('llm:set-provider-config', async (event, provider: string, key: string, value: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return false;
    }
    try {
      const providerType = provider as ProviderType;
      const currentConfig = agent.getInstalledProviderConfig(providerType) || {};
      const newConfig = { ...currentConfig, [key]: value };
      await agent.updateProvider(providerType, newConfig);
      return true;
    } catch (error) {
      log.error(`Error setting provider config ${provider}.${key}:`, error);
      return false;
    }
  });

  ipcMain.handle('llm:get-installed-providers', (event) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return [];
    }
    return agent.getInstalledProviders();
  });

  ipcMain.handle('llm:add-provider', async (event, provider: LLMType, config: Record<string, string>) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return false;
    }
    try {
      await agent.installProvider(provider, config);
      return true;
    } catch (error) {
      log.error(`Error adding provider ${provider}:`, error);
      return false;
    }
  });

  ipcMain.handle('llm:remove-provider', async (event, provider: LLMType) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return false;
    }
    try {
      await agent.uninstallProvider(provider);
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
      const agent = getAgentForWindow(windowId);
      if (!agent) {
        log.warn(`Agent not found for window: ${windowId}`);
        return [];
      }
      return await agent.getProviderModels(provider);
    } catch (error) {
      log.error(`Error getting models for provider ${provider}:`, error);
      return [];
    }
  });

  // Settings IPC handlers
  ipcMain.handle('get-settings-value', (event, key: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn('No agent found for window:', windowId);
      return null;
    }
    return agent.getSetting(key);
  });

  ipcMain.handle('set-settings-value', async (event, key: string, value: string) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn('No agent found for window:', windowId);
      return false;
    }
    try {
      await agent.setSetting(key, value);
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
    toolPermission: SessionToolPermission;
  }) => {
    const windowId = BrowserWindow.fromWebContents(event.sender)?.id.toString();
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      log.warn(`Agent not found for window: ${windowId}`);
      return false;
    }
    try {
      const session = agent.getChatSession(tabId);
      if (!session) {
        throw new Error(`No chat session found for tab ${tabId}`);
      }
      return session.updateSettings(settings);
    } catch (error) {
      log.error('Error updating chat settings:', error);
      throw error;
    }
  });

  // App details handler
  ipcMain.handle('get-app-details', () => {
    return {
      isPackaged: app.isPackaged
    };
  });
}

startApp(); 