import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';
import { McpConfig, McpConfigFile } from '../mcp/types';
import { RulesManager } from './RulesManager';
import { ReferencesManager } from './ReferencesManager';
import { ChatSessionManager } from './ChatSessionManager';
import { LLMFactory } from '../llm/llmFactory';
import { MCPClientManager } from '../mcp/manager';
import { MAX_CHAT_TURNS_DEFAULT, MAX_OUTPUT_TOKENS_DEFAULT, MAX_OUTPUT_TOKENS_KEY, TEMPERATURE_DEFAULT, TEMPERATURE_KEY, TOP_P_DEFAULT, TOP_P_KEY } from '../../shared/workspace';
import { MAX_CHAT_TURNS_KEY } from '../../shared/workspace';

export class WorkspaceManager {
  private static readonly WORKSPACE_FILE_NAME = 'tspark.json';
  private static readonly SYSTEM_PROMPT_FILE_NAME = 'prompt.md';
  private static readonly DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";

  private _workspaceDir: string; // Full path to the workspace directory
  private _workspaceFile: string; // Full path to tspark.json in the workspace directory
  private _workspaceData: Record<string, any> | null = null;
  private _promptFile: string | null = null;
  private _configLoaded = false;

  private _rulesManager: RulesManager;
  private _referencesManager: ReferencesManager;
  private _mcpManager: MCPClientManager;
  private _chatSessionManager: ChatSessionManager;
  private _llmFactory: LLMFactory;

  private _rulesListener: (() => void) | null = null;
  private _referencesListener: (() => void) | null = null;
  private _providersListener: (() => void) | null = null;

  private constructor(workspaceDir: string) {
    this._workspaceDir = workspaceDir;
    this._workspaceFile = path.join(this._workspaceDir, WorkspaceManager.WORKSPACE_FILE_NAME);
    this._promptFile = path.join(this._workspaceDir, WorkspaceManager.SYSTEM_PROMPT_FILE_NAME);
    this._rulesManager = new RulesManager(this._workspaceDir);
    this._referencesManager = new ReferencesManager(this._workspaceDir);
    this._mcpManager = new MCPClientManager();
    this._chatSessionManager = new ChatSessionManager(this); // Needs system prompt, rules, references, tools functions, and llmFactory (pretty much everything)
    this._llmFactory = new LLMFactory(this); // Needs provider config and tools functions from MCP manager

    log.info(`[WORKSPACE MANAGER] Initialized with workspacePath=${workspaceDir}`);
  }
 
  // Static factory constructor (for async construction)
  //
  // workspacePath:
  //   - Workspace directory or file. If file, it must be a workspace file named tspark.json
  // populateNewWorkspace:
  //   - If true, the workspace will be populated with default values, if not, the workspace will be validated
  //
  public static async create(workspacePath: string, populateNewWorkspace: boolean = false): Promise<WorkspaceManager | null> {
    // If workspacePath is to a file, extract the directory path and verify that the filename is tspark.json
    let workspaceDir: string;
    const normalizedWorkspacePath = path.normalize(workspacePath);
    const possibleFilename = path.basename(normalizedWorkspacePath);
    if (possibleFilename.endsWith('.json')) {
      if (possibleFilename != WorkspaceManager.WORKSPACE_FILE_NAME) {
        throw new Error(`Workspace file must be named ${WorkspaceManager.WORKSPACE_FILE_NAME}: ${workspacePath}`);
      }
      workspaceDir = path.dirname(normalizedWorkspacePath);
    } else {
      workspaceDir = normalizedWorkspacePath;
    }

    // Create/valudate workspaceDir before we create the WorkspaceManager (since that will cause creation of subdirectories under the workspaceDir)
    if (populateNewWorkspace) {
      // Create workspace directory if it doesn't exist
      if (!fs.existsSync(workspaceDir)) {
        fs.mkdirSync(workspaceDir, { recursive: true });
      }
    } else {
      if (!fs.existsSync(workspaceDir)) {
        log.error(`Workspace directory does not exist: ${workspaceDir}`);
        return null;
      }
      const workspaceFile = path.join(workspaceDir, WorkspaceManager.WORKSPACE_FILE_NAME);
      if (!fs.existsSync(workspaceFile)) {
        log.error(`Workspace file does not exist: ${workspaceFile}`);
        return null;
      }
    }

    const workspaceManager = new WorkspaceManager(workspaceDir);

    if (populateNewWorkspace) {
      // Create initial workspace file if it doesn't exist
      if (!fs.existsSync(workspaceManager._workspaceFile)) {
        const initialConfig = {
          metadata: {
            name: path.basename(workspaceManager._workspaceDir),
            created: new Date().toISOString(),
            lastAccessed: new Date().toISOString(),
            version: '1.0.0'
          },
          settings: {
            [MAX_CHAT_TURNS_KEY]: MAX_CHAT_TURNS_DEFAULT,
            [MAX_OUTPUT_TOKENS_KEY]: MAX_OUTPUT_TOKENS_DEFAULT,
            [TEMPERATURE_KEY]: TEMPERATURE_DEFAULT,
            [TOP_P_KEY]: TOP_P_DEFAULT
          },
          providers: {},
          mcpServers: {
            "references": {
              "type": "internal",
              "tool": "references"
            },
            "rules": {
              "type": "internal",
              "tool": "rules"
            }
          }
        };
        await fs.promises.writeFile(workspaceManager._workspaceFile, JSON.stringify({ initialConfig }, null, 2));
        workspaceManager._workspaceData = initialConfig;
        workspaceManager._configLoaded = true;
        if (!fs.existsSync(workspaceManager._promptFile!)) {
          await workspaceManager.saveSystemPrompt(WorkspaceManager.DEFAULT_PROMPT);
        }
      }
    } else {
      // !!! Validate contents of the workspace file before/when loading it?
      await workspaceManager.loadConfig();
    }
    
    await workspaceManager.mcpManager.loadClients(workspaceManager);
    return workspaceManager;
  }

  public initializeListeners(window: Electron.BrowserWindow): void {
    const rulesListener = () => {
      window.webContents.send('rules-changed');
    };
    this._rulesManager.on('rulesChanged', rulesListener);
    this._rulesListener = rulesListener;
  
    const referencesListener = () => {
      window.webContents.send('references-changed');
    };
    this._referencesManager.on('referencesChanged', referencesListener);
    this._referencesListener = referencesListener;

    const providersListener = () => {
      window.webContents.send('providers-changed');
    };
    this._providersListener = providersListener;
  }

  public uninitializeListeners(): void {
    if (this._rulesListener) {
      this._rulesListener();
    }
    if (this._referencesListener) {
      this._referencesListener();
    }
    if (this._providersListener) {
      this._providersListener();
    }
  }

  get workspaceDir(): string {
    return this._workspaceDir;
  }

  get rulesManager(): RulesManager {
    return this._rulesManager;
  }

  get referencesManager(): ReferencesManager {
    return this._referencesManager;
  }

  get mcpManager(): MCPClientManager {
    return this._mcpManager;
  }

  get chatSessionManager(): ChatSessionManager {
    return this._chatSessionManager;
  }

  get llmFactory(): LLMFactory {
    return this._llmFactory;
  }

  async loadConfig(): Promise<void> {
    if (this._configLoaded) return;
    
    if (!fs.existsSync(this._workspaceFile)) {
      log.error(`Workspace file does not exist: ${this._workspaceFile}`);
      throw new Error(`Workspace file does not exist: ${this._workspaceFile}`);
    }

    try {
      const data = await fs.promises.readFile(this._workspaceFile, 'utf8');
      this._workspaceData = JSON.parse(data);
      this._configLoaded = true;
    } catch (error) {
      log.error('Error loading config:', error);
      throw new Error(`Failed to load ${WorkspaceManager.WORKSPACE_FILE_NAME}: ${error}`);
    }
  }

  async saveConfig(): Promise<void> {
    await fs.promises.writeFile(this._workspaceFile, JSON.stringify(this._workspaceData, null, 2));
  }

  getSettingsValue(key: string): string | null {
    if (!this._configLoaded) {
      throw new Error('Config not loaded. Call loadConfig() first.');
    }

    if (!this._workspaceData || !this._workspaceData.settings || !this._workspaceData.settings[key]) {
      return null;
    }
        
    return this._workspaceData.settings[key];
  }

  async setSettingsValue(key: string, value: string): Promise<void> {
    if (!this._configLoaded) {
      await this.loadConfig();
    }
    
    if (!this._workspaceData) {
      this._workspaceData = { settings: {} };
    } else if (!this._workspaceData.settings) {
      this._workspaceData.settings = {};
    }
    
    this._workspaceData.settings[key] = value;

    await this.saveConfig();
  }

  isProviderInstalled(provider: string): boolean {
    return this._workspaceData?.providers?.[provider] !== undefined;
  }

  public async addProvider(provider: string): Promise<void> {
    if (!this._workspaceData) {
      this._workspaceData = { providers: {} };
    }
    this._workspaceData.providers[provider] = {};
    await this.saveConfig();
    
    // After successfully adding the provider, emit the event
    log.info('[WorkspaceManager] addProvider: emitting providers-changed');
    if (this._providersListener) {
      this._providersListener();
    }
  }

  public async removeProvider(provider: string): Promise<void> {
    if (!this._workspaceData) {
      this._workspaceData = { providers: {} };
    }
    delete this._workspaceData.providers[provider];
    await this.saveConfig();
    
    // After successfully removing the provider, emit the event
    log.info('[WorkspaceManager] removeProvider: emitting providers-changed');
    if (this._providersListener) {
      this._providersListener();
    }
  }

  getInstalledProviders(): string[] {
    if (!this._workspaceData || !this._workspaceData.providers) {
      return [];
    }
    return Object.keys(this._workspaceData.providers);
  }

  getProviderSettingsValue(provider: string, key: string): string | null {
    if (!this._configLoaded) {
      throw new Error('Config not loaded. Call loadConfig() first.');
    }

    if (!this._workspaceData || !this._workspaceData.providers || !this._workspaceData.providers[provider] || !this._workspaceData.providers[provider][key]) {
      return null;
    }
        
    return this._workspaceData.providers[provider][key];
  }

  async setProviderSettingsValue(provider: string, key: string, value: string): Promise<void> {
    if (!this._configLoaded) {
      await this.loadConfig();
    }
    
    if (!this._workspaceData) {
      this._workspaceData = { providers: {} };
    } else if (!this._workspaceData.providers) {
      this._workspaceData.providers = {};
    }

    if (!this._workspaceData.providers[provider]) {
      this._workspaceData.providers[provider] = {};
    }

    this._workspaceData.providers[provider][key] = value;

    await this.saveConfig();
  }
  
  // Returns a dictionary of all configured MCP servers with their names as keys and MCP config objects as values
  //
  async getMcpConfig(): Promise<Record<string, McpConfig>> {
    if (this._workspaceData == null) {
      return {};
    }
    
    try {
      const mcpServers = this._workspaceData.mcpServers as McpConfigFile || {} as McpConfigFile;
      
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

  // Saves a new or updated MCP server config
  //
  async saveMcpConfig(server: McpConfig): Promise<void> {    
    // Read the existing config file to preserve other properties
    if (this._workspaceData == null) {
      this._workspaceData = { mcpServers: { } };
    }

    // Add or update the server in the mcpServers object
    // Extract just the config part without the name
    this._workspaceData.mcpServers[server.name] = server.config;

    await this.saveConfig();
  }

  // Deletes an MCP server config
  //
  async deleteMcpConfig(serverName: string): Promise<boolean> {
    if (!this._workspaceData || !this._workspaceData.mcpServers || !this._workspaceData.mcpServers[serverName]) {
      return false;
    }
    
    // Delete the server from the mcpServers object
    delete this._workspaceData.mcpServers[serverName];

    await this.saveConfig();
    return true;
  }

  async getSystemPrompt(): Promise<string> {
    if (!fs.existsSync(this._promptFile!)) {
      return WorkspaceManager.DEFAULT_PROMPT;
    }
    
    try {
      return await fs.promises.readFile(this._promptFile!, 'utf8');
    } catch (error) {
      log.error('Error reading system prompt:', error);
      return WorkspaceManager.DEFAULT_PROMPT;
    }
  }

  async saveSystemPrompt(prompt: string): Promise<void> {
    await fs.promises.writeFile(this._promptFile!, prompt);
  }
} 