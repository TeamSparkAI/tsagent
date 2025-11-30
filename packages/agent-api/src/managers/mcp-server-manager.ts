import { McpServerManager } from './types.js';
import { Logger } from '../types/common.js';
import { MCPClientManager, McpServerEntry, McpServerConfig } from '../mcp/types.js';
import { AgentImpl } from '../core/agent-api.js';

export class McpServerManagerImpl implements McpServerManager {
  private agent: AgentImpl;

  constructor(agent: AgentImpl, private readonly mcpManager: MCPClientManager, private logger: Logger) {
    this.agent = agent;
  }

  getMcpServer(serverName: string): McpServerEntry | null {
    const mcpServers = this.agent.getAgentMcpServers();
    if (!mcpServers || !mcpServers[serverName]) return null;
    
    return {
      name: serverName,
      config: mcpServers[serverName]
    };
  }

  async getAllMcpServers(): Promise<Record<string, McpServerEntry>> {
    const mcpServers = this.agent.getAgentMcpServers();
    if (!mcpServers) return {};
    
    // Transform the configuration into the expected format
    // Internal configs should always have a type field (strictly typed via discriminated union)
    const result: Record<string, McpServerEntry> = {};
    for (const [name, serverConfig] of Object.entries(mcpServers)) {
      result[name] = {
        name,
        config: serverConfig
      };
    }
    return result;
  }

  async saveMcpServer(server: McpServerEntry): Promise<void> {
    const mcpServers = this.agent.getAgentMcpServers() || {};
    const oldConfig = mcpServers[server.name];

    // Save the config first
    mcpServers[server.name] = server.config;
    await this.agent.updateAgentMcpServers(mcpServers);

    // Check if connection settings changed (settings used to create/connect the client)
    // If they changed, the existing client is invalid and must be reloaded
    const connectionSettingsChanged = this.haveConnectionSettingsChanged(oldConfig, server.config);
    
    if (connectionSettingsChanged) {
      // Connection settings changed - unload old client and reload with new settings
      await this.mcpManager.unloadMcpClient(server.name);
      // Reload immediately so client is available
      await this.mcpManager.getMcpClient(server.name);
    }
    // If only tool-level settings changed (embeddings, permissions, include modes),
    // client stays loaded - no reload needed
  }

  /**
   * Check if connection settings changed between old and new config.
   * Connection settings are the properties used to create and connect the MCP client.
   */
  private haveConnectionSettingsChanged(
    oldConfig: McpServerConfig | undefined,
    newConfig: McpServerConfig
  ): boolean {
    if (!oldConfig) {
      // New server - no existing client to reload
      return false;
    }

    // Check if server type changed
    if (oldConfig.type !== newConfig.type) {
      return true;
    }

    // Check stdio-specific connection settings
    if (oldConfig.type === 'stdio' && newConfig.type === 'stdio') {
      if (oldConfig.command !== newConfig.command) return true;
      if (JSON.stringify(oldConfig.args || []) !== JSON.stringify(newConfig.args || [])) return true;
      if (JSON.stringify(oldConfig.env || {}) !== JSON.stringify(newConfig.env || {})) return true;
      if (oldConfig.cwd !== newConfig.cwd) return true;
    }

    // Check sse-specific connection settings
    if (oldConfig.type === 'sse' && newConfig.type === 'sse') {
      if (oldConfig.url !== newConfig.url) return true;
      if (JSON.stringify(oldConfig.headers || {}) !== JSON.stringify(newConfig.headers || {})) return true;
    }

    // Check streamable-http-specific connection settings
    if (oldConfig.type === 'streamable-http' && newConfig.type === 'streamable-http') {
      if (oldConfig.url !== newConfig.url) return true;
      if (JSON.stringify(oldConfig.headers || {}) !== JSON.stringify(newConfig.headers || {})) return true;
    }

    // Check internal-specific connection settings
    if (oldConfig.type === 'internal' && newConfig.type === 'internal') {
      if (oldConfig.tool !== newConfig.tool) return true;
    }

    // Connection settings unchanged
    return false;
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

