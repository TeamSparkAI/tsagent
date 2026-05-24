import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  InterceptionEvents,
  executeInterceptorChainOnClients,
  throwChainFailure,
  McpInterceptorChainException,
  McpInterceptorValidationException,
} from '@ext-modelcontextprotocol/interceptors';
import type {
  InterceptorPhase,
  InvokeInterceptorContext,
} from '@ext-modelcontextprotocol/interceptors';
import type { CallToolResult } from './types.js';
import { CallToolResultWithElapsedTime, Tool } from './types.js';
import { ChatSession } from '../types/chat.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';

type InterceptorSdkClient = Parameters<typeof executeInterceptorChainOnClients>[0][number]['client'];

interface ResolvedInterceptorHost {
  serverName: string;
  client: InterceptorSdkClient;
}

function buildInterceptorContext(
  session: ChatSession | undefined,
  backendServerName: string,
  toolName: string
): InvokeInterceptorContext {
  return {
    principal: {
      type: 'service',
      id: 'tsagent',
    },
    sessionId: session?.id,
    timestamp: new Date().toISOString(),
    traceId: `${backendServerName}:${toolName}:${Date.now()}`,
  };
}

function stripElapsedTime(result: CallToolResultWithElapsedTime): CallToolResult {
  const { elapsedTimeMs: _elapsed, ...mcpResult } = result;
  return mcpResult;
}

function errorToolResult(message: string, elapsedTimeMs = 0): CallToolResultWithElapsedTime {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
    elapsedTimeMs,
  };
}

function formatInterceptorFailure(err: unknown): string {
  if (err instanceof McpInterceptorValidationException) {
    return err.message;
  }
  if (err instanceof McpInterceptorChainException) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function asInterceptorSdkClient(client: Client): InterceptorSdkClient {
  return client as unknown as InterceptorSdkClient;
}

/** Connected interceptor hosts in mcpServers declaration order. */
export function resolveInterceptorHosts(agent: Agent): ResolvedInterceptorHost[] {
  const mcpServers = agent.getAgentMcpServers() ?? {};
  const syncClients = agent.getAllMcpClientsSync();
  const hosts: ResolvedInterceptorHost[] = [];

  for (const serverName of Object.keys(mcpServers)) {
    const client = syncClients[serverName];
    if (!client?.interceptorHost?.isInterceptorHost) {
      continue;
    }
    if (!client.isConnected()) {
      throw new Error(`Interceptor host "${serverName}" is not connected`);
    }
    const sdk = client.getMcpSdkClient?.();
    if (!sdk) {
      throw new Error(`Interceptor host "${serverName}" has no MCP SDK client`);
    }
    hosts.push({ serverName, client: asInterceptorSdkClient(sdk) });
  }

  return hosts;
}

/**
 * Run one chain phase via SDK {@link executeInterceptorChainOnClients}
 * (multi-host list/merge + SEP-ordered {@link executeInterceptorChain}).
 */
async function runAggregatedChainPhaseOrThrow(
  hosts: ResolvedInterceptorHost[],
  operation: string,
  event: string,
  phase: InterceptorPhase,
  payload: unknown,
  context: InvokeInterceptorContext
): Promise<unknown> {
  if (hosts.length === 0) {
    return payload;
  }

  const chainResult = await executeInterceptorChainOnClients(
    hosts.map((h) => ({ client: h.client, label: h.serverName })),
    {
      event,
      phase,
      payload,
      context,
    },
    { duplicateNamePolicy: 'first-wins' }
  );

  if (chainResult.status !== 'success') {
    throwChainFailure(operation, phase, chainResult.status, chainResult);
  }

  return chainResult.finalPayload ?? payload;
}

export async function runToolCallWithInterceptors(
  agent: Agent,
  backendServerName: string,
  tool: Tool,
  backendClient: { callTool: (tool: Tool, args?: Record<string, unknown>, session?: ChatSession) => Promise<CallToolResultWithElapsedTime> },
  args: Record<string, unknown> | undefined,
  session: ChatSession | undefined,
  logger?: Logger
): Promise<CallToolResultWithElapsedTime> {
  let hosts: ResolvedInterceptorHost[];
  try {
    hosts = resolveInterceptorHosts(agent);
  } catch (err) {
    return errorToolResult(formatInterceptorFailure(err));
  }

  if (hosts.length === 0) {
    return backendClient.callTool(tool, args, session);
  }

  const context = buildInterceptorContext(session, backendServerName, tool.name);
  const callParams = { name: tool.name, arguments: args ?? {} };
  let requestPayload: unknown = callParams;

  try {
    requestPayload = await runAggregatedChainPhaseOrThrow(
      hosts,
      'tools/call',
      InterceptionEvents.ToolsCall,
      'request',
      requestPayload,
      context
    );
  } catch (err) {
    logger?.warn?.(`[interceptors] request phase failed for ${backendServerName}/${tool.name}:`, err);
    return errorToolResult(formatInterceptorFailure(err));
  }

  const mutated =
    typeof requestPayload === 'object' &&
    requestPayload !== null &&
    'name' in requestPayload
      ? (requestPayload as { name: string; arguments?: Record<string, unknown> })
      : callParams;

  const backendResult = await backendClient.callTool(
    { ...tool, name: mutated.name },
    mutated.arguments ?? args,
    session
  );

  let responsePayload: unknown = stripElapsedTime(backendResult);

  try {
    responsePayload = await runAggregatedChainPhaseOrThrow(
      hosts,
      'tools/call',
      InterceptionEvents.ToolsCall,
      'response',
      responsePayload,
      context
    );
  } catch (err) {
    logger?.warn?.(`[interceptors] response phase failed for ${backendServerName}/${tool.name}:`, err);
    logger?.debug?.('[interceptors] backend result retained in logs only', backendResult);
    return errorToolResult(formatInterceptorFailure(err), backendResult.elapsedTimeMs);
  }

  return {
    ...(responsePayload as CallToolResult),
    elapsedTimeMs: backendResult.elapsedTimeMs,
  };
}
