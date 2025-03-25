import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types";
import { MCPClient } from "./types.js";

export class MCPClientImpl implements MCPClient {
    private mcp: Client;
    private transport: StdioClientTransport | null = null;
    private errorLog: string[] = [];
    private readonly MAX_LOG_ENTRIES = 100;  // Keep last 100 error messages
    serverVersion: { name: string; version: string } | null = null;
    serverTools: Tool[] = [];

    constructor() {
        this.mcp = new Client({
            name: "mcp-client",
            version: "1.0.0",
            transport: null
        });
    }

    private addErrorMessage(message: string) {
        if (message.trim()) {
            this.errorLog.push(message);
            // Keep only the most recent messages
            if (this.errorLog.length > this.MAX_LOG_ENTRIES) {
                this.errorLog.shift();
            }
        }
    }

    // Add getter for error log
    getErrorLog(): string[] {
        return [...this.errorLog];
    }

    // Clear error log
    clearErrorLog(): void {
        this.errorLog = [];
    }

    async connectToServer(command: string, args: string[], env?: Record<string, string>) {      
        this.transport = new StdioClientTransport({
            command,
            args,
            env,
            stderr: 'pipe'
        });

        try {
            this.transport.onerror = (err: Error) => {
                const message = `Transport error: ${err.message}`;
                console.error(message);
            };

            this.mcp.onerror = (err: Error) => {
                const message = `MCP client error: ${err.message}`;
                console.error(message);
            };

            const connectPromise = this.mcp.connect(this.transport);
            if (this.transport?.stderr) {
                this.transport.stderr.on('data', (data: Buffer) => {
                    const message = `Transport stderr: ${data.toString().trim()}`;
                    console.error(message);
                    this.addErrorMessage(message);
                });
            }
            await connectPromise;

            const serverVersion = this.mcp.getServerVersion();
            this.serverVersion = serverVersion ? { 
                name: serverVersion.name, 
                version: serverVersion.version 
            } : null;

            const toolsResult = await this.mcp.listTools();
            this.serverTools = toolsResult.tools;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`Error connecting to MCP server: ${message}`);
            this.addErrorMessage(`Error connecting to MCP server: ${message}`);
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