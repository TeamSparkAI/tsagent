import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';
import { McpConfig, McpConfigFile, McpConfigFileServerConfig, determineServerType } from '../mcp/types';

export class ConfigManager {
  private static instance: ConfigManager | null = null;
  private configDir: string | null = null;
  private configFile: Record<string, any> | null = null;
  private mcpConfigPath: string | null = null;
  private promptFile: string | null = null;
  private readonly DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";
  private readonly isPackaged: boolean;
  private configLoaded = false;

  private constructor(isPackaged: boolean) {
    this.isPackaged = isPackaged;
    log.info(`[CONFIG MANAGER] Initialized with isPackaged=${isPackaged}`);
  }

  static getInstance(isPackaged: boolean): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(isPackaged);
    }
    return ConfigManager.instance;
  }

  // Method to set the config path
  public async setConfigPath(configPath: string): Promise<void> {
    log.info(`[CONFIG MANAGER] Setting config path to: ${configPath}`);
    this.configDir = configPath;
    this.mcpConfigPath = path.join(this.configDir, 'mcp_config.json');
    this.promptFile = path.join(this.configDir, 'prompt.md');
    
    // Create config directory if it doesn't exist
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // Reset config loaded flag to force reload
    this.configLoaded = false;
    
    // Load the configuration immediately
    await this.loadConfig();
  }

  // Check if a config path is set
  public hasConfigPath(): boolean {
    return this.configDir !== null;
  }

  getConfigDir(): string {
    if (!this.hasConfigPath()) {
      throw new Error('No config directory set. Call setConfigPath() first.');
    }
    return this.configDir!;
  }

  getMcpConfigPath(): string {
    if (!this.hasConfigPath()) {
      throw new Error('No config directory set. Call setConfigPath() first.');
    }
    return this.mcpConfigPath!;
  }

  getPromptFile(): string {
    if (!this.hasConfigPath()) {
      throw new Error('No config directory set. Call setConfigPath() first.');
    }
    return this.promptFile!;
  }

  async loadConfig(): Promise<void> {
    if (this.configLoaded) return;
    
    if (!this.hasConfigPath()) {
      throw new Error('No config directory set. Call setConfigPath() first.');
    }

    const configPath = path.join(this.configDir!, 'config.json');
    
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
    
    if (!this.configFile || !this.configFile.config) {
      throw new Error('Config file is invalid or empty.');
    }
    
    return this.configFile.config[key] || '';
  }

  async setConfigValue(key: string, value: string): Promise<void> {
    if (!this.hasConfigPath()) {
      throw new Error('No config directory set. Call setConfigPath() first.');
    }
    
    if (!this.configLoaded) {
      await this.loadConfig();
    }
    
    if (!this.configFile) {
      this.configFile = { config: {} };
    }
    
    if (!this.configFile.config) {
      this.configFile.config = {};
    }
    
    this.configFile.config[key] = value;
    
    const configPath = path.join(this.configDir!, 'config.json');
    await fs.promises.writeFile(configPath, JSON.stringify(this.configFile, null, 2));
  }

  async getMcpConfig(): Promise<Record<string, McpConfig>> {
    if (!this.hasConfigPath()) {
      throw new Error('No config directory set. Call setConfigPath() first.');
    }
    
    if (!fs.existsSync(this.mcpConfigPath!)) {
      return {};
    }
    
    try {
      const data = await fs.promises.readFile(this.mcpConfigPath!, 'utf8');
      const config = JSON.parse(data) as McpConfigFile;
      const mcpServers = config.mcpServers || {};
      
      // Transform the configuration into the expected format
      const result: Record<string, McpConfig> = {};
      for (const [name, serverConfig] of Object.entries(mcpServers)) {
        result[name] = {
          name,
          config: serverConfig
        };
      }
      
      return result;
    } catch (error) {
      log.error('Error loading MCP config:', error);
      return {};
    }
  }

  async saveMcpConfig(server: McpConfig): Promise<void> {
    if (!this.hasConfigPath()) {
      throw new Error('No config directory set. Call setConfigPath() first.');
    }
    
    // Read the existing config file to preserve other properties
    let fullConfig: McpConfigFile = { mcpServers: {} };
    if (fs.existsSync(this.mcpConfigPath!)) {
      try {
        const data = await fs.promises.readFile(this.mcpConfigPath!, 'utf8');
        fullConfig = JSON.parse(data) as McpConfigFile;
        if (!fullConfig.mcpServers) {
          fullConfig.mcpServers = {};
        }
      } catch (error) {
        log.error('Error reading MCP config:', error);
      }
    }
    
    // Add or update the server in the mcpServers object
    // Extract just the config part without the name
    fullConfig.mcpServers[server.name] = server.config;
    
    // Write the updated config back to the file
    await fs.promises.writeFile(this.mcpConfigPath!, JSON.stringify(fullConfig, null, 2));
  }

  async deleteMcpConfig(serverName: string): Promise<void> {
    if (!this.hasConfigPath()) {
      throw new Error('No config directory set. Call setConfigPath() first.');
    }
    
    // Read the existing config file to preserve other properties
    let fullConfig: McpConfigFile = { mcpServers: {} };
    if (fs.existsSync(this.mcpConfigPath!)) {
      try {
        const data = await fs.promises.readFile(this.mcpConfigPath!, 'utf8');
        fullConfig = JSON.parse(data) as McpConfigFile;
        if (!fullConfig.mcpServers) {
          fullConfig.mcpServers = {};
        }
      } catch (error) {
        log.error('Error reading MCP config:', error);
      }
    }
    
    // Delete the server from the mcpServers object
    delete fullConfig.mcpServers[serverName];
    
    // Write the updated config back to the file
    await fs.promises.writeFile(this.mcpConfigPath!, JSON.stringify(fullConfig, null, 2));
  }

  async getSystemPrompt(): Promise<string> {
    if (!this.hasConfigPath()) {
      throw new Error('No config directory set. Call setConfigPath() first.');
    }
    
    if (!fs.existsSync(this.promptFile!)) {
      return this.DEFAULT_PROMPT;
    }
    
    try {
      return await fs.promises.readFile(this.promptFile!, 'utf8');
    } catch (error) {
      log.error('Error reading system prompt:', error);
      return this.DEFAULT_PROMPT;
    }
  }

  async saveSystemPrompt(prompt: string): Promise<void> {
    if (!this.hasConfigPath()) {
      throw new Error('No config directory set. Call setConfigPath() first.');
    }
    
    await fs.promises.writeFile(this.promptFile!, prompt);
  }
} 