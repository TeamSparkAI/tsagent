import electron from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { setupCLI } from './cli.js';
import { LLMFactory } from './llm/llmFactory.js';
import { LLMType } from './llm/types.js';
import { MCPClientImpl } from './mcp/client.js';
import { MCPClientManager } from './mcp/manager.js';
import { MCPConfigServer } from './commands/tools.js';
import 'dotenv/config';
import * as fs from 'fs';
import { shell } from 'electron';
import { RulesManager } from './state/RulesManager.js';

const { app, BrowserWindow, ipcMain } = electron;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define all directory constants at the top
const CONFIG_DIR = path.join(process.cwd(), 'config');
const MCP_CONFIG_PATH = path.join(CONFIG_DIR, 'mcp_config.json');
const PROMPT_FILE = path.join(CONFIG_DIR, 'prompt.md');
const DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";

// Initialize managers
const mcpManager = new MCPClientManager();
const rulesManager = new RulesManager(CONFIG_DIR);

// Initialize the LLM Factory with the manager
LLMFactory.initialize(mcpManager);

// Load MCP clients from config
const loadMCPClients = async () => {
  try {
    // Create config dir if it doesn't exist
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    // Create empty config if it doesn't exist
    if (!fs.existsSync(MCP_CONFIG_PATH)) {
      await fs.promises.writeFile(MCP_CONFIG_PATH, JSON.stringify({ mcpServers: {} }, null, 2));
    }

    const configData = await fs.promises.readFile(MCP_CONFIG_PATH, 'utf8');
    const config = JSON.parse(configData);
    await mcpManager.loadClients(config.mcpServers);
  } catch (err) {
    console.error('Error loading MCP config:', err);
  }
};

// Near the top with other state
const settingsDir = path.join(process.cwd(), 'settings');
const mcpClients = new Map<string, MCPClientImpl>();

// If running in CLI mode, don't initialize Electron
if (process.argv.includes('--cli')) {
  await loadMCPClients();
  setupCLI();
} else {
  let mainWindow: (InstanceType<typeof BrowserWindow>) | null = null;
  const llmInstances = new Map<string, ReturnType<typeof LLMFactory.create>>();
  const llmTypes = new Map<string, LLMType>();

  await loadMCPClients();
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

    mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
    mainWindow.webContents.reloadIgnoringCache();

    // Enable native text editing context menu
    mainWindow.webContents.on('context-menu', (_, props) => {
      // Show menu only for editable fields
      if (!props.isEditable) return;

      const menu = electron.Menu.buildFromTemplate([
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
          role: props.editFlags.canSelectAll && props.isEditable ? 'selectAll' as const : undefined,
          enabled: props.editFlags.canSelectAll,
          visible: props.isEditable
        }
      ]);
      menu.popup();
    });
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
    try {
      const configData = await fs.promises.readFile(MCP_CONFIG_PATH, 'utf8');
      const config: { mcpServers: Record<string, MCPConfigServer> } = JSON.parse(configData);
      return Object.entries(config.mcpServers).map(([name, serverConfig]) => ({
        name,
        ...serverConfig
      }));
    } catch (err) {
      return [];  // Return empty list if no config
    }
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

  ipcMain.handle('get-system-prompt', async () => {
    try {
      const prompt = await fs.promises.readFile(PROMPT_FILE, 'utf8');
      // Initialize LLM state with loaded prompt
      LLMFactory.getStateManager().setSystemPrompt(prompt);
      return prompt;
    } catch (err) {
      // If file doesn't exist, create it with default prompt
      await fs.promises.writeFile(PROMPT_FILE, DEFAULT_PROMPT, 'utf8');
      LLMFactory.getStateManager().setSystemPrompt(DEFAULT_PROMPT);
      return DEFAULT_PROMPT;
    }
  });

  ipcMain.handle('save-system-prompt', async (_, prompt: string) => {
    await fs.promises.writeFile(PROMPT_FILE, prompt, 'utf8');
    // Update LLM state with new prompt
    LLMFactory.getStateManager().setSystemPrompt(prompt);
  });

  // Add new IPC handler
  ipcMain.handle('show-chat-menu', (_, hasSelection: boolean, x: number, y: number) => {
    const menu = electron.Menu.buildFromTemplate([
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
        click: async () => {
          try {
            await mainWindow?.webContents.executeJavaScript(`
              try {
                const chatContainer = document.getElementById('chat-container');
                if (chatContainer) {
                  const selection = window.getSelection();
                  const range = document.createRange();
                  range.selectNodeContents(chatContainer);
                  selection?.removeAllRanges();
                  selection?.addRange(range);
                }
              } catch (err) {
                console.error('Error in select all:', err);
              }
            `);
          } catch (err) {
            console.error('Failed to execute select all script:', err);
          }
        }
      }
    ]);
    menu.popup();
  });

  ipcMain.handle('open-external', async (_, url: string) => {
    try {
      await shell.openExternal(url);
      return true;
    } catch (error) {
      console.error('Failed to open external URL:', error);
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