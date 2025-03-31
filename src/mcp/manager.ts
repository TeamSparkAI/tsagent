import { McpClient, McpConfigFileServerConfig } from './types';
import { McpClientStdio, McpClientSse } from './client';
import { Tool } from "@modelcontextprotocol/sdk/types";
import { CallToolResultWithElapsedTime } from './types';
import log from 'electron-log';
import { McpClientInternalRules } from './InternalClientRules';
import { McpClientInternalReferences } from './InternalClientReferences';
import { AppState } from '../state/AppState';

function isMcpConfigFileServerConfig(obj: any): obj is McpConfigFileServerConfig {
    return obj && typeof obj === 'object' && 'type' in obj;
}

export class MCPClientManager {
    private clients = new Map<string, McpClient>();
    private ready = false;
    private appState: AppState;
    private loadPromise: Promise<void> | null = null;

    constructor(appState: AppState) {
        this.appState = appState;
    }

    async loadClients(config: Record<string, any>) {
        // If we're already loading, wait for that to complete
        if (this.loadPromise) {
            return this.loadPromise;
        }

        // Create a new load promise
        this.loadPromise = (async () => {
            log.info('MCPClientManager: Loading clients from config:', config);
            for (const [name, serverConfig] of Object.entries(config)) {
                log.info('MCPClientManager: Creating client for:', name);
                let client: McpClient;

                try {
                    if (!isMcpConfigFileServerConfig(serverConfig)) {
                        log.error('Invalid server config:', name);
                        continue;
                    }

                    if (serverConfig.type === 'stdio') {
                        client = new McpClientStdio({
                            command: serverConfig.command,
                            args: serverConfig.args,
                            env: serverConfig.env
                        });
                    } else if (serverConfig.type === 'sse') {
                        client = new McpClientSse(new URL(serverConfig.url), serverConfig.headers);
                    } else if (serverConfig.type === 'internal') {
                        if (serverConfig.tool === 'rules') {
                            client = new McpClientInternalRules(this.appState.getRulesManager());
                        } else if (serverConfig.tool === 'references') {
                            client = new McpClientInternalReferences(this.appState.getReferencesManager());
                        } else {
                            log.error('Unknown internal server tool:', serverConfig.tool, 'for server:', name);
                            throw new Error(`Unknown internal server tool: ${serverConfig.tool}`);
                        }
                    } else {
                        log.error('Unknown server type:', serverConfig.type, 'for server:', name);
                        continue;
                    }

                    await client.connect();
                    this.clients.set(name, client);
                    log.info('MCPClientManager: Successfully connected client:', name);
                } catch (error) {
                    log.error('MCPClientManager: Failed to connect client:', name, error);
                }
            }
            this.ready = true;
            log.info('MCPClientManager: Loaded clients:', Array.from(this.clients.keys()));
        })();

        return this.loadPromise;
    }

    isReady(): boolean {
        return this.ready;
    }

    async waitForReady(): Promise<void> {
        if (this.ready) {
            return;
        }
        if (this.loadPromise) {
            await this.loadPromise;
        } else {
            throw new Error('MCPClientManager not initialized');
        }
    }

    getAllTools(): Tool[] {
        if (!this.ready) {
            throw new Error('MCPClientManager not ready');
        }
        const allTools: Tool[] = [];
        for (const [clientName, client] of this.clients.entries()) {
            const clientTools = client.serverTools.map(tool => ({
                ...tool,
                name: `${clientName}_${tool.name}`
            }));
            allTools.push(...clientTools);
        }
        log.info('MCPClientManager: Getting all tools, count:', allTools.length);
        return allTools;
    }

    getToolServerName(name: string): string {
        const firstUnderscoreIndex = name.indexOf('_');
        if (firstUnderscoreIndex === -1) {
            throw new Error(`Invalid tool name format: ${name}. Expected format: clientName_toolName`);
        }
        return name.substring(0, firstUnderscoreIndex);
    }

    getToolName(name: string): string {
        const firstUnderscoreIndex = name.indexOf('_');
        if (firstUnderscoreIndex === -1) {
            throw new Error(`Invalid tool name format: ${name}. Expected format: clientName_toolName`);
        }
        return name.substring(firstUnderscoreIndex + 1);
    }

    async callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResultWithElapsedTime> {
        if (!this.ready) {
            throw new Error('MCPClientManager not ready');
        }
        log.info('MCPClientManager: Calling tool:', name);

        const clientName = this.getToolServerName(name);
        const toolName = this.getToolName(name);

        const client = this.clients.get(clientName);
        if (!client) {
            throw new Error(`Client not found: ${clientName}`);
        }

        const tool = client.serverTools.find(t => t.name === toolName);
        if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
        }

        log.info('MCPClientManager: Found tool in client');
        return client.callTool(tool, args);
    }

    getClient(name: string): McpClient | undefined {
        if (!this.ready) {
            return undefined;
        }
        const client = this.clients.get(name);
        log.info('MCPClientManager: Getting client:', name, client ? 'found' : 'not found');
        return client;
    }

    getAllClients(): McpClient[] {
        if (!this.ready) {
            return [];
        }
        const clients = Array.from(this.clients.values());
        log.info('MCPClientManager: Getting all clients, count:', clients.length);
        return clients;
    }

    async cleanup() {
        log.info('MCPClientManager: Cleaning up clients');
        for (const client of this.clients.values()) {
            await client.cleanup();
        }
        this.clients.clear();
        this.ready = false;
        log.info('MCPClientManager: Cleanup complete');
    }
} 