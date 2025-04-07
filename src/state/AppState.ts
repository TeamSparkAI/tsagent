import { ConfigManager } from './ConfigManager';
import { RulesManager } from './RulesManager';
import { ReferencesManager } from './ReferencesManager';
import { MCPClientManager } from '../mcp/manager';
import log from 'electron-log';

export class AppState {
  private _configManager: ConfigManager;
  private _rulesManager: RulesManager;
  private _referencesManager: ReferencesManager;
  private _mcpManager: MCPClientManager;

  constructor(configManager: ConfigManager) {
    this._configManager = configManager;
    this._rulesManager = new RulesManager(configManager.getConfigDir());
    this._referencesManager = new ReferencesManager(configManager.getConfigDir());
    this._mcpManager = new MCPClientManager();
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

  async initialize() {
    await this.mcpManager.loadClients(this);
  }
} 