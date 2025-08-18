import * as path from 'path';
import * as fs from 'fs';
import { Agent, AgentConfig, 
  SETTINGS_DEFAULT_MAX_CHAT_TURNS, SETTINGS_KEY_MAX_CHAT_TURNS, 
  SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS, SETTINGS_KEY_MAX_OUTPUT_TOKENS, 
  SETTINGS_DEFAULT_TEMPERATURE, SETTINGS_KEY_TEMPERATURE, 
  SETTINGS_DEFAULT_TOP_P, SETTINGS_KEY_TOP_P, 
  SETTINGS_KEY_THEME,
  SESSION_TOOL_PERMISSION_KEY, SESSION_TOOL_PERMISSION_TOOL
} from '../types/agent';
import { Logger } from '../types/common';
import { RulesManager } from '../managers/rules-manager';
import { ReferencesManager } from '../managers/references-manager';
import { McpServerManagerImpl } from '../managers/mcp-server-manager';
import { ChatSessionManagerImpl } from '../managers/chat-session-manager';
import { MCPClientManagerImpl } from '../mcp/client-manager';
import { v4 as uuidv4 } from 'uuid';
import { McpClient, MCPClientManager, McpConfig } from '../mcp/types';
import { EventEmitter } from 'events';
import { ProviderFactory } from '../providers/provider-factory';
import { Provider, ProviderInfo, ProviderModel, ProviderType } from '../providers/types';
import { Reference, Rule } from '..';
import { ChatSession, ChatSessionOptions } from '../types/chat';

export class FileBasedAgent  extends EventEmitter implements Agent {
  private static readonly WORKSPACE_FILE_NAME = 'tspark.json';
  private static readonly SYSTEM_PROMPT_FILE_NAME = 'prompt.md';
  private static readonly DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";

  private _workspaceDir: string;
  private _workspaceFile: string;
  private _workspaceData: AgentConfig | null = null;
  private _promptFile: string;
  private _configLoaded = false;
  private _id: string;

  private providerFactory: ProviderFactory;

  // Sub-managers
  public readonly chatSessions: ChatSessionManagerImpl;
  public readonly rules: RulesManager;
  public readonly references: ReferencesManager;
  public readonly mcpServers: McpServerManagerImpl;
  private readonly mcpManager: MCPClientManager;
  
  // Agent interface properties
  get id(): string { return this._id; }
  get path(): string { return this._workspaceDir; }
  get name(): string { return this._workspaceData?.metadata?.name || path.basename(this._workspaceDir); }
  get description(): string | undefined { return undefined; } // Description not part of AgentMetadata

  private constructor(workspaceDir: string, private logger: Logger) {
    super();
    this._workspaceDir = workspaceDir;
    this._workspaceFile = path.join(this._workspaceDir, FileBasedAgent.WORKSPACE_FILE_NAME);
    this._promptFile = path.join(this._workspaceDir, FileBasedAgent.SYSTEM_PROMPT_FILE_NAME);
    this._id = uuidv4();

    this.providerFactory = new ProviderFactory(this, logger);
    
    // Initialize sub-managers with logger
    this.mcpManager = new MCPClientManagerImpl(this.logger);
    this.rules = new RulesManager(this._workspaceDir, this.logger);
    this.references = new ReferencesManager(this._workspaceDir, this.logger);
    this.mcpServers = new McpServerManagerImpl(this, this.mcpManager, this.logger);
    this.chatSessions = new ChatSessionManagerImpl(this, this.logger);
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
        [SETTINGS_KEY_MAX_CHAT_TURNS]: SETTINGS_DEFAULT_MAX_CHAT_TURNS.toString(),
        [SETTINGS_KEY_MAX_OUTPUT_TOKENS]: SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS.toString(),
        [SETTINGS_KEY_TEMPERATURE]: SETTINGS_DEFAULT_TEMPERATURE.toString(),
        [SETTINGS_KEY_TOP_P]: SETTINGS_DEFAULT_TOP_P.toString(),
        [SETTINGS_KEY_THEME]: 'light',
        [SESSION_TOOL_PERMISSION_KEY]: SESSION_TOOL_PERMISSION_TOOL
      };
    }
    
    this._workspaceData.settings[key] = value;
    await this.saveConfig();
  }

  // System prompt management
  async getSystemPrompt(): Promise<string> {
    if (!fs.existsSync(this._promptFile)) {
      return FileBasedAgent.DEFAULT_PROMPT;
    }
    
    try {
      return await fs.promises.readFile(this._promptFile, 'utf8');
    } catch (error) {
      this.logger.error('Error reading system prompt:', error);
      return FileBasedAgent.DEFAULT_PROMPT;
    }
  }

  async setSystemPrompt(prompt: string): Promise<void> {
    await fs.promises.writeFile(this._promptFile, prompt);
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
      await this.mcpManager.loadMcpClients(this);
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
    await this.mcpManager.loadMcpClients(this);
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
        [SETTINGS_KEY_MAX_CHAT_TURNS]: SETTINGS_DEFAULT_MAX_CHAT_TURNS.toString(),
        [SETTINGS_KEY_MAX_OUTPUT_TOKENS]: SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS.toString(),
        [SETTINGS_KEY_TEMPERATURE]: SETTINGS_DEFAULT_TEMPERATURE.toString(),
        [SETTINGS_KEY_TOP_P]: SETTINGS_DEFAULT_TOP_P.toString(),
        [SETTINGS_KEY_THEME]: 'light',
        [SESSION_TOOL_PERMISSION_KEY]: SESSION_TOOL_PERMISSION_TOOL,
        ...data?.settings
      }
    };
  }

  // RulesManager methods
  getAllRules(): Rule[] {
    return this.rules.getAllRules();
  }
  getRule(name: string): Rule | null {
    return this.rules.getRule(name);
  }
  addRule(rule: Rule): void {
    this.rules.addRule(rule);
  }
  deleteRule(name: string): boolean {
    return this.rules.deleteRule(name);
  }

  // ReferencesManager methods
  getAllReferences(): Reference[] {
    return this.references.getAllReferences();
  }
  getReference(name: string): Reference | null {
    return this.references.getReference(name);
  }

  addReference(reference: Reference): void {
    this.references.addReference(reference);
  }
  deleteReference(name: string): boolean {
    return this.references.deleteReference(name);
  }

  // Workspace data access methods
  private getWorkspaceProviders(): Record<string, any> | null {
    return this._workspaceData?.providers || null;
  }

  private async updateWorkspaceProviders(providers: Record<string, any>): Promise<void> {
    if (!this._workspaceData) {
      this._workspaceData = this.getInitialConfig();
    }
    this._workspaceData.providers = providers;
    await this.saveConfig();
  }  

  // Provider configuration methods
  //
  getInstalledProviders(): ProviderType[] {
    const providers = this.getWorkspaceProviders();
    return providers ? Object.keys(providers) as ProviderType[] : [];
  }

  isProviderInstalled(provider: ProviderType): boolean {
    const providers = this.getWorkspaceProviders();
    return providers?.[provider] !== undefined;
  }

  getInstalledProviderConfig(provider: ProviderType): Record<string, string> | null {
    const providers = this.getWorkspaceProviders();
    return providers?.[provider] || null;
  }

  createProvider(provider: ProviderType, modelId?: string): Provider {
    return this.providerFactory.create(provider, modelId);
  }

  async installProvider(provider: ProviderType, config: Record<string, string>): Promise<void> {
    const providers = this.getWorkspaceProviders() || {};
    providers[provider] = config;
    await this.updateWorkspaceProviders(providers);
    
    // Emit change event
    this.emit('providersChanged');
  }

  async updateProvider(provider: ProviderType, config: Record<string, string>): Promise<void> {
    const providers = this.getWorkspaceProviders() || {};
    providers[provider] = config;
    await this.updateWorkspaceProviders(providers);
    
    // Emit change event
    this.emit('providersChanged');
  }

  async uninstallProvider(provider: ProviderType): Promise<void> {
    const providers = this.getWorkspaceProviders();
    if (!providers || !providers[provider]) return;
    
    delete providers[provider];
    await this.updateWorkspaceProviders(providers);
    
    // Emit change event
    this.emit('providersChanged');
  }

  // Provider factory methods
  //
  async validateProviderConfiguration(provider: ProviderType, config: Record<string, string>): Promise<{ isValid: boolean, error?: string }> {
    return this.providerFactory.validateConfiguration(provider, config);
  }

  getAvailableProviders(): ProviderType[] {
    return this.providerFactory.getAvailableProviders();
  }

  getAvailableProvidersInfo(): Partial<Record<ProviderType, ProviderInfo>> {
    return this.providerFactory.getProvidersInfo();
  }

  getProviderInfo(providerType: ProviderType): ProviderInfo {
    return this.providerFactory.getProviderInfo(providerType);
  }

  async getProviderModels(providerType: ProviderType): Promise<ProviderModel[]> {
    const providerInstance = this.providerFactory.create(providerType);
    return providerInstance.getModels();
  }

  // MCP Server management methods
  getAllMcpServers(): Promise<Record<string, McpConfig>> {
    return this.mcpServers.getAllMcpServers();
  }
  getMcpServer(serverName: string): McpConfig | null {
    return this.mcpServers.getMcpServer(serverName);
  }
  saveMcpServer(server: McpConfig): Promise<void> {
    return this.mcpServers.saveMcpServer(server);
  }
  deleteMcpServer(serverName: string): Promise<boolean> {
    return this.mcpServers.deleteMcpServer(serverName);
  }

  // MCP Client access methods
  getAllMcpClients(): Record<string, McpClient> {
    return this.mcpManager.getAllMcpClients();
  }
  getMcpClient(name: string): McpClient | undefined {
    return this.mcpManager.getMcpClient(name);
  }
  
  // ChatSessionManager methods
  getAllChatSessions(): ChatSession[] {
    return this.chatSessions.getAllChatSessions();
  }
  getChatSession(sessionId: string): ChatSession | null {
    return this.chatSessions.getChatSession(sessionId);
  }
  createChatSession(sessionId: string, options?: ChatSessionOptions): ChatSession {
    return this.chatSessions.createChatSession(sessionId, options);
  }
  deleteChatSession(sessionId: string): Promise<boolean> {
    return this.chatSessions.deleteChatSession(sessionId);
  }
}
