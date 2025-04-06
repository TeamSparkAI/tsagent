import { ConfigManager } from './ConfigManager';
import { RulesManager } from './RulesManager';
import { ReferencesManager } from './ReferencesManager';
import { MCPClientManager } from '../mcp/manager';
import log from 'electron-log';

export class AppState {
  private configManager: ConfigManager;
  private _rulesManager: RulesManager;
  private _referencesManager: ReferencesManager;
  private mcpManager: MCPClientManager;

  constructor(
    configManager: ConfigManager,
    mcpManager: MCPClientManager
  ) {
    this.configManager = configManager;
    this._rulesManager = new RulesManager(configManager.getConfigDir());
    this._referencesManager = new ReferencesManager(configManager.getConfigDir());
    this.mcpManager = mcpManager;
    log.info('AppState initialized');
  }

  getConfigManager(): ConfigManager {
    return this.configManager;
  }

  get rulesManager(): RulesManager {
    return this._rulesManager;
  }

  get referencesManager(): ReferencesManager {
    return this._referencesManager;
  }

  getMCPManager(): MCPClientManager {
    return this.mcpManager;
  }

  setMCPManager(mcpManager: MCPClientManager): void {
    this.mcpManager = mcpManager;
    log.info('MCPManager updated in AppState');
  }
} 