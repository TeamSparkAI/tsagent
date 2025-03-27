import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';
import { McpConfig, McpConfigFileServerConfig } from '../mcp/types';

export class ConfigManager {
  private static instance: ConfigManager | null = null;
  private configDir: string;
  private configFile: Record<string, any> | null = null;
  private mcpConfigPath: string;
  private promptFile: string;
  private readonly DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";
  private readonly isPackaged: boolean;
  private configLoaded = false;

  private constructor(isPackaged: boolean) {
    this.isPackaged = isPackaged;
    const dataDir = this.getDataDirectory();
    this.configDir = path.join(dataDir, 'config');
    this.mcpConfigPath = path.join(this.configDir, 'mcp_config.json');
    this.promptFile = path.join(this.configDir, 'prompt.md');
    
    // Create config directory if it doesn't exist
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  static getInstance(isPackaged: boolean): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(isPackaged);
    }
    return ConfigManager.instance;
  }

  getDataDirectory(): string {
    if (this.isPackaged) {
      // In packaged mode, use the user data directory
      const { app } = require('electron');
      return app.getPath('userData');
    } else {
      return process.cwd();
    }
  }

  getConfigDir(): string {
    return this.configDir;
  }

  getMcpConfigPath(): string {
    return this.mcpConfigPath;
  }

  getPromptFile(): string {
    return this.promptFile;
  }

  async loadConfig(): Promise<void> {
    if (this.configLoaded) return;

    const configPath = path.join(this.configDir, 'config.json');
    
    // Create default config if it doesn't exist
    if (!fs.existsSync(configPath)) {
      this.configFile = { config: {} };
      await fs.promises.writeFile(configPath, JSON.stringify(this.configFile, null, 2));
      this.configLoaded = true;
      return;
    }

    try {
      const data = await fs.promises.readFile(configPath, 'utf8');
      this.configFile = JSON.parse(data);
      this.configLoaded = true;
    } catch (error) {
      log.error('Error loading config:', error);
      throw new Error('Failed to load config.json');
    }
  }

  getConfigValue(key: string): string {
    if (!this.configLoaded) {
      throw new Error('Config not loaded. Call loadConfig() first.');
    }
    const value = this.configFile?.config[key];
    if (!value) {
      throw new Error(`${key} not set in config.json`);
    }
    return value;
  }

  async getSystemPrompt(): Promise<string> {
    try {
      const prompt = await fs.promises.readFile(this.promptFile, 'utf8');
      return prompt;
    } catch (err) {
      log.error('Error reading system prompt, using default:', err);
      await fs.promises.writeFile(this.promptFile, this.DEFAULT_PROMPT, 'utf8');
      return this.DEFAULT_PROMPT;
    }
  }

  async saveSystemPrompt(prompt: string): Promise<void> {
    try {
      await fs.promises.writeFile(this.promptFile, prompt, 'utf8');
      log.info('System prompt saved successfully');
    } catch (err) {
      log.error('Error saving system prompt:', err);
      throw err;
    }
  }

  async getMcpConfig(): Promise<Record<string, McpConfigFileServerConfig>> {
    try {
      if (!fs.existsSync(this.mcpConfigPath)) {
        await fs.promises.writeFile(this.mcpConfigPath, JSON.stringify({ mcpServers: {} }, null, 2));
      }

      const configData = await fs.promises.readFile(this.mcpConfigPath, 'utf8');
      const config = JSON.parse(configData);
      return config.mcpServers;
    } catch (err) {
      log.error('Error loading MCP config:', err);
      return {};
    }
  }

  async saveMcpConfig(server: McpConfig): Promise<void> {
    try {
      const configData = await fs.promises.readFile(this.mcpConfigPath, 'utf8');
      const config = JSON.parse(configData);
      
      const serverConfig: any = {
        command: server.command
      };
      
      if (server.args?.length > 0) {
        serverConfig.args = server.args;
      }
      
      if (server.env && Object.keys(server.env).length > 0) {
        serverConfig.env = server.env;
      }
      
      config.mcpServers[server.name] = serverConfig;
      await fs.promises.writeFile(this.mcpConfigPath, JSON.stringify(config, null, 2));
    } catch (err) {
      log.error('Error saving MCP config:', err);
      throw err;
    }
  }

  async deleteMcpConfig(serverName: string): Promise<void> {
    try {
      const configData = await fs.promises.readFile(this.mcpConfigPath, 'utf8');
      const config = JSON.parse(configData);
      delete config.mcpServers[serverName];
      await fs.promises.writeFile(this.mcpConfigPath, JSON.stringify(config, null, 2));
    } catch (err) {
      log.error('Error deleting MCP config:', err);
      throw err;
    }
  }
} 