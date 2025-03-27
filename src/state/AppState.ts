import { ConfigManager } from './ConfigManager';
import { RulesManager } from './RulesManager';
import { ReferencesManager } from './ReferencesManager';
import { MCPClientManager } from '../mcp/manager';
import log from 'electron-log';

export class AppState {
  private configManager: ConfigManager;
  private rulesManager: RulesManager;
  private referencesManager: ReferencesManager;
  private mcpManager: MCPClientManager;

  constructor(
    configManager: ConfigManager,
    rulesManager: RulesManager,
    referencesManager: ReferencesManager,
    mcpManager: MCPClientManager
  ) {
    this.configManager = configManager;
    this.rulesManager = rulesManager;
    this.referencesManager = referencesManager;
    this.mcpManager = mcpManager;
    log.info('AppState initialized');
  }

  getConfigManager(): ConfigManager {
    return this.configManager;
  }

  getRulesManager(): RulesManager {
    return this.rulesManager;
  }

  getReferencesManager(): ReferencesManager {
    return this.referencesManager;
  }

  getMCPManager(): MCPClientManager {
    return this.mcpManager;
  }
} 