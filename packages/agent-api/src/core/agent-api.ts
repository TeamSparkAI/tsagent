import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

import { Agent, AgentConfig, AgentSettings,
  SETTINGS_DEFAULT_MAX_CHAT_TURNS, SETTINGS_KEY_MAX_CHAT_TURNS, 
  SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS, SETTINGS_KEY_MAX_OUTPUT_TOKENS, 
  SETTINGS_DEFAULT_TEMPERATURE, SETTINGS_KEY_TEMPERATURE, 
  SETTINGS_DEFAULT_TOP_P, SETTINGS_KEY_TOP_P, 
  SETTINGS_KEY_THEME,
  SESSION_TOOL_PERMISSION_KEY, SESSION_TOOL_PERMISSION_TOOL,
  AgentMetadata,
  AgentMode,
  SupervisorConfig
} from '../types/agent.js';
import { Logger } from '../types/common.js';
import { RulesManager } from '../managers/rules-manager.js';
import { ReferencesManager } from '../managers/references-manager.js';
import { McpServerManagerImpl } from '../managers/mcp-server-manager.js';
import { ChatSessionManagerImpl } from '../managers/chat-session-manager.js';
import { MCPClientManagerImpl } from '../mcp/client-manager.js';
import { SupervisionManagerImpl } from '../managers/supervision-manager.js';
import { SupervisorFactory } from '../supervisors/supervisor-factory.js';
import { SupervisionManager, Supervisor } from '../types/supervision.js';
import { McpClient, MCPClientManager, McpConfig } from '../mcp/types.js';
import { ProviderFactory } from '../providers/provider-factory.js';
import { Provider, ProviderInfo, ProviderModel, ProviderType } from '../providers/types.js';
import { Reference, Rule } from '../index.js';
import { ChatSession, ChatSessionOptions } from '../types/chat.js';
import { AgentStrategy, FileBasedAgentStrategy } from './agent-strategy.js';

// The idea behind the agent strategy is that you might want to serialize agents differenty (for example, in a database for an 
// online service), or you might want to be able to create ephemral agents where you can set their state however you want and use
// them (with no strategy to serialize them).
//
// We inject an optional AgentStrategy into our agent at creation time.  We then call either load() or create() to initialize the agent.
//

export class AgentImpl  extends EventEmitter implements Agent {
  private static readonly DEFAULT_PROMPT = "You are a helpful AI assistant that can use tools to help accomplish tasks.";

  private _strategy: AgentStrategy | null = null;
  private _agentData: AgentConfig | null = null;
  private _prompt: string | null = null;
  private _id: string;

  private providerFactory: ProviderFactory;

  // Sub-managers
  public readonly chatSessions: ChatSessionManagerImpl;
  public readonly rules: RulesManager;
  public readonly references: ReferencesManager;
  public readonly mcpServers: McpServerManagerImpl;
  private readonly mcpManager: MCPClientManager;
  private _supervisionManager?: SupervisionManagerImpl;

  // Agent interface properties
  get id(): string { return this._id; }
  get name(): string { return this._agentData?.metadata?.name || this._strategy?.getName() || this._id; }
  get path(): string { return this._strategy?.getName() || this._id; }
  get description(): string | undefined { return this._agentData?.metadata?.description; }
  get mode(): AgentMode { 
    if (this._agentData?.metadata?.tools) return 'tools';
    if (this._agentData?.metadata?.skills) return 'autonomous';
    return 'interactive';
  }

  constructor(strategy: AgentStrategy | null, private logger: Logger) {
    super();
    this._id = uuidv4();
    this._strategy = strategy;

    this.providerFactory = new ProviderFactory(this, logger);
    
    // Initialize sub-managers with logger
    this.mcpManager = new MCPClientManagerImpl(this, this.logger);
    this.rules = new RulesManager(this.logger);
    this.references = new ReferencesManager(this.logger);
    this.mcpServers = new McpServerManagerImpl(this, this.mcpManager, this.logger);
    this.chatSessions = new ChatSessionManagerImpl(this, this.logger);
  }

  private getDefaultSettings(): AgentSettings {
    return {
      [SETTINGS_KEY_MAX_CHAT_TURNS]: SETTINGS_DEFAULT_MAX_CHAT_TURNS.toString(),
      [SETTINGS_KEY_MAX_OUTPUT_TOKENS]: SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS.toString(),
      [SETTINGS_KEY_TEMPERATURE]: SETTINGS_DEFAULT_TEMPERATURE.toString(),
      [SETTINGS_KEY_TOP_P]: SETTINGS_DEFAULT_TOP_P.toString(),
      [SETTINGS_KEY_THEME]: 'light',
      [SESSION_TOOL_PERMISSION_KEY]: SESSION_TOOL_PERMISSION_TOOL
    };
  }

  private getInitialConfig(data?: Partial<AgentConfig>): AgentConfig {
    return {
      metadata: {
        name: data?.metadata?.name || this._strategy?.getName() || this._id,
        created: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        version: '1.0.0',
        ...data?.metadata
      },
      settings: {
        ...this.getDefaultSettings(),
        ...data?.settings
      }
    };
  }

  async load(): Promise<void> {
    if (!this._strategy) {
      throw new Error('Strategy not set, cannot call load(). Call create() instead to create an agent with no strategy.');
    }

    if (!await this._strategy.exists()) {
      throw new Error('Agent does not exist. Call create() to create a new agent.');
    }

    this._agentData = await this._strategy.loadConfig();
    if (this._agentData && !this._agentData.settings) {
      this._agentData.settings = this.getDefaultSettings();
    }
    this._prompt = await this._strategy.loadSystemPrompt(AgentImpl.DEFAULT_PROMPT);

    await this.references.loadReferences(this._strategy);
    await this.rules.loadRules(this._strategy);

    // Preload MCP clients so they're available for sessions
    await this.preloadMcpClients();

    this.logger.info(`[AGENT] Agent loaded successfully, theme: ${this._agentData?.settings?.[SETTINGS_KEY_THEME]}`);
  }

  async create(data?: Partial<AgentConfig>): Promise<void> {
    this._agentData = this.getInitialConfig(data);
    this._prompt = AgentImpl.DEFAULT_PROMPT;
    if (this._strategy) {
      if (await this._strategy.exists()) {
        throw new Error('Cannot create agent that already exists. Call load() to load an existing agent.');
      }
  
      await this._strategy.saveConfig(this._agentData);
      await this._strategy.saveSystemPrompt(this._prompt);
    }    
  }

  async delete(): Promise<void> {
    // Remove the entire agent
    if (this._strategy) {
      await this._strategy.deleteAgent();
  }
  }

  // Settings management (Agent interface)
  //

  getSetting(key: string): string | null {
    if (!this._agentData) {
      throw new Error('Config not loaded. Call initialize() or load() first.');
    }

    if (!this._agentData || !this._agentData.settings || !this._agentData.settings[key]) {
      return null;
    }
        
    return this._agentData.settings[key];
  }

  async setSetting(key: string, value: string): Promise<void> {
    if (!this._agentData || !this._agentData.settings) {
      throw new Error('Config not loaded. Call initialize() or load() first.');
    }

    this._agentData.settings[key] = value;
    if (this._strategy) {
      await this._strategy.saveConfig(this._agentData);
    }
  }

  // System prompt management
  //

  async getSystemPrompt(): Promise<string> {
    if (this._prompt) {
      return this._prompt;
    }
    return AgentImpl.DEFAULT_PROMPT;
  }

  async setSystemPrompt(prompt: string): Promise<void> {
    this._prompt = prompt;
    if (this._strategy) {
      await this._strategy.saveSystemPrompt(prompt);
    }
  }

  // Agent metadata management
  //
  
  getMetadata(): AgentMetadata {
    if (!this._agentData?.metadata) {
      throw new Error('Agent not loaded');
    }
    return { ...this._agentData.metadata };
  }

  async updateMetadata(metadata: Partial<AgentMetadata>): Promise<void> {
    if (!this._agentData) {
      throw new Error('Agent not loaded');
    }
    
    this._agentData.metadata = { ...this._agentData.metadata, ...metadata };
    
    if (this._strategy) {
      await this._strategy.saveConfig(this._agentData);
    }
  }

  // RulesManager methods
  //

  getAllRules(): Rule[] {
    return this.rules.getAllRules();
  }
  getRule(name: string): Rule | null {
    return this.rules.getRule(name);
  }
  addRule(rule: Rule): Promise<void> {
    return this.rules.addRule(this._strategy, rule);
  }
  deleteRule(name: string): Promise<boolean> {
    return this.rules.deleteRule(this._strategy, name);
  }

  // ReferencesManager methods
  //

  getAllReferences(): Reference[] {
    return this.references.getAllReferences();
  }
  getReference(name: string): Reference | null {
    return this.references.getReference(name);
  }

  addReference(reference: Reference): Promise<void> {
    return this.references.addReference(this._strategy, reference);
  }
  deleteReference(name: string): Promise<boolean> {
    return this.references.deleteReference(this._strategy, name);
  }

  // Provider state management (internal)
  //

  private getAgentProviders(): Record<string, any> | null {
    return this._agentData?.providers || null;
  }

  private async updateAgentProviders(providers: Record<string, any>): Promise<void> {
    if (!this._agentData) {
      throw new Error('Config not loaded. Call initialize() or load() first.');
    }
    this._agentData.providers = providers;
    if (this._strategy) {
      await this._strategy.saveConfig(this._agentData);
    }
  }  

  // Provider configuration methods
  //

  getInstalledProviders(): ProviderType[] {
    const providers = this.getAgentProviders();
    return providers ? Object.keys(providers) as ProviderType[] : [];
  }

  isProviderInstalled(provider: ProviderType): boolean {
    const providers = this.getAgentProviders();
    return providers?.[provider] !== undefined;
  }

  getInstalledProviderConfig(provider: ProviderType): Record<string, string> | null {
    const providers = this.getAgentProviders();
    return providers?.[provider] || null;
  }

  createProvider(provider: ProviderType, modelId?: string): Provider {
    return this.providerFactory.create(provider, modelId);
  }

  async installProvider(provider: ProviderType, config: Record<string, string>): Promise<void> {
    const providers = this.getAgentProviders() || {};
    providers[provider] = config;
    await this.updateAgentProviders(providers);
    
    // Emit change event
    this.emit('providersChanged');
  }

  async updateProvider(provider: ProviderType, config: Record<string, string>): Promise<void> {
    const providers = this.getAgentProviders() || {};
    providers[provider] = config;
    await this.updateAgentProviders(providers);
    
    // Emit change event
    this.emit('providersChanged');
  }

  async uninstallProvider(provider: ProviderType): Promise<void> {
    const providers = this.getAgentProviders();
    if (!providers || !providers[provider]) return;
    
    delete providers[provider];
    await this.updateAgentProviders(providers);
    
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

  // Agent methods used by MCP Server manager to manage MCP server (and client)state
  //

  getAgentMcpServers(): Record<string, any> | null {
    return this._agentData?.mcpServers || null;
  }

  async updateAgentMcpServers(mcpServers: Record<string, any>): Promise<void> {
    if (!this._agentData) {
      throw new Error('Config not loaded. Call initialize() or load() first.');
    }
    this._agentData.mcpServers = mcpServers;
    if (this._strategy) {
      await this._strategy.saveConfig(this._agentData);
    }
  }

  // MCP Server management methods
  //

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
  getAllMcpClients(): Promise<Record<string, McpClient>> {
    return this.mcpManager.getAllMcpClients();
  }
  getAllMcpClientsSync(): Record<string, McpClient> {
    return this.mcpManager.getAllMcpClientsSync();
  }
  getMcpClient(name: string): Promise<McpClient | undefined> {
    return this.mcpManager.getMcpClient(name);
  }
  
  // ChatSessionManager methods
  //

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

  // Supervision management methods
  getSupervisionManager(): SupervisionManager | null {
    return this._supervisionManager || null;
  }

  setSupervisionManager(supervisionManager: SupervisionManager): void {
    this._supervisionManager = supervisionManager as SupervisionManagerImpl;
  }

  async addSupervisor(supervisor: Supervisor): Promise<void> {
    if (!this._supervisionManager) {
      this._supervisionManager = new SupervisionManagerImpl(this.logger);
    }
    await this._supervisionManager.addSupervisor(supervisor);
  }

  async removeSupervisor(supervisorId: string): Promise<void> {
    if (this._supervisionManager) {
      await this._supervisionManager.removeSupervisor(supervisorId);
    }
  }

  getSupervisor(supervisorId: string): Supervisor | null {
    return this._supervisionManager?.getSupervisor(supervisorId) || null;
  }

  getAllSupervisors(): Supervisor[] {
    return this._supervisionManager?.getAllSupervisors() || [];
  }
  
  getSupervisorConfigs(): SupervisorConfig[] {
    return this._agentData?.supervisors || [];
  }
  
  /**
   * Load supervisors from agent configuration
   */
  async loadSupervisorsFromConfig(): Promise<void> {
    const supervisorConfigs = this._agentData?.supervisors;
    if (!supervisorConfigs || supervisorConfigs.length === 0) {
      return;
    }
    
    
    for (const config of supervisorConfigs) {
      try {
        const supervisor = SupervisorFactory.createSupervisor(config, this.logger);
        await this.addSupervisor(supervisor);
        this.logger.info(`Loaded supervisor: ${config.name} (${config.id})`);
      } catch (error) {
        this.logger.error(`Failed to load supervisor ${config.id}: ${error}`);
      }
    }
  }

  private async preloadMcpClients(): Promise<void> {
    try {
      this.logger.info(`[AGENT] Preloading MCP clients...`);
      await this.mcpManager.getAllMcpClients();
      this.logger.info(`[AGENT] MCP clients preloaded successfully`);
    } catch (error) {
      this.logger.warn(`[AGENT] Error preloading MCP clients:`, error);
    }
  }
}

export class FileBasedAgentFactory {
    static async loadAgent(agentPath: string, logger: Logger): Promise<AgentImpl> {
      const normalizedPath = path.normalize(agentPath);
      
      // Check if agent already exists
      if (!await FileBasedAgentStrategy.agentExists(normalizedPath)) {
        throw new Error(`Agent does not exist at path: ${normalizedPath}`);
      }

      const strategy = new FileBasedAgentStrategy(normalizedPath, logger);
      const agent = new AgentImpl(strategy, logger);
      await agent.load();
      
      // Load supervisors from configuration
      await agent.loadSupervisorsFromConfig();
      
      return agent;
    }
  
    static async createAgent(agentPath: string, logger: Logger, data?: Partial<AgentConfig>): Promise<AgentImpl> {
      const normalizedPath = path.normalize(agentPath);
      
      // Check if agent already exists
      if (await FileBasedAgentStrategy.agentExists(normalizedPath)) {
        throw new Error(`Agent already exists at path: ${normalizedPath}`);
      }

      const strategy = new FileBasedAgentStrategy(normalizedPath, logger);
      const agent = new AgentImpl(strategy, logger);
      await agent.create(data);
      return agent;
    }
  
    static async cloneAgent(sourcePath: string, targetPath: string, logger: Logger): Promise<Agent> {
      return await FileBasedAgentStrategy.cloneAgent(sourcePath, targetPath, logger);
    }
}