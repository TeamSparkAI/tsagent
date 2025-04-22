import { McpClient, McpConfig } from './types';
import { getDefaultEnvironment, StdioClientTransport, StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';
import { Client } from '@modelcontextprotocol/sdk/client/index';
import { CallToolResult, ClientResultSchema, Tool } from "@modelcontextprotocol/sdk/types";
import { CallToolResultWithElapsedTime } from './types';
import log from 'electron-log';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport';
import { McpClientInternalRules } from './InternalClientRules';
import { McpClientInternalReferences } from './InternalClientReferences';
import { WorkspaceManager } from '../state/WorkspaceManager';
import { ChatSession } from '../state/ChatSession';
import { app } from 'electron';
import { SYSTEM_PATH_KEY } from '../../shared/workspace';

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

    protected abstract createTransport(): Transport;

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
        this.transport = this.createTransport();

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

    protected createTransport(): Transport {
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

    protected createTransport(): Transport {
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

export function createMcpClientFromConfig(workspace: WorkspaceManager, clientConfig: McpConfig) : McpClient {
    let client: McpClient;
    const serverName = clientConfig.name;
    const config = clientConfig.config;
    const serverType = config.type;
    
    if (!serverType || serverType === 'stdio') {
        // If you specify an env, it will be the ENTIRE environment, so you need PATH in order to find your command
        // https://github.com/modelcontextprotocol/typescript-sdk/issues/196
        //
        // Action: If the user provides an env, but doesn't provide a PATH as part of it, we need to provide one. 
        //
        // Also, on MacOS, when "bundled", the PATH is set to: /usr/bin:/bin:/usr/sbin:/sbin
        // There is no way to access the actual system PATH, which can present a couple of problems:
        // 1) If the command doesn't have a full path, it won't be found
        // 2) If the command launches a shell, or spawns other commands, that require a valid PATH (esp "npx"), those will fail unless we pass a valid PATH envinronment variable
        //
        // To make npx work out of the box, we need to pass the node bin path and "/bin" (for "sh" and other shell commands required by npx)
        //
        // Action: If the user didn't provide a PATH in the env, and there is a system default path for tool use, we'll send that in the env whether any other env was specified or not.
        //
        let env = config.env; // If we modify this we'll shallow copy into a new object so we don't modify the original
        if (!config.env?.PATH) {
            const defaultPath = workspace.getSettingsValue(SYSTEM_PATH_KEY);
            if (defaultPath) {
                // If the user didn't provide a path and there is a default path, use that (whether or not any other env was provided)
                env = { ...(env ?? {}), PATH: defaultPath };
            } else if (config.env && Object.keys(config.env).length > 0) {
                // If the user provided an env, but no PATH, and there's not a default path, we'll use the system PATH
                const processPath = process.env.PATH;
                env = { ...env, PATH: processPath! };
            }
        }

        client = new McpClientStdio({
            command: config.command,
            args: config.args || [],
            env: env
        });
    } else if (serverType === 'sse') {
        client = new McpClientSse(
            new URL(config.url), 
            config.headers
        );
    } else if (serverType === 'internal') {
        if (config.tool === 'rules') {
            client = new McpClientInternalRules(workspace.rulesManager);
        } else if (config.tool === 'references') {
            client = new McpClientInternalReferences(workspace.referencesManager);
        } else {
            throw new Error(`Unknown internal server tool: ${config.tool} for server: ${serverName}`);
        }
    } else {
        throw new Error(`Unknown server type: ${serverType} for server: ${serverName}`);
    }

    return client;
}