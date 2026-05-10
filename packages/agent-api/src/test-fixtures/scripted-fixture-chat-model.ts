import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { toJsonSchema } from '@langchain/core/utils/json_schema';

/**
 * How the scripted model behaves on each LangChain `invoke` (full `bindTools` + `_generate` path).
 *
 * - **echo_last_human** — Returns assistant text `ECHO:<last human content>` (no tool_calls).
 * - **tool_then_done** — First call with bound tools returns a single `fixture_echo` tool_call;
 *   after a `ToolMessage` is present, returns plain text `done_after_tool`.
 */
export type ScriptedFixtureMode = 'echo_last_human' | 'tool_then_done';

export type ScriptedFixtureChatModelFields = BaseChatModelParams & {
  mode: ScriptedFixtureMode;
};

/**
 * Real {@link BaseChatModel} used in tests and via `providerId: "test"` + `modelId` `fixture:…`
 * so we exercise LangChain `bindTools`, message types, and the runner — not vendor HTTP.
 */
export class ScriptedFixtureChatModel extends BaseChatModel {
  mode: ScriptedFixtureMode;

  /** Last message list passed to `_generate` (after LangChain prep). */
  lastReceivedMessages: BaseMessage[] = [];

  /** Number of `_generate` invocations (each runner `invoke` counts once). */
  invokeCount = 0;

  constructor(fields: ScriptedFixtureChatModelFields) {
    super(fields);
    this.mode = fields.mode;
  }

  /**
   * Production chat models expose `bindTools`; core {@link BaseChatModel} does not.
   * Testing fakes use `withConfig({ tools })` so bound `invoke` works — mirror that here
   * so LangGraph / `runLangGraphChat` can bind MCP tools without HTTP.
   */
  bindTools(tools: StructuredToolInterface[]) {
    const toolDicts = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description ?? `Tool ${t.name}`,
        parameters: toJsonSchema(t.schema),
      },
    }));
    const next = new ScriptedFixtureChatModel({ mode: this.mode });
    // Runtime matches {@link FakeListChatModel#bindTools}; call options typing omits `tools`.
    return next.withConfig({ tools: toolDicts } as never);
  }

  _llmType(): string {
    return 'tsagent_scripted_fixture';
  }

  async _generate(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    this.lastReceivedMessages = messages;
    this.invokeCount += 1;

    if (this.mode === 'echo_last_human') {
      const lastHuman = [...messages].reverse().find((m) => HumanMessage.isInstance(m));
      const raw = lastHuman?.content;
      const text =
        typeof raw === 'string' ? `ECHO:${raw}` : raw != null ? `ECHO:${JSON.stringify(raw)}` : 'ECHO:';
      const message = new AIMessage(text);
      return { generations: [{ text: message.content as string, message }] };
    }

    if (this.mode === 'tool_then_done') {
      const hasFixtureToolResult = messages.some(
        (m) => ToolMessage.isInstance(m) && m.tool_call_id === 'fixture-tool-call-1'
      );
      if (hasFixtureToolResult) {
        const message = new AIMessage('done_after_tool');
        return { generations: [{ text: message.content as string, message }] };
      }
      const message = new AIMessage({
        content: '',
        tool_calls: [
          {
            id: 'fixture-tool-call-1',
            name: 'fixture_echo',
            args: { msg: 'from-fixture-model' },
            type: 'tool_call' as const,
          },
        ],
      });
      return { generations: [{ text: '', message }] };
    }

    const exhaustive: never = this.mode;
    throw new Error(`Unhandled ScriptedFixtureMode: ${String(exhaustive)}`);
  }
}
