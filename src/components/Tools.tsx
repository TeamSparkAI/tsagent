import React, { useState, useEffect } from 'react';
import { MCPClient } from '../mcp/types.js';
import { ServerConfig, ToolParameter } from '../mcp/types.js';
import { Tool } from "@modelcontextprotocol/sdk/types";
import { TabProps } from '../types/TabProps';

export const Tools: React.FC<TabProps> = ({ id, activeTabId, name, type, style }) => {
  const [mcpServers, setMcpServers] = useState<Map<string, MCPClient>>(new Map());
  const [configs, setConfigs] = useState<ServerConfig[]>([]);

  useEffect(() => {
    // Get the MCP servers and configs from the main process
    const loadServers = async () => {
      const serverConfigs = await window.api.getServerConfigs();
      setConfigs(serverConfigs);
      
      const servers = new Map<string, MCPClient>();
      for (const config of serverConfigs) {
        const client = await window.api.getMCPClient(config.name);
        servers.set(config.name, client);
      }
      setMcpServers(servers);
    };

    loadServers();
  }, []);

  if (id !== activeTabId) return null;

  return (
    <div className="tools-container">
      <h2>MCP Server Tools</h2>
      {configs.map(config => {
        const client = mcpServers.get(config.name);
        if (!client) return null;

        return (
          <div key={config.name} className="server-section">
            <h3>
              {config.name} <span className="version">
                v{client.serverVersion?.version || 'unknown'}
              </span>
            </h3>
            <div className="tools-list">
              {client.serverTools.map((tool: Tool) => (
                <div key={tool.name} className="tool-item">
                  <h4>{tool.name}</h4>
                  <p>{tool.description || 'No description'}</p>
                  {tool.inputSchema?.properties && Object.keys(tool.inputSchema.properties).length > 0 && (
                    <div className="parameters">
                      <h5>Parameters:</h5>
                      <table>
                        <tbody>
                          {Object.entries(tool.inputSchema.properties).map(([name, param]: [string, any]) => (
                            <tr key={name}>
                              <td>{name}</td>
                              <td><code>{param.type || 'unknown'}</code></td>
                              {param.description && <td>{param.description}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}; 