import { McpClient, McpConfig } from './types';
import { McpClientSse, McpClientStdio } from './client';
import { Logger } from '../types/common';
import { Agent } from '../types/agent'
import { McpClientInternalRules } from './client-rules';
import { McpClientInternalReferences } from './client-references';
import { SETTINGS_KEY_SYSTEM_PATH } from '../types/agent';
import { MCPClientManager } from './types';

export class MCPClientManagerImpl implements MCPClientManager {
    private clients: Map<string, McpClient>;
    private logger: Logger;

    constructor(logger: Logger) {
        this.clients = new Map<string, McpClient>();
        this.logger = logger;
    }

    private createMcpClientFromConfig(agent: Agent, clientConfig: McpConfig) : McpClient {
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
                const defaultPath = agent.getSetting(SETTINGS_KEY_SYSTEM_PATH);
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
            }, this.logger);
        } else if (serverType === 'sse') {
            client = new McpClientSse(
                new URL(config.url), 
                config.headers,
                this.logger
            );
        } else if (serverType === 'internal') {
            if (config.tool === 'rules') {
                client = new McpClientInternalRules(agent, this.logger);
            } else if (config.tool === 'references') {
                client = new McpClientInternalReferences(agent, this.logger);
            } else {
                throw new Error(`Unknown internal server tool: ${config.tool} for server: ${serverName}`);
            }
        } else {
            throw new Error(`Unknown server type: ${serverType} for server: ${serverName}`);
        }
    
        return client;
    }

    private async loadMcpClient(agent: Agent, serverName: string, serverConfig: any): Promise<void> {
        try {
            if (!serverConfig || !serverConfig.config) {
                this.logger.error(`Invalid server configuration for ${serverName}: missing config property`);
                return;
            }
    
            const client = this.createMcpClientFromConfig(agent, serverConfig); 
            if (client) {
                await client.connect();
                this.clients.set(serverName, client);
            } else {
                throw new Error(`Failed to create client for server: ${serverName}`);
            }
        } catch (error) {
            this.logger.error(`Error initializing MCP client for ${serverName}:`, error);
        }
    }

    async loadMcpClients(agent: Agent) {
        const mcpServers = await agent.getAllMcpServers();
        
        const clientPromises = Object.entries(mcpServers).map(([serverName, serverConfig]) => 
            this.loadMcpClient(agent, serverName, serverConfig)
        );
        
        await Promise.allSettled(clientPromises);
    }

    async updateMcpClient(agent: Agent, name: string, clientConfig: McpConfig): Promise<void> {
        const existingClient = this.clients.get(name);
        if (existingClient) {
            await existingClient.disconnect();
        }
        const newClient = this.createMcpClientFromConfig(agent, clientConfig);
        if (!newClient) {
            throw new Error(`Failed to create client for server: ${name}`);
        }
        await newClient.connect();
        this.clients.set(name, newClient);
    }

    async deleteMcpClient(name: string): Promise<void> {
        const client = this.clients.get(name);
        if (client) {
            await client.disconnect();
            this.clients.delete(name);
        }
    }

    // !!! Doesn't appear to be used anywhere - should probably be paired with calls to loadClients()
    unloadMcpClients(): void {
        for (const client of this.clients.values()) {
            client.disconnect();
        }
        this.clients.clear();
        this.logger.info('MCPClientManager: Unload clients complete');
    }
    
    // We could lazy load clients (making these methods async).  If we did that, then in the code above,
    // what we'd probably do is just have an invalidateClient() method to disconnect/unload a client when
    // its server was updated or deleted.  On an update, the next call to get the client would reload it.
    //
    
    getAllMcpClients(): Record<string, McpClient> {
        return Object.fromEntries(this.clients.entries());
    }

    getMcpClient(name: string): McpClient | undefined {
        return this.clients.get(name);
    }
} 