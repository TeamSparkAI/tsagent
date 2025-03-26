import { MCPClient, McpConfigFileServerConfig } from './types';
import { MCPClientImpl } from './client';
import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types";
import log from 'electron-log';

export class MCPClientManager {
    private clients = new Map<string, MCPClientImpl>();
    private ready = false;

    async loadClients(config: Record<string, McpConfigFileServerConfig>) {
        log.info('MCPClientManager: Loading clients from config:', config);
        for (const [name, serverConfig] of Object.entries(config)) {
            log.info('MCPClientManager: Creating client for:', name);
            const client = new MCPClientImpl();
            try {
                await client.connectToServer(
                    serverConfig.command,
                    serverConfig.args,
                    serverConfig.env
                );
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
        for (const client of this.clients.values()) {
            allTools.push(...client.serverTools);
        }
        log.info('MCPClientManager: Getting all tools, count:', allTools.length);
        return allTools;
    }

    async callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult> {
        if (!this.ready) {
            throw new Error('MCPClientManager not ready');
        }
        log.info('MCPClientManager: Calling tool:', name);
        for (const client of this.clients.values()) {
            const tool = client.serverTools.find(t => t.name === name);
            if (tool) {
                log.info('MCPClientManager: Found tool in client');
                return client.callTool(tool, args);
            }
        }
        log.error('MCPClientManager: Tool not found:', name);
        throw new Error(`Tool ${name} not found in any MCP client`);
    }

    getClient(name: string): MCPClient | undefined {
        if (!this.ready) {
            return undefined;
        }
        const client = this.clients.get(name);
        log.info('MCPClientManager: Getting client:', name, client ? 'found' : 'not found');
        return client;
    }

    getAllClients(): MCPClient[] {
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