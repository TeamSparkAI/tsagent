import type { McpClient } from './types.js';
import type { InterceptorHostInfo, McpServerRole } from './interceptor-types.js';

export function isInterceptorOnlyHost(client: McpClient): boolean {
  return Boolean(
    client.interceptorHost?.isInterceptorHost && client.serverTools.length === 0
  );
}

export function getMcpServerRole(client: McpClient): McpServerRole {
  const isHost = client.interceptorHost?.isInterceptorHost ?? false;
  const hasTools = client.serverTools.length > 0;
  if (isHost && hasTools) {
    return 'tools_and_interceptor';
  }
  if (isHost) {
    return 'interceptor';
  }
  return 'tools';
}

export function formatInterceptorHooks(info: InterceptorHostInfo, interceptorName: string): string {
  const interceptor = info.interceptors.find((i) => i.name === interceptorName);
  if (!interceptor) {
    return '';
  }
  return interceptor.hooks
    .map((h) => `${h.events.join(', ')} · ${h.phase}`)
    .join('; ');
}
