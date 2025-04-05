import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';
import { McpConfig, McpConfigFileServerConfig, determineServerType } from '../mcp/types';

export class ConfigManager {
  private static instance: ConfigManager | null = null;
  private configDir: string;
  private configFile: Record<string, any> | null = null;
  private mcpConfigPath: string;
  private promptFile: string;
  private readonly DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";
  private readonly isPackaged: boolean;
  private configLoaded = false;
  private lastDataDirectory: string | null = null;

  private constructor(isPackaged: boolean, configPath?: string) {
    this.isPackaged = isPackaged;
    
    if (configPath) {
      // If a specific config path is provided, use it
      this.configDir = configPath;
      log.info(`Using provided config directory: ${this.configDir}`);
    } else {
      // Otherwise use the default data directory
      const dataDir = this.getDataDirectory();
      this.configDir = path.join(dataDir, 'config');
      log.info(`Using default config directory: ${this.configDir}`);
    }
    
    this.mcpConfigPath = path.join(this.configDir, 'mcp_config.json');
    this.promptFile = path.join(this.configDir, 'prompt.md');
    
    // Create config directory if it doesn't exist
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  static getInstance(isPackaged: boolean, configPath?: string): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(isPackaged, configPath);
    } else if (configPath) {
      // Update the config directory if a new path is provided
      ConfigManager.instance.updateConfigPath(configPath);
    }
    return ConfigManager.instance;
  }

  // New method to update the config path
  public updateConfigPath(configPath: string): void {
    log.info(`[CONFIG MANAGER] Updating config path to: ${configPath}`);
    this.configDir = configPath;
    this.mcpConfigPath = path.join(this.configDir, 'mcp_config.json');
    this.promptFile = path.join(this.configDir, 'prompt.md');
    
    // Create config directory if it doesn't exist
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // Reset config loaded flag to force reload
    this.configLoaded = false;
  }

  getDataDirectory(): string {
    // Always use the user data directory for the default workspace
    const { app } = require('electron');
    const userDataPath = app.getPath('userData');
    if (userDataPath !== this.lastDataDirectory) {
      // Only log if we're not in the process of setting up logging
      if (!log.transports.file.resolvePathFn) {
        log.info(`User data directory: ${userDataPath}`);
      }
      this.lastDataDirectory = userDataPath;
    }
    return userDataPath;
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
      // Check if the prompt file exists
      if (!fs.existsSync(this.promptFile)) {
        log.info(`[CONFIG MANAGER] Prompt file not found at ${this.promptFile}, creating with default value`);
        
        // Ensure the directory exists
        const promptDir = path.dirname(this.promptFile);
        if (!fs.existsSync(promptDir)) {
          fs.mkdirSync(promptDir, { recursive: true });
        }
        
        // Create the prompt file with default value
        await fs.promises.writeFile(this.promptFile, this.DEFAULT_PROMPT, 'utf8');
        return this.DEFAULT_PROMPT;
      }
      
      // Read the prompt file
      const prompt = await fs.promises.readFile(this.promptFile, 'utf8');
      return prompt;
    } catch (err) {
      log.error('[CONFIG MANAGER] Error reading system prompt, using default:', err);
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
      const servers = config.mcpServers as Record<string, any>;
      
      // Add type field if missing
      for (const [name, serverConfig] of Object.entries(servers)) {
        if (!serverConfig.type) {
          serverConfig.type = determineServerType(serverConfig);
        }
      }
      
      return servers;
    } catch (err) {
      log.error('Error loading MCP config:', err);
      return {};
    }
  }

  async getMcpConfigWithNames(): Promise<Record<string, McpConfig>> {
    try {
      const servers = await this.getMcpConfig();
      
      // Convert to new McpConfig structure
      const newServers: Record<string, McpConfig> = {};
      for (const [name, serverConfig] of Object.entries(servers)) {
        newServers[name] = {
          name,
          config: serverConfig
        };
      }
      
      return newServers;
    } catch (err) {
      log.error('Error loading MCP config:', err);
      return {};
    }
  }

  async saveMcpConfig(server: McpConfig): Promise<void> {
    try {
      if (!fs.existsSync(this.mcpConfigPath)) {
        await fs.promises.writeFile(this.mcpConfigPath, JSON.stringify({ mcpServers: {} }, null, 2));
      }

      const configData = await fs.promises.readFile(this.mcpConfigPath, 'utf8');
      const config = JSON.parse(configData);
      
      config.mcpServers[server.name] = server.config;
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