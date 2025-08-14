import * as path from 'path';
import * as fs from 'fs';
import { Agent, AgentFactory, Logger, AgentConfig, 
  MAX_CHAT_TURNS_DEFAULT, MAX_CHAT_TURNS_KEY, 
  MAX_OUTPUT_TOKENS_DEFAULT, MAX_OUTPUT_TOKENS_KEY, 
  TEMPERATURE_DEFAULT, TEMPERATURE_KEY, 
  TOP_P_DEFAULT, TOP_P_KEY, 
  THEME_KEY,
  SESSION_TOOL_PERMISSION_KEY, SESSION_TOOL_PERMISSION_TOOL
} from './types';
import { RulesManager } from './managers/rules-manager';
import { ReferencesManager } from './managers/references-manager';
import { ProvidersManager } from './managers/providers-manager';
import { McpServerManagerImpl } from './managers/mcp-server-manager';
import { ChatSessionManagerImpl } from './managers/chat-session-manager';
import { MCPClientManagerImpl } from './mcp/client-manager';
import { v4 as uuidv4 } from 'uuid';
import { MCPClientManager } from './mcp/types';

export class FileBasedAgent implements Agent, AgentFactory {
  private static readonly WORKSPACE_FILE_NAME = 'tspark.json';
  private static readonly SYSTEM_PROMPT_FILE_NAME = 'prompt.md';
  private static readonly DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";

  private _workspaceDir: string;
  private _workspaceFile: string;
  private _workspaceData: AgentConfig | null = null;
  private _promptFile: string;
  private _configLoaded = false;
  private _id: string;

  // Sub-managers
  public readonly rules: RulesManager;
  public readonly references: ReferencesManager;
  public readonly providers: ProvidersManager;
  public readonly mcpServers: McpServerManagerImpl;
  public readonly mcpManager: MCPClientManager;
  public readonly chatSessions: ChatSessionManagerImpl;

  // Agent interface properties
  get id(): string { return this._id; }
  get path(): string { return this._workspaceDir; }
  get name(): string { return this._workspaceData?.metadata?.name || path.basename(this._workspaceDir); }
  get description(): string | undefined { return undefined; } // Description not part of AgentMetadata

  private constructor(workspaceDir: string, private logger: Logger) {
    this._workspaceDir = workspaceDir;
    this._workspaceFile = path.join(this._workspaceDir, FileBasedAgent.WORKSPACE_FILE_NAME);
    this._promptFile = path.join(this._workspaceDir, FileBasedAgent.SYSTEM_PROMPT_FILE_NAME);
    this._id = uuidv4();
    
    // Initialize sub-managers with logger
    this.rules = new RulesManager(this._workspaceDir, this.logger);
    this.references = new ReferencesManager(this._workspaceDir, this.logger);
    this.providers = new ProvidersManager(this, this.logger);
    this.mcpServers = new McpServerManagerImpl(this, this.logger);
    this.mcpManager = new MCPClientManagerImpl();
    this.chatSessions = new ChatSessionManagerImpl(this, this.logger);
  }

  // Factory methods (AgentFactory interface)
  async createAgent(agentPath: string, logger: Logger, data?: Partial<AgentConfig>): Promise<Agent> {
    return FileBasedAgent.createAgent(agentPath, logger, data);
  }

  async loadAgent(agentPath: string, logger: Logger): Promise<Agent> {
    return FileBasedAgent.loadAgent(agentPath, logger);
  }

  async agentExists(agentPath: string): Promise<boolean> {
    return FileBasedAgent.agentExists(agentPath);
  }

  async cloneAgent(sourcePath: string, targetPath: string, logger: Logger): Promise<Agent> {
    return FileBasedAgent.cloneAgent(sourcePath, targetPath, logger);
  }

  // Static factory methods
  static async loadAgent(agentPath: string, logger: Logger): Promise<FileBasedAgent> {
    const normalizedPath = path.normalize(agentPath);
    const agent = new FileBasedAgent(normalizedPath, logger);
    await agent.loadConfig();
    return agent;
  }

  static async createAgent(agentPath: string, logger: Logger, data?: Partial<AgentConfig>): Promise<FileBasedAgent> {
    const normalizedPath = path.normalize(agentPath);
    
    // Check if agent already exists
    if (await FileBasedAgent.agentExists(normalizedPath)) {
      throw new Error(`Agent already exists at path: ${normalizedPath}`);
    }

    // Create directory if it doesn't exist
    if (!fs.existsSync(normalizedPath)) {
      fs.mkdirSync(normalizedPath, { recursive: true });
    }

    const agent = new FileBasedAgent(normalizedPath, logger);
    await agent.initialize(data);
    return agent;
  }

  static async agentExists(agentPath: string): Promise<boolean> {
    const normalizedPath = path.normalize(agentPath);
    const workspaceFile = path.join(normalizedPath, FileBasedAgent.WORKSPACE_FILE_NAME);
    return fs.existsSync(workspaceFile);
  }

  static async cloneAgent(sourcePath: string, targetPath: string, logger: Logger): Promise<FileBasedAgent> {
    const normalizedSource = path.normalize(sourcePath);
    const normalizedTarget = path.normalize(targetPath);

    if (!await FileBasedAgent.agentExists(normalizedSource)) {
      throw new Error(`Source agent does not exist: ${normalizedSource}`);
    }

    if (await FileBasedAgent.agentExists(normalizedTarget)) {
      throw new Error(`Target agent already exists: ${normalizedTarget}`);
    }

    // Create target directory
    if (!fs.existsSync(normalizedTarget)) {
      fs.mkdirSync(normalizedTarget, { recursive: true });
    }

    // Copy all agent files
    const filesToCopy = [
      FileBasedAgent.WORKSPACE_FILE_NAME,
      FileBasedAgent.SYSTEM_PROMPT_FILE_NAME,
      'refs',
      'rules'
    ];

    for (const file of filesToCopy) {
      const sourceFile = path.join(normalizedSource, file);
      const targetFile = path.join(normalizedTarget, file);
      
      if (fs.existsSync(sourceFile)) {
        if (fs.lstatSync(sourceFile).isDirectory()) {
          await fs.promises.cp(sourceFile, targetFile, { recursive: true });
        } else {
          await fs.promises.copyFile(sourceFile, targetFile);
        }
      }
    }

    return await FileBasedAgent.loadAgent(normalizedTarget, logger);
  }

  // Instance methods
  async save(): Promise<void> {
    await this.saveConfig();
  }

  async delete(): Promise<void> {
    // Remove the entire agent directory
    await fs.promises.rm(this._workspaceDir, { recursive: true, force: true });
  }

  async clone(targetPath: string): Promise<Agent> {
    return await FileBasedAgent.cloneAgent(this._workspaceDir, targetPath, this.logger);
  }

  // Settings management (Agent interface)
  getSetting(key: string): string | null {
    if (!this._configLoaded) {
      throw new Error('Config not loaded. Call loadConfig() first.');
    }

    if (!this._workspaceData || !this._workspaceData.settings || !this._workspaceData.settings[key]) {
      return null;
    }
        
    return this._workspaceData.settings[key];
  }

  async setSetting(key: string, value: string): Promise<void> {
    if (!this._configLoaded) {
      await this.loadConfig();
    }
    
    if (!this._workspaceData) {
      this._workspaceData = this.getInitialConfig();
    } else if (!this._workspaceData.settings) {
      this._workspaceData.settings = {
        [MAX_CHAT_TURNS_KEY]: MAX_CHAT_TURNS_DEFAULT.toString(),
        [MAX_OUTPUT_TOKENS_KEY]: MAX_OUTPUT_TOKENS_DEFAULT.toString(),
        [TEMPERATURE_KEY]: TEMPERATURE_DEFAULT.toString(),
        [TOP_P_KEY]: TOP_P_DEFAULT.toString(),
        [THEME_KEY]: 'light',
        [SESSION_TOOL_PERMISSION_KEY]: SESSION_TOOL_PERMISSION_TOOL
      };
    }
    
    this._workspaceData.settings[key] = value;
    await this.saveConfig();
  }

  // Legacy methods for backward compatibility
  getSettingsValue(key: string): string | null {
    return this.getSetting(key);
  }

  async setSettingsValue(key: string, value: string): Promise<void> {
    return this.setSetting(key, value);
  }

  // System prompt management
  async getSystemPrompt(): Promise<string> {
    if (!fs.existsSync(this._promptFile)) {
      return FileBasedAgent.DEFAULT_PROMPT;
    }
    
    try {
      return await fs.promises.readFile(this._promptFile, 'utf8');
    } catch (error) {
      console.error('Error reading system prompt:', error);
      return FileBasedAgent.DEFAULT_PROMPT;
    }
  }

  async setSystemPrompt(prompt: string): Promise<void> {
    await fs.promises.writeFile(this._promptFile, prompt);
  }

  // Workspace data access methods
  getWorkspaceProviders(): Record<string, any> | null {
    return this._workspaceData?.providers || null;
  }

  async updateWorkspaceProviders(providers: Record<string, any>): Promise<void> {
    if (!this._workspaceData) {
      this._workspaceData = this.getInitialConfig();
    }
    this._workspaceData.providers = providers;
    await this.saveConfig();
  }

  getWorkspaceMcpServers(): Record<string, any> | null {
    return this._workspaceData?.mcpServers || null;
  }

  async updateWorkspaceMcpServers(mcpServers: Record<string, any>): Promise<void> {
    if (!this._workspaceData) {
      this._workspaceData = this.getInitialConfig();
    }
    this._workspaceData.mcpServers = mcpServers;
    await this.saveConfig();
  }

  // Internal methods
  private async loadConfig(): Promise<void> {
    if (this._configLoaded) return;
    
    if (!fs.existsSync(this._workspaceFile)) {
      throw new Error(`Agent file does not exist: ${this._workspaceFile}`);
    }

    try {
      const data = await fs.promises.readFile(this._workspaceFile, 'utf8');
      this._workspaceData = JSON.parse(data);
      
      this._configLoaded = true;
      
      // Load MCP clients after config is loaded
      await this.mcpManager.loadClients(this);
    } catch (error) {
      throw new Error(`Failed to load ${FileBasedAgent.WORKSPACE_FILE_NAME}: ${error}`);
    }
  }

  private async saveConfig(): Promise<void> {
    await fs.promises.writeFile(this._workspaceFile, JSON.stringify(this._workspaceData, null, 2));
  }

  private async initialize(data?: Partial<AgentConfig>): Promise<void> {
    this._workspaceData = this.getInitialConfig(data);
    await this.saveConfig();
    this._configLoaded = true;
    
    // Load MCP clients after initialization
    await this.mcpManager.loadClients(this);
  }

  private getInitialConfig(data?: Partial<AgentConfig>): AgentConfig {
    return {
      metadata: {
        name: data?.metadata?.name || path.basename(this._workspaceDir),
        created: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        version: '1.0.0',
        ...data?.metadata
      },
      settings: {
        [MAX_CHAT_TURNS_KEY]: MAX_CHAT_TURNS_DEFAULT.toString(),
        [MAX_OUTPUT_TOKENS_KEY]: MAX_OUTPUT_TOKENS_DEFAULT.toString(),
        [TEMPERATURE_KEY]: TEMPERATURE_DEFAULT.toString(),
        [TOP_P_KEY]: TOP_P_DEFAULT.toString(),
        [THEME_KEY]: 'light',
        [SESSION_TOOL_PERMISSION_KEY]: SESSION_TOOL_PERMISSION_TOOL,
        ...data?.settings
      }
    };
  }

  // Internal access for sub-managers
  get workspaceData(): AgentConfig | null {
    return this._workspaceData;
  }

  get workspaceDir(): string {
    return this._workspaceDir;
  }

  get configLoaded(): boolean {
    return this._configLoaded;
  }
}
