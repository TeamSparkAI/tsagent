import electron from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { setupCLI } from './cli.js';
import { LLMFactory } from './llm/llmFactory.js';
import { LLMType } from './llm/types.js';
import 'dotenv/config';

const { app, BrowserWindow, ipcMain } = electron;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// If running in CLI mode, don't initialize Electron
if (process.argv.includes('--cli')) {
  setupCLI();
} else {
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
        preload: path.join(__dirname, 'preload.js')
      }
    });

    mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
    mainWindow.webContents.reloadIgnoringCache();
  }

  // Handle IPC messages
  ipcMain.handle('send-message', async (_, tabId: string, message: string) => {
    console.log('Main process received message:', message);
    let llm = llmInstances.get(tabId);
    if (!llm) {
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