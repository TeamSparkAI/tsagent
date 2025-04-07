import { ConfigManager } from './ConfigManager';
import { RulesManager } from './RulesManager';
import { ReferencesManager } from './ReferencesManager';
import { MCPClientManager } from '../mcp/manager';
import log from 'electron-log';
import { ChatSessionManager } from './ChatSessionManager';

export class AppState {
  private _configManager: ConfigManager;
  private _rulesManager: RulesManager;
  private _referencesManager: ReferencesManager;
  private _mcpManager: MCPClientManager;
  private _chatSessionManager: ChatSessionManager;

  constructor(configManager: ConfigManager) {
    this._configManager = configManager;
    this._rulesManager = new RulesManager(configManager.getConfigDir());
    this._referencesManager = new ReferencesManager(configManager.getConfigDir());
    this._mcpManager = new MCPClientManager();
    this._chatSessionManager = new ChatSessionManager(this);
    log.info('AppState initialized');
  }

  get configManager(): ConfigManager {
    return this._configManager;
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

  async initialize() {
    await this.mcpManager.loadClients(this);
  }
} 