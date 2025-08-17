import { McpClient, McpConfig, McpConfigFileServerConfig } from './types';
import { McpClientSse, McpClientStdio } from './client';
import { Tool } from "@modelcontextprotocol/sdk/types";
import { CallToolResultWithElapsedTime } from './types';
import { Logger } from '../types/common';
import { Agent } from '../types/agent';
import { ChatSession } from '../types/chat';
import { McpClientInternalRules } from './client-rules';
import { McpClientInternalReferences } from './client-references';
import { SETTINGS_KEY_SYSTEM_PATH } from '../types/agent';
import { MCPClientManager } from './types';

function isMcpConfigFileServerConfig(obj: any): obj is McpConfigFileServerConfig {
    return obj && typeof obj === 'object' && 'type' in obj;
}

export class MCPClientManagerImpl implements MCPClientManager {
    private clients: Map<string, McpClient>;
    private logger: Logger;

    constructor(logger: Logger) {
        this.clients = new Map<string, McpClient>();
        this.logger = logger;
    }

    async loadClients(agent: Agent) {
        const mcpServers = await agent.mcpServers.getAll();
        for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
            try {
                if (!serverConfig || !serverConfig.config) {
                    this.logger.error(`Invalid server configuration for ${serverName}: missing config property`);
                    continue;
                }
        
                const client = createMcpClientFromConfig(agent, serverConfig, this.logger); 
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
    }

    getAllTools(): Tool[] {
        const allTools: Tool[] = [];
        for (const [clientName, client] of this.clients.entries()) {
            try {
                const clientTools = client.serverTools.map(tool => ({
                    ...tool,
                    name: `${clientName}_${tool.name}`
                }));
                allTools.push(...clientTools);
            } catch (error) {
                this.logger.error(`Error getting tools from server ${clientName}:`, error);
            }
        }
        return allTools;
    }

    async callTool(name: string, args?: Record<string, unknown>, session?: ChatSession): Promise<CallToolResultWithElapsedTime> {
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
        return client.callTool(tool, args, session);
    }

    isReady(): boolean {
        return true; // Assuming the clients map is always ready
    }

    async waitForReady(): Promise<void> {
        // No need to wait for the clients map to be ready
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

    getClient(name: string): McpClient | undefined {
        return this.clients.get(name);
    }

    updateClient(name: string, client: McpClient): void {
        this.clients.set(name, client);
    }

    deleteClient(name: string): void {
        this.clients.delete(name);
    }

    getAllClients(): McpClient[] {
        return Array.from(this.clients.values());
    }

    cleanup(): void {
        for (const client of this.clients.values()) {
            client.disconnect();
        }
        this.clients.clear();
        this.logger.info('MCPClientManager: Cleanup complete');
    }
} 

export function createMcpClientFromConfig(agent: Agent, clientConfig: McpConfig, logger: Logger) : McpClient {
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
        }, logger);
    } else if (serverType === 'sse') {
        client = new McpClientSse(
            new URL(config.url), 
            config.headers,
            logger
        );
    } else if (serverType === 'internal') {
        if (config.tool === 'rules') {
            client = new McpClientInternalRules(agent.rules, logger);
        } else if (config.tool === 'references') {
            client = new McpClientInternalReferences(agent.references, logger);
        } else {
            throw new Error(`Unknown internal server tool: ${config.tool} for server: ${serverName}`);
        }
    } else {
        throw new Error(`Unknown server type: ${serverType} for server: ${serverName}`);
    }

    return client;
}
