import { Tool } from "@modelcontextprotocol/sdk/types.js";

import { CallToolResultWithElapsedTime, isToolPermissionRequired, getToolEffectiveIncludeMode } from "../mcp/types.js";
import { ChatSession } from "../types/chat.js";
import { Agent } from "../types/agent.js";

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

    static async getIncludedTools(agent: Agent, session: ChatSession): Promise<Tool[]> {
        const allTools: Tool[] = [];
        const mcpClients = await agent.getAllMcpClients();

        const sessionTools = session.getIncludedTools();
        const sessionToolKeys = new Set(sessionTools.map(tool => `${tool.serverName}:${tool.toolName}`));

        const requestContext = session.getLastRequestContext?.();
        const requestToolKeys = new Set<string>();
        if (requestContext) {
            for (const item of requestContext.items) {
                if (item.type === 'tool') {
                    requestToolKeys.add(`${item.serverName}:${item.name}`);
                }
            }
        }

        for (const [clientName, client] of Object.entries(mcpClients)) {
            try {
                const serverConfig = agent.getMcpServer(clientName)?.config;

                const contextTools = client.serverTools.filter(tool => {
                    if (!serverConfig) {
                        return true;
                    }

                    const effectiveMode = getToolEffectiveIncludeMode(serverConfig, tool.name);
                    if (effectiveMode === 'always') {
                        return true;
                    }

                    const toolKey = `${clientName}:${tool.name}`;
                    return sessionToolKeys.has(toolKey) || requestToolKeys.has(toolKey);
                });

                // Additional filtering for autonomous and tools modes based on permissions
                // Both modes should only have access to tools that don't require permission
                let filteredTools = contextTools;
                if (agent.mode === 'autonomous' || agent.mode === 'tools') {
                    const sessionState = session.getState();
                    if (sessionState.toolPermission === 'always') {
                        // Always require permission = no tools qualify for autonomous/tools use
                        filteredTools = [];
                    } else if (sessionState.toolPermission === 'never') {
                        // Never require permission = all context tools qualify
                        filteredTools = contextTools;
                    } else { // 'tool'
                        // Defer to individual tool permission settings
                        // Only include tools that don't require permission
                        filteredTools = contextTools.filter(tool => {
                            if (!serverConfig) return true; // No config = tool available
                            return !isToolPermissionRequired(serverConfig, tool.name);
                        });
                    }
                }
                
                const clientTools = filteredTools.map(tool => ({
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