import { isInterceptorOnlyHost, getMcpServerRole } from '../src/mcp/interceptor-host.js';
import type { McpClient } from '../src/mcp/types.js';

function mockClient(partial: Partial<McpClient>): McpClient {
  return {
    serverVersion: null,
    serverTools: [],
    connect: async () => true,
    disconnect: async () => {},
    callTool: async () => ({ content: [], elapsedTimeMs: 0 }),
    cleanup: async () => {},
    getErrorLog: () => [],
    isConnected: () => true,
    ping: async () => ({ elapsedTimeMs: 0 }),
    ...partial,
  };
}

describe('interceptor-host', () => {
  it('isInterceptorOnlyHost when host has no tools', () => {
    const client = mockClient({
      interceptorHost: { isInterceptorHost: true, interceptors: [], supportedEvents: [] },
      serverTools: [],
    });
    expect(isInterceptorOnlyHost(client)).toBe(true);
  });

  it('is not interceptor-only when host has tools', () => {
    const client = mockClient({
      interceptorHost: { isInterceptorHost: true, interceptors: [], supportedEvents: [] },
      serverTools: [{ name: 't', description: 'd', inputSchema: { type: 'object' } }],
    });
    expect(isInterceptorOnlyHost(client)).toBe(false);
    expect(getMcpServerRole(client)).toBe('tools_and_interceptor');
  });

  it('getMcpServerRole tools for normal server', () => {
    const client = mockClient({ serverTools: [{ name: 't', description: 'd', inputSchema: { type: 'object' } }] });
    expect(getMcpServerRole(client)).toBe('tools');
  });
});
