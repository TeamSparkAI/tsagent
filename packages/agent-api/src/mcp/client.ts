import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioClientTransport, StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { McpClient, McpConfig } from './types.js';
import { CallToolResultWithElapsedTime } from './types.js';
import { ChatSession } from '../types/chat.js';
import { Logger } from '../types/common.js';

export abstract class McpClientBase {
    protected mcp: Client;
    protected transport: Transport | null = null;
    protected errorLog: string[] = [];
    protected readonly MAX_LOG_ENTRIES = 100;  // Keep last 100 error messages
    serverVersion: { name: string; version: string } | null = null;
    serverTools: Tool[] = [];
    protected connected: boolean = false;
    protected logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
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
        this.logger.info(`[MCP CLIENT] connect - creating transport`);
        this.transport = await this.createTransport();

        try {
            this.transport.onerror = (err: Error) => {
                const message = `Transport error: ${err.message}`;
                this.logger.error(message);
            };

            this.mcp.onerror = (err: Error) => {
                const message = `MCP client error: ${err.message}`;
                this.logger.error(message);
            };

            this.logger.info(`[MCP CLIENT] connect - transport: ${JSON.stringify(this.transport)}`);
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

            this.logger.info(`[MCP CLIENT] connected, getting version`);
            const serverVersion = this.mcp.getServerVersion();
            this.serverVersion = serverVersion ? { 
                name: serverVersion.name, 
                version: serverVersion.version 
            } : null;
            this.logger.info(`[MCP CLIENT] connected, got version: ${JSON.stringify(this.serverVersion)}`);

            this.logger.info(`[MCP CLIENT] connected, getting tools`);  
            const toolsResult = await this.mcp.listTools();
            this.logger.info(`[MCP CLIENT] connected, got tools: ${JSON.stringify(toolsResult)}`);
            this.serverTools = toolsResult.tools;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Error connecting to MCP server: ${message}`);
            this.addErrorMessage(`Error connecting to MCP server: ${message}`);
            this.connected = false;
        }

        return this.connected;
    }

    async onDisconnect() {
        this.logger.info(`[MCP CLIENT] onDisconnect - disconnecting transport`);
        this.transport?.close();
        this.transport = null;
        this.connected = false;
    }

    async callTool(tool: Tool, args?: Record<string, unknown>, session?: ChatSession): Promise<CallToolResultWithElapsedTime> {
        if (!this.connected) { await this.connect(); }
        if (!this.connected) { throw new Error('Not connected to MCP server'); }
        const startTime = performance.now();
        const result = await this.mcp.callTool({name: tool.name, arguments: args}) as CallToolResult;
        const elapsedTimeMs = performance.now() - startTime;
        
        return {
            ...result,
            elapsedTimeMs
        };
    }

    async ping(): Promise<{ elapsedTimeMs: number }> {
        if (!this.connected) { await this.connect(); }
        if (!this.connected) { throw new Error('Not connected to MCP server'); }
        const startTime = performance.now();
        await this.mcp.ping();
        return { elapsedTimeMs: performance.now() - startTime };
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

    constructor(serverParams: StdioServerParameters, logger: Logger) {
        super(logger);
        this.serverParams = serverParams;
    }

    protected async createTransport(): Promise<Transport> {
        this.logger.info(`[MCP CLIENT] createTransport - serverParams: ${JSON.stringify(this.serverParams.env)}`);
        return new StdioClientTransport({
            command: this.serverParams.command,
            args: this.serverParams.args,
            env: this.serverParams.env,
            cwd: this.serverParams.cwd ?? undefined,
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

    constructor(url: URL, headers?: Record<string, string>, logger?: Logger) {
        super(logger!);
        this.url = url;
        this.headers = headers || {};
    }

    protected async createTransport(): Promise<Transport> {
        this.logger.info(`[MCP CLIENT] createTransport - url: ${this.url.toString()}`);
        let transport: Transport;
        let fetchCount: number = 0;

        // There is a nasty bug where when an SSE client transport loses connection, it will reconnect, but not renegotiate the MCP protocol, 
        // so the transport will be in a broken state and subsequent calls to fetch will fail.
        // https://github.com/modelcontextprotocol/typescript-sdk/issues/510    
        //
        // The workaround below is to intercept the session initialization fetch call to identify ones where the session will be corrupted
        // and recycle the transport accordingly.
        //
        const onEventSourceInitFetch = async (url: string | URL, init: RequestInit | undefined, headers?: Headers): Promise<Response> => {
            this.logger.info(`[MCP CLIENT] onEventSourceInit, fetchCount: ${fetchCount}`);
            fetchCount++;
            if (fetchCount > 1) {
                this.onDisconnect();
                return new Response(null, { status: 400, statusText: 'SSE Connection terminated, will reconnect on next message' });
            } else {
                return fetch(url.toString(), { ...init, headers });
            }
        };

        if (Object.keys(this.headers).length > 0) {
            // Create a fetch wrapper that adds headers
            const fetchWithHeaders = (url: string | URL, init?: RequestInit) => {
                const headers = new Headers(init?.headers);
                Object.entries(this.headers).forEach(([key, value]) => {
                    headers.set(key, value);
                });
                return onEventSourceInitFetch(url, init, headers);
            };
            
            const transport = new SSEClientTransport(this.url, {
                eventSourceInit: {
                    fetch: fetchWithHeaders
                }
            });

            return transport;
        } else {
            transport = new SSEClientTransport(this.url, {
                eventSourceInit: {
                    fetch: (url, init) => {
                        return onEventSourceInitFetch(url, init);
                    }
                }
            });
        }

        return transport;
    }
}

export interface SearchOptions {
    topK?: number;
    topN?: number;
    includeScore?: number;
}

export interface SearchArgs extends SearchOptions {
    query: string;
}

export function validatePositiveInteger(value: unknown, fieldName: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${fieldName} must be a positive number`);
    }
    return Math.floor(value);
}

export function validateIncludeScore(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error('includeScore must be a number between 0 and 1');
    }
    return value;
}

export function validateSearchOptions(topK?: unknown, topN?: unknown, includeScore?: unknown): SearchOptions {
    const options: SearchOptions = {};
    if (topK !== undefined) {
        options.topK = validatePositiveInteger(topK, 'topK');
    }
    if (topN !== undefined) {
        options.topN = validatePositiveInteger(topN, 'topN');
    }
    if (includeScore !== undefined) {
        options.includeScore = validateIncludeScore(includeScore);
    }
    return options;
}

export function validateSearchArgs(args?: Record<string, unknown>): SearchArgs {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
        throw new Error('Arguments must be an object containing at least a query field');
    }

    const { query, topK, topN, includeScore } = args as { query?: unknown; topK?: unknown; topN?: unknown; includeScore?: unknown };

    if (typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Search query must be a non-empty string');
    }

    const searchOptions = validateSearchOptions(topK, topN, includeScore);

    return {
        query: query.trim(),
        ...searchOptions,
    };
}