import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';

import { Agent, AgentConfig, AgentConfigSchema, AgentSettings, AgentSettingsSchema,
  AgentMetadata, AgentMetadataSchema,
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
import { McpClient, MCPClientManager, McpServerEntry, McpServerConfig } from '../mcp/types.js';
import { ProviderFactory } from '../providers/provider-factory.js';
import { Provider, ProviderInfo, ProviderModel, ProviderId } from '../providers/types.js';
import { Reference } from '../types/references.js';
import { Rule } from '../types/rules.js';
import { ChatSession, ChatSessionOptions } from '../types/chat.js';
import { SessionContextItem, RequestContextItem } from '../types/context.js';
import { AgentStrategy, FileBasedAgentStrategy } from './agent-strategy.js';
import { SemanticIndexer } from '../managers/semantic-indexer.js';
import { SecretManager } from '../secrets/secret-manager.js';

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
  private secretManager: SecretManager;

  // Sub-managers
  public readonly chatSessions: ChatSessionManagerImpl;
  public readonly rulesManager: RulesManager;
  public readonly referencesManager: ReferencesManager;
  public readonly mcpServers: McpServerManagerImpl;
  private readonly mcpManager: MCPClientManager;
  private _supervisionManager?: SupervisionManagerImpl;
  private _semanticIndexer: SemanticIndexer | null = null;

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
    this.secretManager = new SecretManager(this, logger);
    
    // Initialize sub-managers with logger and config updater
    this.mcpManager = new MCPClientManagerImpl(this, this.logger);
    
    // Create config updater for rules and references managers
    const configUpdater = {
      getConfig: () => this._agentData,
      updateConfig: async (updater: (config: AgentConfig) => void) => {
        if (!this._agentData) {
          throw new Error('Cannot update config: agent not loaded');
        }
        updater(this._agentData);
        if (this._strategy) {
          await this._strategy.saveConfig(this._agentData);
        }
      }
    };
    
    this.rulesManager = new RulesManager(this.logger, configUpdater);
    this.referencesManager = new ReferencesManager(this.logger, configUpdater);
    this.mcpServers = new McpServerManagerImpl(this, this.mcpManager, this.logger);
    this.chatSessions = new ChatSessionManagerImpl(this, this.logger);
  }

  private getDefaultSettings(): AgentSettings {
    // Use Zod schema to generate defaults by parsing an empty object
    return AgentSettingsSchema.parse({});
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
      },
      systemPrompt: data?.systemPrompt || '',
      rules: data?.rules || [],
      references: data?.references || []
    };
  }

  /**
   * Load agent configuration from strategy (lightweight).
   * Loads config, environment variables, and extracts embedded content.
   * Does NOT initialize MCP clients or supervisors (see initialize()).
   */
  async load(): Promise<void> {
    if (!this._strategy) {
      throw new Error('Strategy not set, cannot call load(). Call create() instead to create an agent with no strategy.');
    }

    if (!await this._strategy.exists()) {
      throw new Error('Agent does not exist. Call create() to create a new agent.');
    }

    // Load environment variables from .env files
    // Priority: process.env > agentDir/.env > cwd/.env
    this.loadEnvironmentVariables();

    // Load config once - everything (prompt, rules, references) is embedded in YAML
    this._agentData = await this._strategy.loadConfig();
    if (this._agentData && !this._agentData.settings) {
      this._agentData.settings = this.getDefaultSettings();
    }

    // Extract system prompt (managers read directly from _agentData)
    this._prompt = this._agentData.systemPrompt || AgentImpl.DEFAULT_PROMPT;

    this.logger.info(`[AGENT] Agent config loaded, theme: ${this._agentData?.settings?.theme}`);
  }

  /**
   * Initialize heavy resources (MCP clients, supervisors).
   * Call this after load() to fully initialize the agent for use.
   */
  async initialize(): Promise<void> {
    if (!this._agentData) {
      throw new Error('Agent config not loaded. Call load() first.');
    }

    // Preload MCP clients so they're available for sessions
    // This is the main heavy operation (connects to external MCP servers)
    await this.preloadMcpClients();

    // Load supervisors from configuration
    await this.loadSupervisorsFromConfig();

    this.logger.info(`[AGENT] Agent initialized (MCP clients and supervisors loaded)`);
  }

  /**
   * Load environment variables from .env files
   * Priority: process.env (highest) > agentDir/.env > cwd/.env (lowest)
   */
  private loadEnvironmentVariables(): void {
    const cwd = process.cwd();
    const agentDir = this._strategy?.getName() || cwd;

    this.logger.info(`[AGENT] ===== Loading environment variables =====`);
    this.logger.info(`[AGENT] CWD: ${cwd}`);
    this.logger.info(`[AGENT] Agent Dir: ${agentDir}`);

    // Load from CWD .env (lower priority, loaded first)
    const cwdEnvPath = path.join(cwd, '.env');
    try {
      const cwdResult = dotenv.config({ path: cwdEnvPath, override: true });
      if (cwdResult.error) {
        const errorCode = (cwdResult.error as NodeJS.ErrnoException).code;
        if (errorCode !== 'ENOENT') {
          this.logger.warn(`[AGENT] Failed to load .env from CWD: ${cwdResult.error.message}`);
        } else {
          this.logger.info(`[AGENT] No .env file found at CWD: ${cwdEnvPath}`);
        }
      } else {
        this.logger.info(`[AGENT] Loaded .env from CWD: ${cwdEnvPath}`);
        if (cwdResult.parsed) {
          const keys = Object.keys(cwdResult.parsed);
          this.logger.info(`[AGENT] Loaded ${keys.length} environment variables from CWD .env: ${keys.join(', ')}`);
        }
      }
    } catch (error) {
      this.logger.warn(`[AGENT] Error loading .env from CWD: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Load from agent directory .env (higher priority, overrides CWD)
    const agentEnvPath = path.join(agentDir, '.env');
    try {
      const agentResult = dotenv.config({ path: agentEnvPath, override: true });
      if (agentResult.error) {
        const errorCode = (agentResult.error as NodeJS.ErrnoException).code;
        if (errorCode !== 'ENOENT') {
          this.logger.warn(`[AGENT] Failed to load .env from agent directory: ${agentResult.error.message}`);
        } else {
          this.logger.info(`[AGENT] No .env file found at agent directory: ${agentEnvPath}`);
        }
      } else {
        this.logger.info(`[AGENT] Loaded .env from agent directory: ${agentEnvPath}`);
        if (agentResult.parsed) {
          const keys = Object.keys(agentResult.parsed);
          this.logger.info(`[AGENT] Loaded ${keys.length} environment variables from agent directory .env: ${keys.join(', ')}`);
        }
      }
    } catch (error) {
      this.logger.warn(`[AGENT] Error loading .env from agent directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Check for 1Password environment variables
    // Availability is determined by OP_SERVICE_ACCOUNT_TOKEN or OP_CONNECT_TOKEN
    // OP_CONNECT_HOST is optional and only used when OP_CONNECT_TOKEN is present
    const hasOpServiceAccount = !!process.env.OP_SERVICE_ACCOUNT_TOKEN;
    const hasOpConnectToken = !!process.env.OP_CONNECT_TOKEN;
    if (hasOpServiceAccount || hasOpConnectToken) {
      this.logger.info(`[AGENT] 1Password support detected: OP_SERVICE_ACCOUNT_TOKEN=${hasOpServiceAccount}, OP_CONNECT_TOKEN=${hasOpConnectToken}`);
    } else {
      this.logger.info(`[AGENT] 1Password support not available (OP_SERVICE_ACCOUNT_TOKEN and OP_CONNECT_TOKEN not set)`);
    }
  }

  async create(data?: Partial<AgentConfig>): Promise<void> {
    // Validate partial config if provided
    if (data) {
      AgentConfigSchema.partial().parse(data);
    }
    
    // Load environment variables from .env files
    // Priority: process.env > agentDir/.env > cwd/.env
    this.loadEnvironmentVariables();

    this._agentData = this.getInitialConfig(data);
    this._prompt = this._agentData.systemPrompt || AgentImpl.DEFAULT_PROMPT;
    if (this._strategy) {
      if (await this._strategy.exists()) {
        throw new Error('Cannot create agent that already exists. Call load() to load an existing agent.');
      }
  
      await this._strategy.saveConfig(this._agentData);
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

  getSettings(): AgentSettings {
    if (!this._agentData?.settings) {
      throw new Error('Agent not loaded');
    }
    return { ...this._agentData.settings };
  }

  async updateSettings(settings: Partial<AgentSettings>): Promise<void> {
    if (!this._agentData) {
      throw new Error('Agent not loaded');
    }
    
    // Validate partial settings using Zod schema
    AgentSettingsSchema.partial().parse(settings);
    
    // Merge with existing settings
    this._agentData.settings = { ...this._agentData.settings, ...settings };
    
    if (this._strategy) {
      await this._strategy.saveConfig(this._agentData);
    }
  }

  // Config persistence
  async save(): Promise<void> {
    if (!this._agentData) {
      throw new Error('Cannot save: agent not loaded');
    }
    if (this._strategy) {
      await this._strategy.saveConfig(this._agentData);
    }
  }

  // System prompt management
  //

  async getSystemPrompt(): Promise<string> {
    if (!this._agentData) {
      return AgentImpl.DEFAULT_PROMPT;
    }
    return this._agentData.systemPrompt || AgentImpl.DEFAULT_PROMPT;
  }

  async setSystemPrompt(prompt: string): Promise<void> {
    if (!this._agentData) {
      throw new Error('Cannot set system prompt: agent not loaded');
    }
    this._agentData.systemPrompt = prompt;
    this._prompt = prompt;
    if (this._strategy) {
      await this._strategy.saveConfig(this._agentData);
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
    
    // Validate partial metadata using Zod schema
    AgentMetadataSchema.partial().parse(metadata);
    
    this._agentData.metadata = { ...this._agentData.metadata, ...metadata };
    
    if (this._strategy) {
      await this._strategy.saveConfig(this._agentData);
    }
  }

  // RulesManager methods
  //

  getAllRules(): Rule[] {
    return this.rulesManager.getAllRules();
  }
  getRule(name: string): Rule | null {
    return this.rulesManager.getRule(name);
  }
  async addRule(rule: Rule): Promise<void> {
    return this.rulesManager.addRule(rule);
  }
  deleteRule(name: string): Promise<boolean> {
    return this.rulesManager.deleteRule(name);
  }

  // ReferencesManager methods
  //

  getAllReferences(): Reference[] {
    return this.referencesManager.getAllReferences();
  }
  getReference(name: string): Reference | null {
    return this.referencesManager.getReference(name);
  }

  async addReference(reference: Reference): Promise<void> {
    return this.referencesManager.addReference(reference);
  }
  deleteReference(name: string): Promise<boolean> {
    return this.referencesManager.deleteReference(name);
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

  getInstalledProviders(): ProviderId[] {
    const providers = this.getAgentProviders();
    return providers ? Object.keys(providers) as ProviderId[] : [];
  }

  isProviderInstalled(provider: ProviderId): boolean {
    const providers = this.getAgentProviders();
    return providers?.[provider] !== undefined;
  }

  getInstalledProviderConfig(provider: ProviderId): Record<string, string> | null {
    const providers = this.getAgentProviders();
    const rawConfig = providers?.[provider] || null;
    return rawConfig;
  }

  /**
   * Get resolved provider configuration with secrets resolved from their sources
   */
  async getResolvedProviderConfig(provider: ProviderId): Promise<Record<string, string> | null> {
    const rawConfig = this.getInstalledProviderConfig(provider);
    if (!rawConfig) {
      return null;
    }

    try {
      return await this.secretManager.resolveProviderConfig(rawConfig);
    } catch (error) {
      this.logger.error(`Failed to resolve provider config for ${provider}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async createProvider(provider: ProviderId, modelId?: string): Promise<Provider> {
    return await this.providerFactory.create(provider, modelId);
  }

  async installProvider(provider: ProviderId, config: Record<string, string>): Promise<void> {
    if (!this._agentData) {
      throw new Error('Cannot install provider: agent not loaded');
    }

    // Store raw config as-is (defaults will be applied when provider is created via create())
    if (!this._agentData.providers) {
      this._agentData.providers = {};
    }
    this._agentData.providers[provider] = config || {};

    // Save config
    if (this._strategy) {
      await this._strategy.saveConfig(this._agentData);
    }
    
    // Emit change event
    this.emit('providersChanged');
  }

  async updateProvider(provider: ProviderId, config: Record<string, string>): Promise<void> {
    const providers = this.getAgentProviders() || {};
    providers[provider] = config;
    await this.updateAgentProviders(providers);
    
    // Emit change event
    this.emit('providersChanged');
  }

  async uninstallProvider(provider: ProviderId): Promise<void> {
    const providers = this.getAgentProviders();
    if (!providers || !providers[provider]) return;
    
    delete providers[provider];
    await this.updateAgentProviders(providers);
    
    // Emit change event
    this.emit('providersChanged');
  }

  // Provider factory methods
  //

  async validateProviderConfiguration(provider: ProviderId, config: Record<string, string>): Promise<{ isValid: boolean, error?: string }> {
    return this.providerFactory.validateConfiguration(provider, config);
  }

  getAvailableProviders(): ProviderId[] {
    return this.providerFactory.getAvailableProviders();
  }

  getAvailableProvidersInfo(): Partial<Record<ProviderId, ProviderInfo>> {
    return this.providerFactory.getProvidersInfo();
  }

  getProviderInfo(providerType: ProviderId): ProviderInfo {
    const info = this.providerFactory.getProviderInfo(providerType);
    if (!info) {
      throw new Error(`Unknown provider type: ${providerType}`);
    }
    return info;
  }

  getProviderIcon(providerType: ProviderId): string | null {
    return this.providerFactory.getProviderIcon(providerType);
  }

  async getProviderModels(providerType: ProviderId): Promise<ProviderModel[]> {
    const providerInstance = await this.providerFactory.create(providerType);
    return providerInstance.getModels();
  }

  // Agent methods used by MCP Server manager to manage MCP server (and client)state
  //

  getAgentMcpServers(): Record<string, McpServerConfig> | null {
    return this._agentData?.mcpServers || null;
  }

  async updateAgentMcpServers(mcpServers: Record<string, McpServerConfig>): Promise<void> {
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

  getAllMcpServers(): Promise<Record<string, McpServerEntry>> {
    return this.mcpServers.getAllMcpServers();
  }
  getMcpServer(serverName: string): McpServerEntry | null {
    return this.mcpServers.getMcpServer(serverName);
  }
  saveMcpServer(server: McpServerEntry): Promise<void> {
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
   * Get the semantic indexer (lazy initialization)
   * Internal use only - used by searchContextItems for semantic search
   */
  private getSemanticIndexer(): SemanticIndexer {
    if (!this._semanticIndexer) {
      this._semanticIndexer = new SemanticIndexer(this.logger);
    }
    return this._semanticIndexer;
  }

  /**
   * Search context items and return RequestContextItem[] with similarity scores
   * Handles JIT indexing internally - ensures all items are indexed before searching
   */
  async searchContextItems(
    query: string,
    items: SessionContextItem[],
    options?: {
      topK?: number;  // Max embedding matches to consider (default: 20)
      topN?: number;  // Target number of results to return after grouping (default: 5)
      includeScore?: number;  // Always include items with this score or higher (default: 0.7)
    }
  ): Promise<RequestContextItem[]> {
    const indexer = this.getSemanticIndexer();
    return await indexer.searchContextItems(query, items, this, options);
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
    /**
     * Load agent configuration (lightweight).
     * Returns AgentImpl with config loaded but NOT initialized (no MCP clients, no supervisors).
     * Call agent.initialize() to fully initialize the agent.
     */
    static async loadAgent(agentPath: string, logger: Logger): Promise<AgentImpl> {
      const normalizedPath = path.normalize(agentPath);
      
      // Check if agent already exists
      if (!await FileBasedAgentStrategy.agentExists(normalizedPath)) {
        throw new Error(`Agent does not exist at path: ${normalizedPath}`);
      }

      const strategy = new FileBasedAgentStrategy(normalizedPath, logger);
      const agent = new AgentImpl(strategy, logger);
      await agent.load();
      
      return agent;
    }

    /**
     * Load agent configuration and fully initialize it.
     * Equivalent to loadAgent() followed by agent.initialize().
     */
    static async loadAndInitializeAgent(agentPath: string, logger: Logger): Promise<AgentImpl> {
      const agent = await FileBasedAgentFactory.loadAgent(agentPath, logger);
      await agent.initialize();
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