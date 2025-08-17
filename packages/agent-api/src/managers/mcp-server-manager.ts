import { McpServerManager } from './types';
import { Agent } from '../types/agent';
import { Logger } from '../types/common';
import { McpConfig, McpConfigFileServerConfig } from '../mcp/types';
import { FileBasedAgent } from '../core/agent-api';

export class McpServerManagerImpl implements McpServerManager {
  private agent: FileBasedAgent;

  constructor(agent: FileBasedAgent, private logger: Logger) {
    this.agent = agent;
  }

  async getAll(): Promise<Record<string, McpConfig>> {
    const mcpServers = this.agent.getWorkspaceMcpServers();
    if (!mcpServers) return {};
    
    // Transform the configuration into the expected format
    const result: Record<string, McpConfig> = {};
    for (const [name, serverConfig] of Object.entries(mcpServers)) {
      result[name] = {
        name,
        config: serverConfig as McpConfigFileServerConfig
      };
    }
    return result;
  }

  async save(server: McpConfig): Promise<void> {
    const mcpServers = this.agent.getWorkspaceMcpServers() || {};

    // Add or update the server in the mcpServers object
    mcpServers[server.name] = server.config;
    await this.agent.updateWorkspaceMcpServers(mcpServers);
  }

  async delete(serverName: string): Promise<boolean> {
    const mcpServers = this.agent.getWorkspaceMcpServers();
    if (!mcpServers || !mcpServers[serverName]) return false;
    
    delete mcpServers[serverName];
    await this.agent.updateWorkspaceMcpServers(mcpServers);
    return true;
  }

  get(serverName: string): McpConfig | null {
    const mcpServers = this.agent.getWorkspaceMcpServers();
    if (!mcpServers || !mcpServers[serverName]) return null;
    
    return {
      name: serverName,
      config: mcpServers[serverName] as McpConfigFileServerConfig
    };
  }
}

