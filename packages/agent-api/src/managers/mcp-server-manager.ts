import { McpServerManager } from './types.js';
import { Logger } from '../types/common.js';
import { MCPClientManager, McpConfig, McpConfigFileServerConfig } from '../mcp/types.js';
import { AgentImpl } from '../core/agent-api.js';

export class McpServerManagerImpl implements McpServerManager {
  private agent: AgentImpl;

  constructor(agent: AgentImpl, private readonly mcpManager: MCPClientManager, private logger: Logger) {
    this.agent = agent;
  }

  getMcpServer(serverName: string): McpConfig | null {
    const mcpServers = this.agent.getAgentMcpServers();
    if (!mcpServers || !mcpServers[serverName]) return null;
    
    return {
      name: serverName,
      config: mcpServers[serverName] as McpConfigFileServerConfig
    };
  }

  async getAllMcpServers(): Promise<Record<string, McpConfig>> {
    const mcpServers = this.agent.getAgentMcpServers();
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

  async saveMcpServer(server: McpConfig): Promise<void> {
    const mcpServers = this.agent.getAgentMcpServers() || {};

    // Add or update the server in the mcpServers object
    mcpServers[server.name] = server.config;
    await this.agent.updateAgentMcpServers(mcpServers);

    // Update the client with the new server config
    await this.mcpManager.unloadMcpClient(server.name);
  }

  async deleteMcpServer(serverName: string): Promise<boolean> {
    const mcpServers = this.agent.getAgentMcpServers();
    if (!mcpServers || !mcpServers[serverName]) return false;
    
    // Remove the server from the mcpServers object
    delete mcpServers[serverName];
    await this.agent.updateAgentMcpServers(mcpServers);

    // Delete the client (if any)
    await this.mcpManager.unloadMcpClient(serverName);
    
    return true;
  }
}

