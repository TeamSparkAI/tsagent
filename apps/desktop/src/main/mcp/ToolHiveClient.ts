import { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import { McpClientBase } from "./client";
import { McpClient } from "./types";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse";
import { ToolHive } from "../thv/ToolHive";
import log from 'electron-log';

export class ToolHiveClient extends McpClientBase implements McpClient {
    private server: string;
    private name: string;
    private thvArgs: string[];
    private serverArgs: string[];
    private env: Record<string, string>;

    constructor(server: string, name: string, thvArgs: string[], serverArgs: string[], env: Record<string, string>) {
        super();
        this.server = server;
        this.name = name;
        this.thvArgs = thvArgs;
        this.serverArgs = serverArgs;
        this.env = env;
    }

    protected async createTransport(): Promise<Transport> {
        // Ensure that the server is running and create SSE transport to connect to it...
        if (!ToolHive.isRunnable()) {
            throw new Error("ToolHive is not installed");
        }

        let containers = await ToolHive.listContainers();
        log.info(`[ToolHiveClient] - Container List (before run): ${JSON.stringify(containers)}`);

        let container = containers.find(c => c.name === this.name);
        if (!container) {
            // Run the server
            log.info(`[ToolHiveClient] - Running server: ${this.name}`);
            await ToolHive.runServer(this.server, this.name, this.thvArgs, this.serverArgs, this.env);

            // Get the container in a loop until it is running or timeout expires (it's never there the first time, but usually shows up within a second)
            const timeout = 10000;
            const interval = 1000;
            const startTime = Date.now();
            while (true) {
                containers = await ToolHive.listContainers();
                log.info(`[ToolHiveClient] - Container List (after run): ${JSON.stringify(containers)}`);
                container = containers.find(c => c.name === this.name);
                if (container) {
                    break;
                }
                if (Date.now() - startTime > timeout) {
                    throw new Error(`ToolHive server ${this.name} did not start in ${timeout}ms`);
                }
                await new Promise(resolve => setTimeout(resolve, interval));
            }
        }

        if (!container) {
            log.error(`[ToolHiveClient] - Container not found, container list: ${JSON.stringify(containers)}`);
            throw new Error(`ToolHive server ${this.name} was not running and could not be started`);
        }

        log.info(`[ToolHiveClient] - Running container found: ${JSON.stringify(container)}`);

        return new SSEClientTransport(new URL(container.url));
    }
}