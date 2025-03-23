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
        for (const [clientName, client] of this.clients.entries()) {
            const clientTools = client.serverTools.map(tool => ({
                ...tool,
                name: `${clientName}_${tool.name}`
            }));
            allTools.push(...clientTools);
        }
        return allTools;
    }

    async callTool(toolName: string, args?: Record<string, unknown>): Promise<CallToolResult> {
        const firstUnderscoreIndex = toolName.indexOf('_');
        if (firstUnderscoreIndex === -1) {
            throw new Error(`Invalid tool name format: ${toolName}. Expected format: clientName_toolName`);
        }
        const clientName = toolName.substring(0, firstUnderscoreIndex);
        const baseName = toolName.substring(firstUnderscoreIndex + 1);
        if (!clientName || !baseName) {
            throw new Error(`Invalid tool name format: ${toolName}. Expected format: clientName_toolName`);
        }

        const client = this.clients.get(clientName);
        if (!client) {
            throw new Error(`Client not found: ${clientName}`);
        }

        const tool = client.serverTools.find(t => t.name === baseName);
        if (!tool) {
            throw new Error(`Tool not found: "${baseName}" in client "${clientName}"`);
        }

        return client.callTool(tool, args);
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