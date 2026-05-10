import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { tool, type StructuredToolInterface, type ToolSchemaBase } from '@langchain/core/tools';

import type { Agent } from '../../types/agent.js';
import type { Logger } from '../../types/common.js';
import type { ChatMessage, ChatSession, ToolCallApproval } from '../../types/chat.js';
import type { ModelReply, Turn } from '../types.js';
import type { Tool } from '../../mcp/types.js';
import { ProviderHelper } from '../provider-helper.js';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Content block `type` values that are not assistant prose (tool routing lives in `tool_calls`). */
const NON_TEXT_ASSISTANT_BLOCK_TYPES = new Set([
  'tool_call',
  'tool_call_chunk',
  'invalid_tool_call',
  'server_tool_call',
  'server_tool_call_chunk',
  'server_tool_call_result',
  'tool_use',
  'functionCall',
  'function_call',
]);

/**
 * Text to show in TsAgent `Turn` results — only real prose, never JSON.stringify of structured blocks.
 * Gemini and others put `functionCall` / tool-like entries in `AIMessage.content` alongside `tool_calls`.
 */
export function extractDisplayableAssistantText(content: unknown): string {
  if (content == null || content === '') {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (typeof block === 'string') {
        if (block) parts.push(block);
        continue;
      }
      if (!isPlainObject(block)) {
        continue;
      }
      const t = block.type;
      if (typeof t === 'string' && NON_TEXT_ASSISTANT_BLOCK_TYPES.has(t)) {
        continue;
      }
      if (block.functionCall != null) {
        continue;
      }
      if (t === 'text' && typeof block.text === 'string') {
        parts.push(block.text);
      }
    }
    return parts.join('');
  }
  if (isPlainObject(content) && content.type === 'text' && typeof content.text === 'string') {
    return content.text;
  }
  return '';
}

/** JSON Schema keywords MCP may emit that some tool APIs (e.g. Google GenAI) reject. */
const JSON_SCHEMA_STRIP_KEYS = new Set(['$schema', 'propertyNames', 'unevaluatedProperties', 'patternProperties']);

/**
 * Deep-clone MCP {@link Tool.inputSchema} for LangChain `tool({ schema })`.
 * Uses the server's JSON Schema (not `z.record()`, which becomes `propertyNames` and breaks Gemini).
 */
function mcpInputSchemaToLangChainJsonSchema(tool: Tool): ToolSchemaBase {
  const raw = tool.inputSchema;
  const stripped = stripJsonSchemaKeys(raw);
  const obj = isPlainObject(stripped) ? stripped : {};
  if (obj.type === undefined && isPlainObject(obj.properties)) {
    obj.type = 'object';
  }
  if (obj.type === undefined) {
    obj.type = 'object';
  }
  if (!isPlainObject(obj.properties)) {
    obj.properties = {};
  }
  return obj as ToolSchemaBase;
}

function stripJsonSchemaKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((x) => stripJsonSchemaKeys(x));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (JSON_SCHEMA_STRIP_KEYS.has(k)) {
      continue;
    }
    if (k === 'properties' && isPlainObject(v)) {
      out[k] = Object.fromEntries(
        Object.entries(v).map(([pk, pv]) => [pk, stripJsonSchemaKeys(pv)])
      );
      continue;
    }
    if ((k === 'items' || k === 'additionalProperties') && isPlainObject(v)) {
      out[k] = stripJsonSchemaKeys(v);
      continue;
    }
    if ((k === 'anyOf' || k === 'oneOf' || k === 'allOf') && Array.isArray(v)) {
      out[k] = v.map((x) => stripJsonSchemaKeys(x));
      continue;
    }
    if ((k === 'definitions' || k === '$defs') && isPlainObject(v)) {
      out[k] = Object.fromEntries(
        Object.entries(v).map(([dk, dv]) => [dk, stripJsonSchemaKeys(dv)])
      );
      continue;
    }
    out[k] = stripJsonSchemaKeys(v);
  }
  return out;
}

export function buildMcpLangChainTools(
  agent: Agent,
  session: ChatSession,
  mcpTools: Tool[]
): StructuredToolInterface[] {
  return mcpTools.map((t) =>
    tool(
      async (input: Record<string, unknown>) => {
        const toolResult = await ProviderHelper.callTool(agent, t.name, input, session);
        const first = toolResult.content[0];
        if (first && first.type === 'text') return first.text;
        return JSON.stringify(toolResult.content ?? []);
      },
      {
        name: t.name,
        description: t.description || `MCP tool ${t.name}`,
        schema: mcpInputSchemaToLangChainJsonSchema(t),
      }
    )
  );
}

/**
 * Convert TsAgent chat messages (plus optional trailing approval message) into LangChain
 * message list, mirroring the OpenAI provider's history assembly.
 */
type LcToolCallChunk = {
  id?: string;
  name: string;
  args: Record<string, any>;
  type?: 'tool_call';
};

export function chatMessagesToBaseMessages(messages: ChatMessage[]): BaseMessage[] {
  const turnMessages: BaseMessage[] = [];

  for (const message of messages) {
    if ('modelReply' in message) {
      if (message.modelReply.turns.length === 0) {
        continue;
      }
      for (const turn of message.modelReply.turns) {
        const textParts: string[] = [];
        const toolCallsLc: LcToolCallChunk[] = [];

        if (turn.results) {
          for (const result of turn.results) {
            if (result.type === 'text') {
              textParts.push(result.text);
            } else if (result.type === 'toolCall') {
              toolCallsLc.push({
                id: result.toolCall.toolCallId!,
                name: `${result.toolCall.serverName}_${result.toolCall.toolName}`,
                args: (result.toolCall.args ?? {}) as Record<string, any>,
                type: 'tool_call',
              });
            }
          }
        }

        const content = textParts.join('') || turn.error || '';
        turnMessages.push(
          new AIMessage({
            content,
            tool_calls: toolCallsLc.length > 0 ? toolCallsLc : undefined,
          })
        );

        if (turn.results) {
          for (const result of turn.results) {
            if (result.type === 'toolCall') {
              turnMessages.push(
                new ToolMessage({
                  tool_call_id: result.toolCall.toolCallId!,
                  content: result.toolCall.output,
                })
              );
            }
          }
        }
      }
    } else if (message.role !== 'approval') {
      if (message.role === 'system') {
        turnMessages.push(new SystemMessage(message.content));
      } else if (message.role === 'user') {
        turnMessages.push(new HumanMessage(message.content));
      } else if (message.role === 'error') {
        turnMessages.push(new HumanMessage(message.content));
      }
    }
  }

  return turnMessages;
}

/**
 * Run approved/denied tool calls and build LangChain messages (shared by transcript replay and LangGraph interrupt resume).
 */
export async function materializeToolCallApprovals(
  session: ChatSession,
  agent: Agent,
  toolCallApprovals: ToolCallApproval[]
): Promise<{
  toolCallsLc: LcToolCallChunk[];
  toolResultMessages: ToolMessage[];
  turn: Turn;
}> {
  const toolCallsLc: LcToolCallChunk[] = [];
  const toolResultMessages: ToolMessage[] = [];
  const turn: Turn = { results: [] };

  for (const toolCallApproval of toolCallApprovals) {
    const functionName = `${toolCallApproval.serverName}_${toolCallApproval.toolName}`;
    toolCallsLc.push({
      id: toolCallApproval.toolCallId!,
      name: functionName,
      args: (toolCallApproval.args ?? {}) as Record<string, any>,
      type: 'tool_call',
    });

    if (toolCallApproval.decision === 'allow-session') {
      session.toolIsApprovedForSession(toolCallApproval.serverName, toolCallApproval.toolName);
    }
    if (toolCallApproval.decision === 'allow-session' || toolCallApproval.decision === 'allow-once') {
      const toolResult = await ProviderHelper.callTool(
        agent,
        functionName,
        toolCallApproval.args,
        session
      );
      const firstContent = toolResult.content[0];
      const resultText =
        firstContent && firstContent.type === 'text' && firstContent.text
          ? firstContent.text
          : 'Tool executed successfully';
      turn.results!.push({
        type: 'toolCall',
        toolCall: {
          serverName: toolCallApproval.serverName,
          toolName: toolCallApproval.toolName,
          args: toolCallApproval.args,
          toolCallId: toolCallApproval.toolCallId,
          output: resultText,
          elapsedTimeMs: toolResult.elapsedTimeMs,
        },
      });
      toolResultMessages.push(
        new ToolMessage({
          tool_call_id: toolCallApproval.toolCallId!,
          content: resultText,
        })
      );
    } else if (toolCallApproval.decision === 'deny') {
      turn.results!.push({
        type: 'toolCall',
        toolCall: {
          serverName: toolCallApproval.serverName,
          toolName: toolCallApproval.toolName,
          args: toolCallApproval.args,
          toolCallId: toolCallApproval.toolCallId,
          output: 'Tool call denied',
          elapsedTimeMs: 0,
          error: 'Tool call denied',
        },
      });
      toolResultMessages.push(
        new ToolMessage({
          tool_call_id: toolCallApproval.toolCallId!,
          content: 'Tool call denied',
        })
      );
    }
  }

  return { toolCallsLc, toolResultMessages, turn };
}

/**
 * Append assistant tool-call skeleton + tool results for an approval message (transcript replay when the graph
 * thread has no pending interrupt, e.g. no shared checkpointer).
 */
export async function appendApprovalMessagesToHistory(
  session: ChatSession,
  agent: Agent,
  messages: ChatMessage[],
  lcMessages: BaseMessage[],
  modelReply: ModelReply,
  _logger: Logger
): Promise<void> {
  const last = messages[messages.length - 1];
  if (!last || !('toolCallApprovals' in last)) return;

  const { toolCallsLc, toolResultMessages, turn } = await materializeToolCallApprovals(
    session,
    agent,
    last.toolCallApprovals
  );

  if (turn.results && turn.results.length > 0) {
    modelReply.turns.push(turn);
  }
  if (toolCallsLc.length > 0) {
    lcMessages.push(new AIMessage({ content: '', tool_calls: toolCallsLc }));
    lcMessages.push(...toolResultMessages);
  }
}

export function extractUsage(aimessage: AIMessage, turn: Turn): void {
  const meta = aimessage.usage_metadata;
  if (meta) {
    turn.inputTokens = meta.input_tokens;
    turn.outputTokens = meta.output_tokens;
  }
}
