import { Tool } from "@modelcontextprotocol/sdk/types.js";

import { CallToolResultWithElapsedTime, isToolInContext, isToolPermissionRequired, getToolEffectiveIncludeMode } from "../mcp/types.js";
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
        for (const [clientName, client] of Object.entries(mcpClients)) {
            try {
                // Get server config to check availability
                const serverConfig = agent.getMcpServer(clientName)?.config;
                
                // Filter tools based on availability (enabled tool from enabled server)
                const availableTools = client.serverTools.filter(tool => {
                    if (!serverConfig) return true; // No config = all tools available
                    return isToolInContext(serverConfig, tool.name);
                });
                
                // Filter tools based on session context
                // For "always" include mode, include tools automatically
                // For other modes, only include tools that are explicitly in the session
                const contextTools = availableTools.filter(tool => {
                    if (!serverConfig) return true; // No config = all tools available
                    
                    const effectiveMode = getToolEffectiveIncludeMode(serverConfig, tool.name);
                    if (effectiveMode === 'always') {
                        return true; // Always include these tools
                    }
                    
                    // For manual/agent modes, check if tool is explicitly in session
                    const sessionTools = session.getIncludedTools();
                    return sessionTools.some(sessionTool => 
                        sessionTool.serverName === clientName && sessionTool.toolName === tool.name
                    );
                });
                
                // Additional filtering for autonomous mode based on permissions
                let filteredTools = contextTools;
                if (agent.mode === 'autonomous') {
                    const sessionState = session.getState();
                    if (sessionState.toolPermission === 'always') {
                        // Always require permission = no tools qualify for autonomous use
                        filteredTools = [];
                    } else if (sessionState.toolPermission === 'never') {
                        // Never require permission = all context tools qualify
                        filteredTools = contextTools;
                    } else { // 'tool'
                        // Defer to individual tool permission settings
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