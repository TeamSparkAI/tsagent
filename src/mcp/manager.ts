import { McpClient, McpConfigFileServerConfig } from './types';
import { McpClientStdio  } from './client';
import { Tool } from "@modelcontextprotocol/sdk/types";
import { CallToolResultWithElapsedTime } from './types';
import log from 'electron-log';

export class MCPClientManager {
    private clients = new Map<string, McpClient>();
    private ready = false;

    async loadClients(config: Record<string, McpConfigFileServerConfig>) {
        log.info('MCPClientManager: Loading clients from config:', config);
        for (const [name, serverConfig] of Object.entries(config)) {
            log.info('MCPClientManager: Creating client for:', name);
            const client = new McpClientStdio({
                command: serverConfig.command,
                args: serverConfig.args,
                env: serverConfig.env
            });
            try {
                await client.connect();
                this.clients.set(name, client);
                log.info('MCPClientManager: Successfully connected client:', name);
            } catch (error) {
                log.error('MCPClientManager: Failed to connect client:', name, error);
            }
        }
        this.ready = true;
        log.info('MCPClientManager: Loaded clients:', Array.from(this.clients.keys()));
    }

    isReady(): boolean {
        return this.ready;
    }

    getAllTools(): Tool[] {
        if (!this.ready) {
            throw new Error('MCPClientManager not ready');
        }
        const allTools: Tool[] = [];
        for (const [clientName, client] of this.clients.entries()) {
            const clientTools = client.serverTools.map(tool => ({
                ...tool,
                name: `${clientName}_${tool.name}`
            }));
            allTools.push(...clientTools);
        }
        log.info('MCPClientManager: Getting all tools, count:', allTools.length);
        return allTools;
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

    async callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResultWithElapsedTime> {
        if (!this.ready) {
            throw new Error('MCPClientManager not ready');
        }
        log.info('MCPClientManager: Calling tool:', name);

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

        log.info('MCPClientManager: Found tool in client');
        return client.callTool(tool, args);
    }

    getClient(name: string): McpClient | undefined {
        if (!this.ready) {
            return undefined;
        }
        const client = this.clients.get(name);
        log.info('MCPClientManager: Getting client:', name, client ? 'found' : 'not found');
        return client;
    }

    getAllClients(): McpClient[] {
        if (!this.ready) {
            return [];
        }
        const clients = Array.from(this.clients.values());
        log.info('MCPClientManager: Getting all clients, count:', clients.length);
        return clients;
    }

    async cleanup() {
        log.info('MCPClientManager: Cleaning up clients');
        for (const client of this.clients.values()) {
            await client.cleanup();
        }
        this.clients.clear();
        this.ready = false;
        log.info('MCPClientManager: Cleanup complete');
    }
} 