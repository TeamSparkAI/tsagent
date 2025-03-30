import { MCPClient } from './types';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { Client } from '@modelcontextprotocol/sdk/client/index';
import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types";
import { CallToolResultWithElapsedTime } from './types';
import log from 'electron-log';

export class MCPClientImpl implements MCPClient {
    private mcp: Client;
    private transport: StdioClientTransport | null = null;
    private errorLog: string[] = [];
    private readonly MAX_LOG_ENTRIES = 100;  // Keep last 100 error messages
    serverVersion: { name: string; version: string } | null = null;
    serverTools: Tool[] = [];
    private connected: boolean = false;

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

    isConnected(): boolean {
        return this.connected;
    }

    async connectToServer(command: string, args: string[], env?: Record<string, string>): Promise<boolean> {
        this.transport = new StdioClientTransport({
            command,
            args,
            env,
            stderr: 'pipe'
        });

        try {
            this.transport.onerror = (err: Error) => {
                const message = `Transport error: ${err.message}`;
                log.error(message);
            };

            this.mcp.onerror = (err: Error) => {
                const message = `MCP client error: ${err.message}`;
                log.error(message);
            };

            const connectPromise = this.mcp.connect(this.transport);
            if (this.transport?.stderr) {
                this.transport.stderr.on('data', (data: Buffer) => {
                    const message = data.toString().trim();
                    log.error('Transport stderr: ' + message);
                    this.addErrorMessage(message);
                });
            }
            await connectPromise;

            this.connected = true;

            const serverVersion = this.mcp.getServerVersion();
            this.serverVersion = serverVersion ? { 
                name: serverVersion.name, 
                version: serverVersion.version 
            } : null;

            const toolsResult = await this.mcp.listTools();
            this.serverTools = toolsResult.tools;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error(`Error connecting to MCP server: ${message}`);
            this.addErrorMessage(`Error connecting to MCP server: ${message}`);
            this.connected = false;
            //throw err;
        }

        return this.connected;
    }

    async callTool(tool: Tool, args?: Record<string, unknown>): Promise<CallToolResultWithElapsedTime> {
        const startTime = performance.now();
        const result = await this.mcp.callTool({name: tool.name, arguments: args}) as CallToolResult;
        const elapsedTimeMs = performance.now() - startTime;
        
        return {
            ...result,
            elapsedTimeMs
        };
    }

    public async disconnect() {
        await this.cleanup();
    }

    public async cleanup() {
        if (this.transport) {
            await this.transport.close();
            this.transport = null;
        }
        await this.mcp.close();
    }
}