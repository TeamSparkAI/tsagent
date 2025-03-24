import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types";
import { MCPClient } from "./types.js";

export class MCPClientImpl implements MCPClient {
    private mcp: Client;
    private transport: StdioClientTransport | null = null;
    serverVersion: { name: string; version: string } | null = null;
    serverTools: Tool[] = [];

    constructor() {
        this.mcp = new Client({
            name: "mcp-client",
            version: "1.0.0",
            transport: null
        });
    }

    async connectToServer(command: string, args: string[], env?: Record<string, string>) {      
        this.transport = new StdioClientTransport({
            command,
            args,
            env,
            stderr: 'pipe', // Need to get this somewhere so we can track legit errors
        });

        try {
            await this.mcp.connect(this.transport);

            const serverVersion = this.mcp.getServerVersion();
            this.serverVersion = serverVersion ? { 
                name: serverVersion.name, 
                version: serverVersion.version 
            } : null;

            const toolsResult = await this.mcp.listTools();
            this.serverTools = toolsResult.tools;
        } catch (err) {
            console.error('Error connecting to MCP server:', err);
            throw err;
        }
    }

    async callTool(tool: Tool, args?: Record<string, unknown>): Promise<CallToolResult> {
        const result = await this.mcp.callTool({name: tool.name, arguments: args}) as CallToolResult;
        return result;
    }

    public async disconnect() {
        await this.cleanup();
    }

    public async cleanup() {
        if (this.transport) {
            this.transport.close();
            this.transport = null;
        }
        await this.mcp.close();
    }
}