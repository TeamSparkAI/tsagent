import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { listInterceptors } from '@ext-modelcontextprotocol/interceptors';
import type { InterceptorHostInfo } from './interceptor-types.js';

/** Bridge duplicate @modelcontextprotocol/sdk installs (file: linked interceptors package). */
function asInterceptorSdkClient(client: Client): Parameters<typeof listInterceptors>[0] {
  return client as unknown as Parameters<typeof listInterceptors>[0];
}

export function buildInterceptorHostInfo(interceptors: InterceptorHostInfo['interceptors']): InterceptorHostInfo {
  const supportedEvents = new Set<string>();
  for (const interceptor of interceptors) {
    for (const hook of interceptor.hooks) {
      for (const ev of hook.events) {
        supportedEvents.add(ev);
      }
    }
  }
  return {
    isInterceptorHost: true,
    interceptors,
    supportedEvents: [...supportedEvents],
  };
}

export async function probeInterceptorHost(mcpClient: Client): Promise<InterceptorHostInfo | null> {
  try {
    const listed = await listInterceptors(asInterceptorSdkClient(mcpClient));
    return buildInterceptorHostInfo(listed.interceptors);
  } catch {
    return null;
  }
}
