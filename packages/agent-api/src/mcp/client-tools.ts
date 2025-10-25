import { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpClient, CallToolResultWithElapsedTime } from "./types.js";
import { ChatSession } from "../types/chat.js";
import { Agent } from "../types/agent.js";

export class McpClientInternalTools implements McpClient {
    serverVersion = { name: "internal-tools", version: "1.0.0" };
    serverTools: Tool[] = [];
    private currentSession: ChatSession | null = null;
    private agent: Agent;

    constructor(agent: Agent) {
        this.agent = agent;
        this.serverTools = this.createToolsList();
    }

    private createToolsList(): Tool[] {
        return [
            // Tool listing and inspection
            {
                name: "listTools",
                description: "Get all available tools",
                inputSchema: { type: "object", properties: {}, required: [] }
            },
            {
                name: "getTool", 
                description: "Get a specific tool by server name and tool name",
                inputSchema: {
                    type: "object",
                    properties: {
                        serverName: { type: "string", description: "Name of the server containing the tool" },
                        toolName: { type: "string", description: "Name of the tool to retrieve" }
                    },
                    required: ["serverName", "toolName"]
                }
            },
            {
                name: "listContextTools",
                description: "List tools currently in context",
                inputSchema: { type: "object", properties: {}, required: [] }
            },

            // Tool-level context management
            {
                name: "includeTool",
                description: "Include a tool in the current session context", 
                inputSchema: {
                    type: "object",
                    properties: {
                        serverName: { type: "string", description: "Name of the server containing the tool" },
                        toolName: { type: "string", description: "Name of the tool to include" }
                    },
                    required: ["serverName", "toolName"]
                }
            },
            {
                name: "excludeTool",
                description: "Exclude a tool from the current session context",
                inputSchema: {
                    type: "object", 
                    properties: {
                        serverName: { type: "string", description: "Name of the server containing the tool" },
                        toolName: { type: "string", description: "Name of the tool to exclude" }
                    },
                    required: ["serverName", "toolName"]
                }
            },
            {
                name: "setToolIncludeMode",
                description: "Set the include mode for a tool",
                inputSchema: {
                    type: "object",
                    properties: {
                        serverName: { type: "string", description: "Name of the server containing the tool" },
                        toolName: { type: "string", description: "Name of the tool" },
                        mode: { type: "string", enum: ["always", "manual", "agent"], description: "Include mode" }
                    },
                    required: ["serverName", "toolName", "mode"]
                }
            },

            // Server-level context management
            {
                name: "listToolServers",
                description: "List all available tool servers",
                inputSchema: { type: "object", properties: {}, required: [] }
            },
            {
                name: "getToolServer",
                description: "Get information about a specific tool server",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: "Name of the server" }
                    },
                    required: ["name"]
                }
            },
            {
                name: "setServerIncludeMode",
                description: "Set the include mode for a tool server",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: "Name of the server" },
                        mode: { type: "string", enum: ["always", "manual", "agent"], description: "Include mode" }
                    },
                    required: ["name", "mode"]
                }
            },
            {
                name: "includeToolServer",
                description: "Include all tools from a server in the current session context",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: "Name of the server to include" }
                    },
                    required: ["name"]
                }
            },
            {
                name: "excludeToolServer",
                description: "Exclude all tools from a server from the current session context",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: "Name of the server to exclude" }
                    },
                    required: ["name"]
                }
            }
        ];
    }

    async connect(): Promise<boolean> {
        return true;
    }

    async disconnect(): Promise<void> {
        this.currentSession = null;
    }

    async callTool(tool: Tool, args?: Record<string, unknown>, session?: ChatSession): Promise<CallToolResultWithElapsedTime> {
        const startTime = Date.now();
        
        if (session) {
            this.currentSession = session;
        }

        try {
            let result: any;
            
            switch (tool.name) {
            case "listTools":
                result = await this.listTools();
                break;
            case "getTool":
                result = await this.getTool(args?.serverName as string, args?.toolName as string);
                break;
            case "listContextTools": {
                if (!session) {
                    throw new Error(`Chat session not found`);
                }
                
                const includedTools = session.getIncludedTools();
                result = { tools: includedTools };
                break;
            }
            case "includeTool": {
                if (!session) {
                    throw new Error(`Chat session not found`);
                }
                
                const success = await session.addTool(args?.serverName as string, args?.toolName as string);
                result = {
                    success,
                    message: success 
                        ? `Tool '${args?.serverName}:${args?.toolName}' included in context`
                        : `Tool '${args?.serverName}:${args?.toolName}' was already in context`
                };
                break;
            }
            case "excludeTool": {
                if (!session) {
                    throw new Error(`Chat session not found`);
                }
                
                const success = session.removeTool(args?.serverName as string, args?.toolName as string);
                result = {
                    success,
                    message: success 
                        ? `Tool '${args?.serverName}:${args?.toolName}' excluded from context`
                        : `Tool '${args?.serverName}:${args?.toolName}' was not in context`
                };
                break;
            }
            case "setToolIncludeMode":
                result = await this.setToolIncludeMode(args?.serverName as string, args?.toolName as string, args?.mode as string);
                break;
            case "listToolServers":
                result = await this.listToolServers();
                break;
            case "getToolServer":
                result = await this.getToolServer(args?.name as string);
                break;
            case "setServerIncludeMode":
                result = await this.setServerIncludeMode(args?.name as string, args?.mode as string);
                break;
            case "includeToolServer": {
                if (!session) {
                    throw new Error(`Chat session not found`);
                }
                
                const mcpClients = await this.agent.getAllMcpClients();
                const client = mcpClients[args?.name as string];
                
                if (!client) {
                    throw new Error(`Server '${args?.name}' not found`);
                }
                
                // Include all tools from the server
                let includedCount = 0;
                for (const tool of client.serverTools) {
                    const success = await session.addTool(args?.name as string, tool.name);
                    if (success) includedCount++;
                }
                
                result = {
                    success: true,
                    message: `Server '${args?.name}' included with ${includedCount} tools added to context`
                };
                break;
            }
            case "excludeToolServer": {
                if (!session) {
                    throw new Error(`Chat session not found`);
                }
                
                const includedTools = session.getIncludedTools();
                const serverTools = includedTools.filter(tool => tool.serverName === args?.name);
                
                let excludedCount = 0;
                for (const tool of serverTools) {
                    const success = session.removeTool(tool.serverName, tool.toolName);
                    if (success) excludedCount++;
                }
                
                result = {
                    success: true,
                    message: `Server '${args?.name}' excluded with ${excludedCount} tools removed from context`
                };
                break;
            }
            default:
                result = { error: `Unknown tool: ${tool.name}` };
            }

            const elapsedTime = Date.now() - startTime;
            
            return {
                content: [{ type: "text", text: JSON.stringify(result) }],
                elapsedTimeMs: elapsedTime
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
                elapsedTimeMs: Date.now() - startTime
            };
        }
    }

    async cleanup(): Promise<void> {
        this.currentSession = null;
    }

    getErrorLog(): string[] {
        return [];
    }

    isConnected(): boolean {
        return true;
    }

    async ping(): Promise<{ elapsedTimeMs: number }> {
        return { elapsedTimeMs: 0 };
    }

    // Tool implementation methods
    private async listTools(): Promise<any> {
        try {
            const mcpClients = await this.agent.getAllMcpClients();
            const allTools: Array<{serverName: string, toolName: string, description: string}> = [];
            
            for (const [serverName, client] of Object.entries(mcpClients)) {
                for (const tool of client.serverTools) {
                    allTools.push({
                        serverName,
                        toolName: tool.name,
                        description: tool.description || ''
                    });
                }
            }
            
            return { tools: allTools };
        } catch (error) {
            throw new Error(`Error listing tools: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getTool(serverName: string, toolName: string): Promise<any> {
        try {
            const mcpClients = await this.agent.getAllMcpClients();
            const client = mcpClients[serverName];
            
            if (!client) {
                throw new Error(`Server '${serverName}' not found`);
            }
            
            const tool = client.serverTools.find((t: any) => t.name === toolName);
            if (!tool) {
                throw new Error(`Tool '${toolName}' not found in server '${serverName}'`);
            }
            
            return {
                serverName,
                toolName: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema
            };
        } catch (error) {
            throw new Error(`Error getting tool: ${error instanceof Error ? error.message : String(error)}`);
        }
    }


    private async setToolIncludeMode(serverName: string, toolName: string, mode: string): Promise<any> {
        if (!['always', 'manual', 'agent'].includes(mode)) {
            throw new Error(`Invalid include mode: ${mode}. Must be 'always', 'manual', or 'agent'`);
        }
        
        try {
            const mcpServers = await this.agent.getAllMcpServers();
            const server = mcpServers[serverName];
            
            if (!server) {
                throw new Error(`Server '${serverName}' not found`);
            }
            
            // Update the server config with the new tool include mode
            const updatedConfig = {
                ...server.config,
                toolInclude: {
                    serverDefault: server.config.toolInclude?.serverDefault || 'manual',
                    tools: {
                        ...server.config.toolInclude?.tools,
                        [toolName]: mode as 'always' | 'manual' | 'agent'
                    }
                }
            };
            
            // Save the updated configuration
            this.agent.saveMcpServer({ ...server, config: updatedConfig });
            
            return {
                success: true,
                message: `Tool '${serverName}:${toolName}' include mode set to '${mode}'`
            };
        } catch (error) {
            throw new Error(`Error setting tool include mode: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async listToolServers(): Promise<any> {
        try {
            const mcpClients = await this.agent.getAllMcpClients();
            const servers = Object.entries(mcpClients).map(([name, client]) => ({
                name,
                type: 'mcp', // MCP clients are all of type 'mcp'
                toolCount: client.serverTools.length,
                serverDefault: 'manual' // Default for now, could be enhanced later
            }));
            
            return { servers };
        } catch (error) {
            throw new Error(`Error listing tool servers: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getToolServer(name: string): Promise<any> {
        try {
            const mcpClients = await this.agent.getAllMcpClients();
            const client = mcpClients[name];
            
            if (!client) {
                throw new Error(`Server '${name}' not found`);
            }
            
            return {
                name,
                type: 'mcp', // MCP clients are all of type 'mcp'
                toolCount: client.serverTools.length,
                serverDefault: 'manual', // Default for now, could be enhanced later
                tools: client.serverTools.map((tool: any) => ({
                    name: tool.name,
                    description: tool.description
                }))
            };
        } catch (error) {
            throw new Error(`Error getting tool server: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async setServerIncludeMode(name: string, mode: string): Promise<any> {
        if (!['always', 'manual', 'agent'].includes(mode)) {
            throw new Error(`Invalid include mode: ${mode}. Must be 'always', 'manual', or 'agent'`);
        }
        
        try {
            const mcpServers = await this.agent.getAllMcpServers();
            const server = mcpServers[name];
            
            if (!server) {
                throw new Error(`Server '${name}' not found`);
            }
            
            // Update the server config with the new server default include mode
            const updatedConfig = {
                ...server.config,
                toolInclude: {
                    ...server.config.toolInclude,
                    serverDefault: mode as 'always' | 'manual' | 'agent'
                }
            };
            
            // Save the updated configuration
            this.agent.saveMcpServer({ ...server, config: updatedConfig });
            
            return {
                success: true,
                message: `Server '${name}' include mode set to '${mode}'`
            };
        } catch (error) {
            throw new Error(`Error setting server include mode: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

}
