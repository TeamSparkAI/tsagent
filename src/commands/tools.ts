import fs from 'fs/promises';
import path from 'path';
import { MCPClient } from '../lib/mcp.js';

interface MCPConfigServer {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface MCPConfig {
  mcpServers: {
    [key: string]: MCPConfigServer;
  };
}

export async function toolsCommand() {
  try {
    // Read and parse the config file
    const configPath = path.join(process.cwd(), 'config', 'mcp_config.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: MCPConfig = JSON.parse(configContent);

    console.log('Checking available tools on MCP servers...\n');

    // Connect to each server and list tools
    for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
      console.log(`Server: ${serverId}`);
      console.log('------------------------');

      const client = new MCPClient();
      try {
        await client.connectToServer(
          serverConfig.command, 
          serverConfig.args, 
          serverConfig.env
        );
        
        // Tools are now available in client.serverTools
        if (client.serverTools.length === 0) {
          console.log('No tools available');
        } else {
          client.serverTools.forEach(tool => {
            console.log(`- ${tool.name}: ${tool.description}`);
          });
        }
      } catch (error) {
        console.error(`Error connecting to ${serverId}:`, error);
      } finally {
        await client.cleanup();
      }
      console.log('\n');
    }
  } catch (error) {
    console.error('Failed to read MCP configuration:', error);
    process.exit(1);
  }
} 