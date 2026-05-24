import type { Interceptor } from '@ext-modelcontextprotocol/interceptors';

export type { Interceptor };

export interface InterceptorHostInfo {
  isInterceptorHost: boolean;
  interceptors: Interceptor[];
  supportedEvents: string[];
}

export type McpServerRole = 'tools' | 'interceptor' | 'tools_and_interceptor';
