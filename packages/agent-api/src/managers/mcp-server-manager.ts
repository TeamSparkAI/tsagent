import { McpServerManager } from './types';
import { Agent, Logger } from '../types';
import { McpConfig, McpConfigFileServerConfig } from '../mcp/types';

export class McpServerManagerImpl implements McpServerManager {
  private agent: Agent;

  constructor(agent: Agent, private logger: Logger) {
    this.agent = agent;
  }

  async getAll(): Promise<Record<string, McpConfig>> {
    const mcpServers = this.agent.getSetting('mcpServers');
    if (!mcpServers) return {};
    
    try {
      const mcpServersObj = JSON.parse(mcpServers);
      
      // Transform the configuration into the expected format
      const result: Record<string, McpConfig> = {};
      for (const [name, serverConfig] of Object.entries(mcpServersObj)) {
        result[name] = {
          name,
          config: serverConfig as McpConfigFileServerConfig
        };
      }
      return result;
    } catch (error) {
      console.error('Error loading MCP config:', error);
      return {};
    }
  }

  async save(server: McpConfig): Promise<void> {
    const mcpServers = this.agent.getSetting('mcpServers');
    let mcpServersObj: Record<string, any> = {};
    
    if (mcpServers) {
      try {
        mcpServersObj = JSON.parse(mcpServers);
      } catch {
        mcpServersObj = {};
      }
    }

    // Add or update the server in the mcpServers object
    mcpServersObj[server.name] = server.config;
    await this.agent.setSetting('mcpServers', JSON.stringify(mcpServersObj));
  }

  async delete(serverName: string): Promise<boolean> {
    const mcpServers = this.agent.getSetting('mcpServers');
    if (!mcpServers) return false;
    
    try {
      const mcpServersObj = JSON.parse(mcpServers);
      if (mcpServersObj[serverName]) {
        delete mcpServersObj[serverName];
        await this.agent.setSetting('mcpServers', JSON.stringify(mcpServersObj));
        return true;
      }
    } catch {
      // Invalid JSON, ignore
    }
    
    return false;
  }

  get(serverName: string): McpConfig | null {
    const mcpServers = this.agent.getSetting('mcpServers');
    if (!mcpServers) return null;
    
    try {
      const mcpServersObj = JSON.parse(mcpServers);
      if (mcpServersObj[serverName]) {
        return {
          name: serverName,
          config: mcpServersObj[serverName] as McpConfigFileServerConfig
        };
      }
    } catch {
      // Invalid JSON, ignore
    }
    
    return null;
  }
}

