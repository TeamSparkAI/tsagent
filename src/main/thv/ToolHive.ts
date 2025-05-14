import { exec } from 'child_process';
import { promisify } from 'util';
import log from 'electron-log';
import { spawn } from 'child_process';

const execAsync = promisify(exec);

// Let's say we want to run a server via ToolHive
//
// We provide a server name and a server "command"
//
//   fetch, uvx://mcp-server-fetch
//
// We check to see if the server is already running (and get the port / URL)
//
// If not, we run the server and return the port / URL
//
// The tool itself is an SSE client using the port/url.
//
// We pass environment variables to the tool via the `-e/--env` flag
// We need to collect and support ToolHive args (including -v/--volume)
// We pass the arguments as bare args at the end (with a "--" prefix before the args)

// Tool config:
//
// Type: ToolHive
// Name: fetch
// Server: uvx://mcp-server-fetch
// ThvArgs: []
// ServerArgs: []
// Env: {}

// Hi Bob! You can pass the `-v/--volume` flag to mount a folder into the /projects path of the filesystem MCP, for example this worked for me:
// `thv run --name filesystem --volume ~/code/toolhive:/projects/toolhive npx://@modelcontextprotocol/server-filesystem -- /projects`


export interface ThvVersion {
    version: string;
    commit: string;
    built: string;
    goVersion: string;
    platform: string;
}

export interface Container {
    id: string;
    name: string;
    image: string;
    state: string;
    transport: string;
    port: string;
    url: string;
}

export class ToolHive {
    public static async isRunnable(): Promise<boolean> {
        try {
            await execAsync('thv version');
            return true;
        } catch (error) {
            return false;
        }
    }

    private static parseVersion(output: string): ThvVersion {
        // thv version returns either:
        //
        //   ToolHive v0.0.31
        //   Commit: b42b1399f1da431f9e6129161862734a00eb8895
        //   Built: 2025-05-06 19:10:06 UTC
        //   Go version: go1.24.1
        //   Platform: darwin/arm64
        //
        // Or:
        //
        //   A new version of ToolHive is available: v0.0.32
        //   Currently running: v0.0.31
        //   ToolHive v0.0.31
        //   Commit: b42b1399f1da431f9e6129161862734a00eb8895
        //   Built: 2025-05-06 19:10:06 UTC
        //   Go version: go1.24.1
        //   Platform: darwin/arm64
        //
        // We need to handle both cases
        //
        const lines = output.trim().split('\n');
        let version: string;
        let commit: string;
        let built: string;
        let goVersion: string;
        let platform: string;

        if (lines[0].startsWith('A new version of ToolHive is available:')) {
            version = lines[2].replace('ToolHive v', '');
            commit = lines[3].replace('Commit: ', '');
            built = lines[4].replace('Built: ', '');
            goVersion = lines[5].replace('Go version: ', '');
            platform = lines[6].replace('Platform: ', '');
        } else {
            version = lines[0].replace('ToolHive v', '');
            commit = lines[1].replace('Commit: ', '');
            built = lines[2].replace('Built: ', '');
            goVersion = lines[3].replace('Go version: ', '');
            platform = lines[4].replace('Platform: ', '');
        }

        return { version, commit, built, goVersion, platform };
    }

    public static async getVersion(): Promise<ThvVersion> {
        try {
            const { stdout } = await execAsync('thv version');
            return this.parseVersion(stdout);
        } catch (error) {
            throw new Error(`Failed to get thv version: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private static parseContainers(output: string): Container[] {
        const lines = output.trim().split('\n');
        const containers: Container[] = [];

        for (const line of lines) {
            const [id, name, image, state, transport, port, url] = line.split(/\s+/);
            containers.push({ id, name, image, state, transport, port, url });
        }

        return containers;
    }

    // thv list
    //
    // CONTAINER ID   NAME    IMAGE              STATE     TRANSPORT   PORT    URL
    // 424d3ba318e0   fetch   mcp/fetch:latest   running   stdio       45453   http://localhost:45453/sse#fetch
    //
    public static async listContainers(): Promise<Container[]> {
        try {
            const { stdout } = await execAsync('thv list');
            log.info(`[ToolHive] - List Containers: ${stdout}`);
            return this.parseContainers(stdout);
        } catch (error) {
            throw new Error(`Failed to list thv containers: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // thv run fetch
    //
    // 1:56PM INF Processed cmdArgs: []
    // 1:56PM INF Image mcp/fetch:latest has 'latest' tag, pulling to ensure we have the most recent version...
    // 1:56PM INF Pulling image: mcp/fetch:latest
    // Pulling from mcp/fetch: latest
    // Digest: sha256:a2a12ad15957d35a688abe7f8f2543db8a5bbe56b8961bb66767bbacd0f7ebf7
    // Status: Image is up to date for mcp/fetch:latest
    // 1:56PM INF Successfully pulled image: mcp/fetch:latest
    // 1:56PM INF Using host port: 44873
    // 1:56PM INF Logging to: /Users/bob/Library/Application Support/toolhive/logs/fetch.log
    // 1:56PM INF MCP server is running in the background (PID: 62026)
    // 1:56PM INF Use 'thv stop fetch' to stop the server
    //
    // server is server name (ToolHive registry), image name (Docker), or protocol scheme (uvx/npx)
    //
    public static async runServer(server: string, name: string, thvArgs: string[], serverArgs: string[], env: Record<string, string>): Promise<void> {
        const envArgs = Object.entries(env).map(([key, value]) => `--env ${key}=${value}`);
        const args = ['run', server, '--name', name, ...thvArgs, ...envArgs, '--', ...serverArgs];
        const { stdout, stderr } = await execAsync('thv ' + args.join(' '));
        log.info(`[ToolHive] - Server stdout:\n${stdout}`);
        log.info(`[ToolHive] - Server stderr:\n${stderr}`);
    }

    // thv stop fetch
    //
    // 1:55PM INF Stopping proxy process (PID: 40238)...
    // 1:55PM INF Proxy process stopped
    // 1:55PM INF Stopping container fetch...
    // 1:55PM INF Container fetch stopped
    //
    public static async stopServer(name: string): Promise<void> {
        try {
            await execAsync(`thv stop ${name}`);
        } catch (error) {
            throw new Error(`Failed to stop thv server: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public static async removeServer(name: string): Promise<void> {
        try {
            await execAsync(`thv rm ${name}`);
        } catch (error) {
            throw new Error(`Failed to remove thv server: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
