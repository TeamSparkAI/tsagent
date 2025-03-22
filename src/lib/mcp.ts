import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
// import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Tool } from "@modelcontextprotocol/sdk/types";

interface ServerVersion {
    name: string;
    version: string;
}

export class MCPClient {
    private mcp: Client;
    private transport: StdioClientTransport | null = null;
    serverVersion: ServerVersion | null = null;
    serverTools: Tool[] = [];

    constructor() {
        this.mcp = new Client({
            name: "mcp-client",
            version: "1.0.0",
            transport: null // Will be set when connecting
        });
    }

    async connectToServer(command: string, args: string[], env: Record<string, string> | undefined) {      
        this.transport = new StdioClientTransport({
            command,
            args,
            env,
            stderr: 'pipe'
        });
        await this.mcp.connect(this.transport);

        const instructions = this.mcp.getInstructions();
        console.log('instructions', instructions);
        const capabilities = this.mcp.getServerCapabilities();
        console.log('capabilities', capabilities);
        const serverVersion = this.mcp.getServerVersion();
        this.serverVersion = serverVersion ? { 
            name: serverVersion.name, 
            version: serverVersion.version 
        } : null;
        console.log('version', this.serverVersion);

        const toolsResult = await this.mcp.listTools();
        this.serverTools = toolsResult.tools.map((tool) => {
          return {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          };
        });
        console.log(
          "Connected to server with tools:",
          this.serverTools.map(({ name }) => name)
        );
    }

    async cleanup() {
        await this.mcp.close();
    }
} 