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
                result = await implementListTools(this.agent);
                break;
            case "getTool":
                result = await implementGetTool(this.agent, args?.serverName as string, args?.toolName as string);
                break;
            case "listContextTools": {
                if (!session) {
                    throw new Error(`Chat session not found`);
                }
                result = await implementListContextTools(session);
                break;
            }
            case "includeTool": {
                if (!session) {
                    throw new Error(`Chat session not found`);
                }
                result = await implementIncludeTool(session, args?.serverName as string, args?.toolName as string);
                break;
            }
            case "excludeTool": {
                if (!session) {
                    throw new Error(`Chat session not found`);
                }
                result = await implementExcludeTool(session, args?.serverName as string, args?.toolName as string);
                break;
            }
            case "setToolIncludeMode":
                result = await implementSetToolIncludeMode(this.agent, args?.serverName as string, args?.toolName as string, args?.mode as string);
                break;
            case "listToolServers":
                result = await implementListToolServers(this.agent);
                break;
            case "getToolServer":
                result = await implementGetToolServer(this.agent, args?.name as string);
                break;
            case "setServerIncludeMode":
                result = await implementSetServerIncludeMode(this.agent, args?.name as string, args?.mode as string);
                break;
            case "includeToolServer": {
                if (!session) {
                    throw new Error(`Chat session not found`);
                }
                result = await implementIncludeToolServer(this.agent, session, args?.name as string);
                break;
            }
            case "excludeToolServer": {
                if (!session) {
                    throw new Error(`Chat session not found`);
                }
                result = await implementExcludeToolServer(session, args?.name as string);
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
    // These methods are now exported and called directly from callTool
}

// ========================================
// Exported Implementation Functions
// ========================================

export async function implementListTools(agent: Agent): Promise<any> {
    try {
        const mcpClients = await agent.getAllMcpClients();
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

export async function implementGetTool(agent: Agent, serverName: string, toolName: string): Promise<any> {
    try {
        const mcpClients = await agent.getAllMcpClients();
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

export async function implementListContextTools(session: ChatSession): Promise<any> {
    const includedTools = session.getIncludedTools();
    return { tools: includedTools };
}

export async function implementIncludeTool(session: ChatSession, serverName: string, toolName: string): Promise<any> {
    const success = await session.addTool(serverName, toolName);
    return {
        success,
        message: success 
            ? `Tool '${serverName}:${toolName}' included in context`
            : `Tool '${serverName}:${toolName}' was already in context`
    };
}

export async function implementExcludeTool(session: ChatSession, serverName: string, toolName: string): Promise<any> {
    const success = session.removeTool(serverName, toolName);
    return {
        success,
        message: success 
            ? `Tool '${serverName}:${toolName}' excluded from context`
            : `Tool '${serverName}:${toolName}' was not in context`
    };
}

export async function implementSetToolIncludeMode(agent: Agent, serverName: string, toolName: string, mode: string): Promise<any> {
    if (!['always', 'manual', 'agent'].includes(mode)) {
        throw new Error(`Invalid include mode: ${mode}. Must be 'always', 'manual', or 'agent'`);
    }
    
    try {
        const mcpServers = await agent.getAllMcpServers();
        const server = mcpServers[serverName];
        
        if (!server) {
            throw new Error(`Server '${serverName}' not found`);
        }
        
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
        
        agent.saveMcpServer({ ...server, config: updatedConfig });
        
        return {
            success: true,
            message: `Tool '${serverName}:${toolName}' include mode set to '${mode}'`
        };
    } catch (error) {
        throw new Error(`Error setting tool include mode: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function implementListToolServers(agent: Agent): Promise<any> {
    try {
        const mcpClients = await agent.getAllMcpClients();
        const servers = Object.entries(mcpClients).map(([name, client]) => ({
            name,
            type: 'mcp',
            toolCount: client.serverTools.length,
            serverDefault: 'manual'
        }));
        
        return { servers };
    } catch (error) {
        throw new Error(`Error listing tool servers: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function implementGetToolServer(agent: Agent, name: string): Promise<any> {
    try {
        const mcpClients = await agent.getAllMcpClients();
        const client = mcpClients[name];
        
        if (!client) {
            throw new Error(`Server '${name}' not found`);
        }
        
        return {
            name,
            type: 'mcp',
            toolCount: client.serverTools.length,
            serverDefault: 'manual',
            tools: client.serverTools.map((tool: any) => ({
                name: tool.name,
                description: tool.description
            }))
        };
    } catch (error) {
        throw new Error(`Error getting tool server: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function implementSetServerIncludeMode(agent: Agent, name: string, mode: string): Promise<any> {
    if (!['always', 'manual', 'agent'].includes(mode)) {
        throw new Error(`Invalid include mode: ${mode}. Must be 'always', 'manual', or 'agent'`);
    }
    
    try {
        const mcpServers = await agent.getAllMcpServers();
        const server = mcpServers[name];
        
        if (!server) {
            throw new Error(`Server '${name}' not found`);
        }
        
        const updatedConfig = {
            ...server.config,
            toolInclude: {
                ...server.config.toolInclude,
                serverDefault: mode as 'always' | 'manual' | 'agent'
            }
        };
        
        agent.saveMcpServer({ ...server, config: updatedConfig });
        
        return {
            success: true,
            message: `Server '${name}' include mode set to '${mode}'`
        };
    } catch (error) {
        throw new Error(`Error setting server include mode: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function implementIncludeToolServer(agent: Agent, session: ChatSession, serverName: string): Promise<any> {
    const mcpClients = await agent.getAllMcpClients();
    const client = mcpClients[serverName];
    
    if (!client) {
        throw new Error(`Server '${serverName}' not found`);
    }
    
    let includedCount = 0;
    for (const tool of client.serverTools) {
        const success = await session.addTool(serverName, tool.name);
        if (success) includedCount++;
    }
    
    return {
        success: true,
        message: `Server '${serverName}' included with ${includedCount} tools added to context`
    };
}

export async function implementExcludeToolServer(session: ChatSession, serverName: string): Promise<any> {
    const includedTools = session.getIncludedTools();
    const serverTools = includedTools.filter(tool => tool.serverName === serverName);
    
    let excludedCount = 0;
    for (const tool of serverTools) {
        const success = session.removeTool(tool.serverName, tool.toolName);
        if (success) excludedCount++;
    }
    
    return {
        success: true,
        message: `Server '${serverName}' excluded with ${excludedCount} tools removed from context`
    };
}
