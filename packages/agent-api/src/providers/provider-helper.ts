import { Tool } from "../mcp/types.js";

import { CallToolResultWithElapsedTime, isToolPermissionRequired, getToolEffectiveIncludeMode, McpServerConfig } from "../mcp/types.js";
import { ChatSession } from "../types/chat.js";
import { Agent } from "../types/agent.js";

export class ProviderHelper {

    /**
     * Check if a tool should be available based on session autonomous state and permissions.
     * 
     * For autonomous sessions, filters out tools that require permission (based on toolPermission setting).
     * For non-autonomous sessions, all tools are available (approval will be requested as needed).
     * 
     * This logic is shared between:
     * - Semantic search filtering (to only consider available tools)
     * - Final tool inclusion filtering (to only include available tools)
     */
    static isToolAvailableForSession(
        session: ChatSession,
        serverConfig: McpServerConfig,
        toolName: string
    ): boolean {
        const sessionState = session.getState();
        
        // For non-autonomous sessions, all tools are available (approval requested as needed)
        if (!sessionState.autonomous) {
            return true;
        }
        
        // For autonomous sessions, filter based on toolPermission setting
        if (sessionState.toolPermission === 'always') {
            // Always require permission = no tools qualify for autonomous use
            return false;
        } else if (sessionState.toolPermission === 'never') {
            // Never require permission = all tools qualify
            return true;
        } else { // 'tool'
            // Defer to individual tool permission settings
            // Only include tools that don't require permission
            return !isToolPermissionRequired(serverConfig, toolName);
        }
    }

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

        // Get tools explicitly included in the session context
        // These include tools with "always" mode (added at session init) and manually added tools
        const sessionTools = session.getIncludedTools();
        const sessionToolKeys = new Set(sessionTools.map(tool => `${tool.serverName}:${tool.toolName}`));

        // Get tools semantically selected for the current prompt
        // These persist across multiple turns of the same prompt (e.g., tool approval flow)
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

                // Filter tools based on session context and request context
                //
                // Only include tools that are in the session context or request context:
                //   - Session context: Tools with "always" mode (added at init) or manually added
                //   - Request context: Tools semantically selected for the current prompt
                const contextTools = client.serverTools.filter(tool => {
                    const toolKey = `${clientName}:${tool.name}`;
                    return sessionToolKeys.has(toolKey) || requestToolKeys.has(toolKey);
                });

                // Filter based on session autonomous state and permissions
                // Uses shared logic to ensure consistency with semantic search filtering
                let filteredTools: typeof contextTools;
                if (!serverConfig) {
                    // If no server config, all context tools are available
                    filteredTools = contextTools;
                } else {
                    filteredTools = contextTools.filter(tool => 
                        ProviderHelper.isToolAvailableForSession(session, serverConfig, tool.name)
                    );
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