import { McpClient, McpConfigFileServerConfig } from './types';
import { createMcpClientFromConfig } from './client';
import { Tool } from "@modelcontextprotocol/sdk/types";
import { CallToolResultWithElapsedTime } from './types';
import log from 'electron-log';
import { AppState } from '../state/AppState';

function isMcpConfigFileServerConfig(obj: any): obj is McpConfigFileServerConfig {
    return obj && typeof obj === 'object' && 'type' in obj;
}

export class MCPClientManager {
    private clients: Map<string, McpClient>;

    constructor() {
        this.clients = new Map<string, McpClient>();
    }

    async loadClients(appState: AppState) {
        const mcpServers = await appState.configManager.getMcpConfig();
        for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
            try {
                if (!serverConfig || !serverConfig.config) {
                    log.error(`Invalid server configuration for ${serverName}: missing config property`);
                    continue;
                }
        
                const client = createMcpClientFromConfig(appState, serverConfig);      
                if (client) {
                    await client.connect();
                    this.clients.set(serverName, client);
                } else {
                    throw new Error(`Failed to create client for server: ${serverName}`);
                }
            } catch (error) {
                log.error(`Error initializing MCP client for ${serverName}:`, error);
            }
        }
    }

    getAllTools(): Tool[] {
        const allTools: Tool[] = [];
        for (const [clientName, client] of this.clients.entries()) {
            try {
                const clientTools = client.serverTools.map(tool => ({
                    ...tool,
                    name: `${clientName}_${tool.name}`
                }));
                allTools.push(...clientTools);
            } catch (error) {
                log.error(`Error getting tools from server ${clientName}:`, error);
            }
        }
        return allTools;
    }

    async callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResultWithElapsedTime> {
        const clientName = this.getToolServerName(name);
        const toolName = this.getToolName(name);
        const client = this.clients.get(clientName);
        if (!client) {
            throw new Error(`Client not found: ${clientName}`);
        }
        const tool = client.serverTools.find(t => t.name === toolName);
        if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
        }
        return client.callTool(tool, args);
    }

    isReady(): boolean {
        return true; // Assuming the clients map is always ready
    }

    async waitForReady(): Promise<void> {
        // No need to wait for the clients map to be ready
    }

    getToolServerName(name: string): string {
        const firstUnderscoreIndex = name.indexOf('_');
        if (firstUnderscoreIndex === -1) {
            throw new Error(`Invalid tool name format: ${name}. Expected format: clientName_toolName`);
        }
        return name.substring(0, firstUnderscoreIndex);
    }

    getToolName(name: string): string {
        const firstUnderscoreIndex = name.indexOf('_');
        if (firstUnderscoreIndex === -1) {
            throw new Error(`Invalid tool name format: ${name}. Expected format: clientName_toolName`);
        }
        return name.substring(firstUnderscoreIndex + 1);
    }

    getClient(name: string): McpClient | undefined {
        return this.clients.get(name);
    }

    getAllClients(): McpClient[] {
        return Array.from(this.clients.values());
    }

    cleanup(): void {
        for (const client of this.clients.values()) {
            client.disconnect();
        }
        this.clients.clear();
        log.info('MCPClientManager: Cleanup complete');
    }
} 