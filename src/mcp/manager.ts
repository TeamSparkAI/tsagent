import { MCPClient } from './types.js';
import { MCPClientImpl } from './client.js';
import { MCPConfigServer } from '../commands/tools.js';
import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types";

export class MCPClientManager {
    private clients = new Map<string, MCPClientImpl>();

    async loadClients(config: Record<string, MCPConfigServer>) {
        for (const [name, serverConfig] of Object.entries(config)) {
            const client = new MCPClientImpl();
            await client.connectToServer(
                serverConfig.command,
                serverConfig.args,
                serverConfig.env
            );
            this.clients.set(name, client);
        }
    }

    getAllTools(): Tool[] {
        const allTools: Tool[] = [];
        for (const client of this.clients.values()) {
            allTools.push(...client.serverTools);
        }
        return allTools;
    }

    async callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult> {
        for (const client of this.clients.values()) {
            const tool = client.serverTools.find(t => t.name === name);
            if (tool) {
                return client.callTool(tool, args);
            }
        }
        throw new Error(`Tool ${name} not found in any MCP client`);
    }

    getClient(name: string): MCPClient | undefined {
        return this.clients.get(name);
    }

    getAllClients(): MCPClient[] {
        return Array.from(this.clients.values());
    }

    async cleanup() {
        for (const client of this.clients.values()) {
            await client.cleanup();
        }
        this.clients.clear();
    }
} 