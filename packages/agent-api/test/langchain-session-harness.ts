import type { McpClient } from '../src/mcp/types.js';
import type { Tool } from '../src/mcp/types.js';
import type { Agent } from '../src/types/agent.js';
import type { McpServerEntry, McpServerConfig } from '../src/mcp/types.js';
import type { ChatSession, ChatMessage, ChatState, MessageUpdate } from '../src/types/chat.js';
import type { SessionToolPermission } from '../src/types/agent.js';
import type { Logger } from '../src/types/common.js';

const echoTool: Tool = {
  name: 'echo',
  description: 'Fixture tool: echoes args as JSON text',
  inputSchema: {
    type: 'object',
    properties: {
      msg: { type: 'string', description: 'payload' },
    },
    required: [],
  },
};

/**
 * In-process MCP client for LangChain session tests (no stdio / network).
 */
export class FixtureEchoMcpClient implements McpClient {
  serverVersion = { name: 'fixture', version: '0.0.0' };
  serverTools: Tool[] = [echoTool];

  async connect(): Promise<boolean> {
    return true;
  }
  async disconnect(): Promise<void> {}
  async cleanup(): Promise<void> {}
  getErrorLog(): string[] {
    return [];
  }
  isConnected(): boolean {
    return true;
  }
  async ping(): Promise<{ elapsedTimeMs: number }> {
    return { elapsedTimeMs: 0 };
  }

  async callTool(
    tool: Tool,
    args?: Record<string, unknown>,
    _session?: ChatSession
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; elapsedTimeMs: number }> {
    const text = `FIXTURE_TOOL:${tool.name}:${JSON.stringify(args ?? {})}`;
    return { content: [{ type: 'text', text }], elapsedTimeMs: 0 };
  }
}

export const noopLogger: Logger = {
  info(): void {},
  warn(): void {},
  error(): void {},
  debug(): void {},
};

export type HarnessOptions = {
  /** When true, `fixture:echo` is in session context so `getIncludedTools` returns it. */
  includeFixtureEchoTool: boolean;
  toolPermission: SessionToolPermission;
  autonomous?: boolean;
  fixtureModelId: string;
};

/**
 * Minimal {@link Agent} for LangGraph chat / `ProviderHelper` tests.
 */
export class LangChainTestAgent implements Pick<
  Agent,
  'getAllMcpClients' | 'getAllMcpClientsSync' | 'getMcpClient' | 'getMcpServer' | 'getAgentMcpServers'
> {
  readonly client: FixtureEchoMcpClient;

  constructor(client: FixtureEchoMcpClient = new FixtureEchoMcpClient()) {
    this.client = client;
  }

  async getAllMcpClients(): Promise<Record<string, McpClient>> {
    return { fixture: this.client };
  }

  getAllMcpClientsSync(): Record<string, McpClient> {
    return { fixture: this.client };
  }

  getAgentMcpServers(): Record<string, McpServerConfig> | null {
    const entry = this.getMcpServer('fixture');
    return entry ? { fixture: entry.config } : null;
  }

  async getMcpClient(name: string): Promise<McpClient | undefined> {
    return name === 'fixture' ? this.client : undefined;
  }

  getMcpServer(name: string): McpServerEntry | null {
    if (name !== 'fixture') return null;
    return {
      name: 'fixture',
      config: {
        type: 'stdio',
        command: 'noop',
        args: [],
        serverToolDefaults: { permissionRequired: false },
      },
    };
  }
}

/**
 * Minimal {@link ChatSession} for `runLangGraphChat` tests (not full `ChatSessionImpl`).
 */
export class LangChainTestSession implements ChatSession {
  readonly id = 'langchain-test-session';

  private readonly opts: HarnessOptions;

  constructor(opts: HarnessOptions) {
    this.opts = opts;
  }

  get autonomous(): boolean {
    return this.opts.autonomous ?? false;
  }

  getState(): ChatState {
    return {
      messages: [],
      lastSyncId: 0,
      currentModelProvider: 'test',
      currentModelId: this.opts.fixtureModelId,
      contextItems: [],
      autonomous: this.autonomous,
      maxChatTurns: 10,
      maxOutputTokens: 1024,
      temperature: 0,
      topP: 1,
      toolPermission: this.opts.toolPermission,
      contextTopK: 5,
      contextTopN: 3,
      contextIncludeScore: 0.7,
    };
  }

  getLastRequestContext() {
    return undefined;
  }

  getIncludedTools(): Array<{ serverName: string; toolName: string }> {
    if (!this.opts.includeFixtureEchoTool) return [];
    return [{ serverName: 'fixture', toolName: 'echo' }];
  }

  async syncAlwaysIncludeTools(): Promise<void> {}

  async isToolApprovalRequired(_serverId: string, _toolId: string): Promise<boolean> {
    if (this.autonomous) return false;
    if (this.opts.toolPermission === 'always') return true;
    if (this.opts.toolPermission === 'never') return false;
    // 'tool' — use server defaults (fixture server marks tools not required)
    return false;
  }

  toolIsApprovedForSession(_serverId: string, _toolId: string): void {}

  async handleMessage(_message: string | ChatMessage): Promise<MessageUpdate> {
    throw new Error('LangChainTestSession.handleMessage not used in harness tests');
  }

  setAutonomous(_autonomous: boolean): boolean {
    throw new Error('unimplemented');
  }
  clearModel(): MessageUpdate {
    throw new Error('unimplemented');
  }
  switchModel(_modelType: string, _modelId: string): MessageUpdate {
    throw new Error('unimplemented');
  }
  addReference(_referenceName: string): boolean {
    throw new Error('unimplemented');
  }
  removeReference(_referenceName: string): boolean {
    throw new Error('unimplemented');
  }
  addRule(_ruleName: string): boolean {
    throw new Error('unimplemented');
  }
  removeRule(_ruleName: string): boolean {
    throw new Error('unimplemented');
  }
  async addTool(_serverName: string, _toolName: string): Promise<boolean> {
    throw new Error('unimplemented');
  }
  removeTool(_serverName: string, _toolName: string): boolean {
    throw new Error('unimplemented');
  }
  updateSettings(_settings: {
    maxChatTurns: number;
    maxOutputTokens: number;
    temperature: number;
    topP: number;
    toolPermission: SessionToolPermission;
    contextTopK: number;
    contextTopN: number;
    contextIncludeScore: number;
  }): boolean {
    throw new Error('unimplemented');
  }
}
