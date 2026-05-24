/** Jest stub — integration tests do not run live interceptor hosts. */

export const InterceptionEvents = {
  ToolsCall: 'tools/call',
};

export async function executeInterceptorChainOnClients(
  _hosts: unknown[],
  params: { payload?: unknown }
): Promise<{ status: 'success'; finalPayload?: unknown }> {
  return { status: 'success', finalPayload: params.payload };
}

export function throwChainFailure(): never {
  throw new Error('chain failure');
}

export class McpInterceptorValidationException extends Error {
  validationMessages: unknown[] = [];
}

export class McpInterceptorChainException extends Error {}

export async function listInterceptors(): Promise<{ interceptors: [] }> {
  return { interceptors: [] };
}
