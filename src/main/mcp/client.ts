import { McpClient, McpConfig } from './types';
import { StdioClientTransport, StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';
import { Client } from '@modelcontextprotocol/sdk/client/index';
import { CallToolResult, ClientResultSchema, Tool } from "@modelcontextprotocol/sdk/types";
import { CallToolResultWithElapsedTime } from './types';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport';
import { ChatSession } from '../state/ChatSession';
import log from 'electron-log';

export abstract class McpClientBase {
    protected mcp: Client;
    protected transport: Transport | null = null;
    protected errorLog: string[] = [];
    protected readonly MAX_LOG_ENTRIES = 100;  // Keep last 100 error messages
    serverVersion: { name: string; version: string } | null = null;
    serverTools: Tool[] = [];
    protected connected: boolean = false;

    constructor() {
        this.mcp = new Client({
            name: "mcp-client",
            version: "1.0.0",
            transport: null
        });
    }

    protected abstract createTransport(): Promise<Transport>;

    protected addErrorMessage(message: string) {
        if (message.trim()) {
            this.errorLog.push(message);
            // Keep only the most recent messages
            if (this.errorLog.length > this.MAX_LOG_ENTRIES) {
                this.errorLog.shift();
            }
        }
    }

    getErrorLog(): string[] {
        return [...this.errorLog];
    }

    clearErrorLog(): void {
        this.errorLog = [];
    }

    isConnected(): boolean {
        return this.connected;
    }

    async connect(): Promise<boolean> {
        this.transport = await this.createTransport();

        try {
            this.transport.onerror = (err: Error) => {
                const message = `Transport error: ${err.message}`;
                log.error(message);
            };

            this.mcp.onerror = (err: Error) => {
                const message = `MCP client error: ${err.message}`;
                log.error(message);
            };

            log.info(`[MCP CLIENT] connect - transport: ${JSON.stringify(this.transport)}`);
            const connectPromise = this.mcp.connect(this.transport);
            if (this.transport instanceof StdioClientTransport) {
                if (this.transport.stderr) {
                    this.transport.stderr.on('data', (data: Buffer) => {
                        const message = data.toString().trim();
                        //log.error('Transport stderr: ' + message);
                        this.addErrorMessage(message);
                    });
                }
            }
            await connectPromise;

            this.connected = true;

            log.info(`[MCP CLIENT] connected, getting version`);
            const serverVersion = this.mcp.getServerVersion();
            this.serverVersion = serverVersion ? { 
                name: serverVersion.name, 
                version: serverVersion.version 
            } : null;
            log.info(`[MCP CLIENT] connected, got version: ${JSON.stringify(this.serverVersion)}`);

            log.info(`[MCP CLIENT] connected, getting tools`);  
            const toolsResult = await this.mcp.listTools();
            log.info(`[MCP CLIENT] connected, got tools: ${JSON.stringify(toolsResult)}`);
            this.serverTools = toolsResult.tools;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error(`Error connecting to MCP server: ${message}`);
            this.addErrorMessage(`Error connecting to MCP server: ${message}`);
            this.connected = false;
        }

        return this.connected;
    }

    async callTool(tool: Tool, args?: Record<string, unknown>, session?: ChatSession): Promise<CallToolResultWithElapsedTime> {
        const startTime = performance.now();
        const result = await this.mcp.callTool({name: tool.name, arguments: args}) as CallToolResult;
        const elapsedTimeMs = performance.now() - startTime;
        
        return {
            ...result,
            elapsedTimeMs
        };
    }

    async disconnect(): Promise<void> {
        await this.cleanup();
    }

    async cleanup(): Promise<void> {
        if (this.transport) {
            await this.transport.close();
            this.transport = null;
        }
        await this.mcp.close();
    }

    async ping(): Promise<{ elapsedTimeMs: number }> {
        if (!this.connected) {
            throw new Error('Not connected to MCP server');
        }
        const startTime = performance.now();
        await this.mcp.ping();
        return { elapsedTimeMs: performance.now() - startTime };
    }
}

// mcpConfig looks like this:
//
// mcpServers: {
//   "Your MCP server name": {
//     "type": "stdio",
//     "command": "uv run server.ts",
//     "args": ["--port", "8080"],
//     "env": {
//       "NODE_ENV": "development"
//     }
//   }
// }
//
export class McpClientStdio extends McpClientBase implements McpClient {
    private serverParams: StdioServerParameters;

    constructor(serverParams: StdioServerParameters) {
        super();
        this.serverParams = serverParams;
    }

    protected async createTransport(): Promise<Transport> {
        log.info(`[MCP CLIENT] createTransport - serverParams: ${JSON.stringify(this.serverParams.env)}`);
        return new StdioClientTransport({
            command: this.serverParams.command,
            args: this.serverParams.args,
            env: this.serverParams.env,
            stderr: 'pipe'
        });
    }
}

// This was pieced together from: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/client/sse.test.ts
//
// It has been tested with the reference weather server and verified to work.  Note the /sse suffix in the url.
//
// mcpConfig looks like this:
//
// mcpServers: {
//   "Your MCP server name": {
//     "type": "sse",
//     "url": "http://localhost:8080/sse",
//     "headers": {
//         "Authorization": "Bearer <your-api-key>"
//     }
//   }
// }
//
export class McpClientSse extends McpClientBase implements McpClient {
    private url: URL;
    private headers: Record<string, string> = {};

    constructor(url: URL, headers?: Record<string, string>) {
        super();
        this.url = url;
        this.headers = headers || {};
    }

    protected async createTransport(): Promise<Transport> {
        log.info(`[MCP CLIENT] createTransport - url: ${this.url.toString()}`);
        if (Object.keys(this.headers).length > 0) {
            // Create a fetch wrapper that adds headers
            const fetchWithHeaders = (url: string | URL, init?: RequestInit) => {
                const headers = new Headers(init?.headers);
                Object.entries(this.headers).forEach(([key, value]) => {
                    headers.set(key, value);
                });
                return fetch(url.toString(), { ...init, headers });
            };

            return new SSEClientTransport(this.url, {
                eventSourceInit: {
                    fetch: fetchWithHeaders
                }
            });
        }

        return new SSEClientTransport(this.url);
    }
}