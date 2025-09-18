import { Tool } from "@modelcontextprotocol/sdk/types";

import { CallToolResultWithElapsedTime, isToolAvailable } from "../mcp/types";
import { ChatSession } from "../types/chat";
import { Agent } from "../types/agent";

export class ProviderHelper {

    static getToolServerName(name: string): string {
        const firstUnderscoreIndex = name.indexOf('_');
        if (firstUnderscoreIndex === -1) {
            throw new Error(`Invalid tool name format: ${name}. Expected format: clientName_toolName`);
        }
        return name.substring(0, firstUnderscoreIndex);
    }

    static getToolName(name: string): string {
        const firstUnderscoreIndex = name.indexOf('_');
        if (firstUnderscoreIndex === -1) {
            throw new Error(`Invalid tool name format: ${name}. Expected format: clientName_toolName`);
        }
        return name.substring(firstUnderscoreIndex + 1);
    }

    static async getAllTools(agent: Agent): Promise<Tool[]> {
        const allTools: Tool[] = [];
        const mcpClients = await agent.getAllMcpClients();
        for (const [clientName, client] of Object.entries(mcpClients)) {
            try {
                // Get server config to check availability
                const serverConfig = agent.getMcpServer(clientName)?.config;
                
                // Filter tools based on availability (enabled tool from enabled server)
                const availableTools = client.serverTools.filter(tool => {
                    if (!serverConfig) return true; // No config = all tools available
                    return isToolAvailable(serverConfig, tool.name);
                });
                
                const clientTools = availableTools.map(tool => ({
                    ...tool,
                    name: `${clientName}_${tool.name}`
                }));
                
                allTools.push(...clientTools);
            } catch (error) {
                throw new Error(`Error getting tools from server ${clientName}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return allTools;
    }

    static async callTool(agent: Agent, name: string, args?: Record<string, unknown>, session?: ChatSession): Promise<CallToolResultWithElapsedTime> {
        const clientName = ProviderHelper.getToolServerName(name);
        const toolName = ProviderHelper.getToolName(name);
        const client = await agent.getMcpClient(clientName);
        if (!client) {
            throw new Error(`Client not found: ${clientName}`);
        }
        const tool = client.serverTools.find(t => t.name === toolName);
        if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
        }
        return client.callTool(tool, args, session);
    }
}