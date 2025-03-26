import fs from 'fs/promises';
import * as path from 'path';
import { MCPClientImpl } from '../mcp/client';
import { Tool } from "@modelcontextprotocol/sdk/types";
import log from 'electron-log';
import { getDataDirectory } from '../config';

export interface McpConfigFileServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface MCPConfigFile {
  mcpServers: {
    [key: string]: McpConfigFileServerConfig;
  };
}

export async function toolsCommand() {
  try {
    // Read and parse the config file
    const configPath = path.join(getDataDirectory(), 'config', 'mcp_config.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: MCPConfigFile = JSON.parse(configContent);

    log.info('Checking available tools on MCP servers...\n');

    // Connect to each server and list tools
    for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
      log.info(`Server: ${serverId}`);
      log.info('------------------------');

      const client = new MCPClientImpl();
      try {
        await client.connectToServer(
          serverConfig.command, 
          serverConfig.args, 
          serverConfig.env
        );
        
        // Tools are now available in client.serverTools
        if (client.serverTools.length === 0) {
          log.info('No tools available');
        } else {
          client.serverTools.forEach((tool: Tool) => {
            log.info(`- ${tool.name}: ${tool.description || 'No description'}`);
          });
        }
      } catch (error) {
        log.error(`Error connecting to ${serverId}:`, error);
      } finally {
        await client.cleanup();
      }
      log.info('\n');
    }
  } catch (error) {
    log.error('Failed to read MCP configuration:', error);
    process.exit(1);
  }
}
