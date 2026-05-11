import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, type BaseMessage, ToolMessage } from '@langchain/core/messages';
import {
  Annotation,
  BaseCheckpointSaver,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
  messagesStateReducer,
} from '@langchain/langgraph';

import type { Agent } from '../../types/agent.js';
import type { Logger } from '../../types/common.js';
import type { ChatMessage, ChatSession, ToolCallApproval, ToolCallRequest } from '../../types/chat.js';
import type { ModelReply, Turn } from '../types.js';
import { ProviderHelper } from '../provider-helper.js';
import {
  appendApprovalMessagesToHistory,
  buildMcpLangChainTools,
  chatMessagesToBaseMessages,
  extractDisplayableAssistantText,
  extractUsage,
  materializeToolCallApprovals,
} from './langchain-chat-runner.js';
import {
  removalsForMessageCountWindow,
  resolveGraphMessageWindowMax,
  sliceMessagesForModelInput,
} from './langgraph-message-window.js';

export type RunLangGraphChatOptions = {
  /**
   * When set (e.g. one per live session), checkpoints reuse the same saver. Required for
   * graph-native tool approval: pending tools pause via `interrupt`, then an approval message
   * resumes with `Command({ resume })` on the same thread.
   */
  checkpointer?: BaseCheckpointSaver;
  /**
   * When true with a shared checkpointer: append only new LangChain messages for this turn
   * (see `graphAppendChatMessages`), except the first turn (empty checkpoint) which still primes
   * from the full `messages` array. Do not call `deleteThread` between turns.
   */
  useMessageDeltas?: boolean;
  /**
   * For delta **user** turns: reference/rule lines from `buildRequestContext` plus the new user message.
   * Ignored when the checkpoint is empty (prime) or when the last message is an approval (runner uses full `messages`).
   */
  graphAppendChatMessages?: ChatMessage[];
  /**
   * Max checkpointed LangChain `messages` (by **count**) kept across turns. Before each `call_model`
   * invoke, older messages are removed via `RemoveMessage` so the checkpointer stays bounded.
   * Default **100**. Omit or pass `undefined` to use the default.
   */
  graphMessageWindowMax?: number;
};

/** LangGraph state schema for TsAgent chat (module scope so node handlers share one type). */
const TsAgentChatState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  turnCount: Annotation<number>(),
  needsAnotherModelRound: Annotation<boolean>(),
  draftTurn: Annotation<Turn | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
});

type TsAgentChatStateSnapshot = typeof TsAgentChatState.State;
type TsAgentChatStateUpdate = typeof TsAgentChatState.Update;

type ChatSessionState = ReturnType<ChatSession['getState']>;

/** Immutable inputs built in {@link TsAgentLangGraphChatRun.create} (async-safe, no `!`). */
type TsAgentLangGraphChatRunInit = {
  rawChatModel: BaseChatModel;
  isApproval: boolean;
  useDelta: boolean;
  checkpointer: BaseCheckpointSaver;
  runnable: BaseChatModel;
  sessionState: ChatSessionState;
  messageWindowMax: number;
  invokeOptions: { maxTokens: number; temperature: number; topP: number };
  lcToolsLength: number;
  messages: ChatMessage[];
};

/**
 * One LangGraph-backed chat invocation: builds the graph, runs `invoke` / `Command.resume`,
 * and maps graph output into {@link ModelReply}.
 */
class TsAgentLangGraphChatRun {
  private readonly session: ChatSession;
  private readonly agent: Agent;
  private readonly logger: Logger;
  private readonly options: RunLangGraphChatOptions | undefined;
  private readonly rawChatModel: BaseChatModel;
  private readonly isApproval: boolean;
  private readonly useDelta: boolean;
  private readonly checkpointer: BaseCheckpointSaver;
  private readonly runnable: BaseChatModel;
  private readonly sessionState: ChatSessionState;
  private readonly messageWindowMax: number;
  private readonly invokeOptions: { maxTokens: number; temperature: number; topP: number };
  private readonly lcToolsLength: number;
  private readonly messages: ChatMessage[];
  /** Same object as {@link execute} uses for append-approval side effects and the catch path. */
  private readonly modelReply: ModelReply;
  /** Accumulated turns / pending tool calls; mutated from graph nodes during `invoke`. */
  private out: ModelReply;

  private constructor(
    session: ChatSession,
    agent: Agent,
    logger: Logger,
    options: RunLangGraphChatOptions | undefined,
    init: TsAgentLangGraphChatRunInit,
    modelReply: ModelReply
  ) {
    this.session = session;
    this.agent = agent;
    this.logger = logger;
    this.options = options;
    this.rawChatModel = init.rawChatModel;
    this.isApproval = init.isApproval;
    this.useDelta = init.useDelta;
    this.checkpointer = init.checkpointer;
    this.runnable = init.runnable;
    this.sessionState = init.sessionState;
    this.messageWindowMax = init.messageWindowMax;
    this.invokeOptions = init.invokeOptions;
    this.lcToolsLength = init.lcToolsLength;
    this.messages = init.messages;
    this.modelReply = modelReply;
    this.out = { timestamp: modelReply.timestamp, turns: [] };
  }

  static async create(
    session: ChatSession,
    agent: Agent,
    logger: Logger,
    model: BaseChatModel,
    messages: ChatMessage[],
    options?: RunLangGraphChatOptions
  ): Promise<TsAgentLangGraphChatRun> {
    const modelReply: ModelReply = {
      timestamp: Date.now(),
      turns: [],
    };

    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : undefined;
    const isApproval = Boolean(lastMsg && 'toolCallApprovals' in lastMsg);
    const useDelta = Boolean(options?.useMessageDeltas && options?.checkpointer);
    const checkpointer = options?.checkpointer ?? new MemorySaver();

    const { runnable, lcToolsLength } = await TsAgentLangGraphChatRun.bindRunnable(
      agent,
      session,
      logger,
      model
    );

    const sessionState = session.getState();
    const messageWindowMax = resolveGraphMessageWindowMax(options?.graphMessageWindowMax);

    logger.info(
      `[LangGraph] path session=${session.id} provider=${sessionState.currentModelProvider ?? '?'} model=${sessionState.currentModelId ?? '?'} ` +
        `threadCheckpoint=${options?.checkpointer ? 'shared' : 'ephemeral'} messageDeltas=${useDelta ? 'on' : 'off'} boundTools=${lcToolsLength} ` +
        `turn=${isApproval ? 'approval' : 'prompt'}`
    );

    const invokeOptions = {
      maxTokens: sessionState.maxOutputTokens,
      temperature: sessionState.temperature,
      topP: sessionState.topP,
    };

    const init: TsAgentLangGraphChatRunInit = {
      rawChatModel: model,
      isApproval,
      useDelta,
      checkpointer,
      runnable,
      sessionState,
      messageWindowMax,
      invokeOptions,
      lcToolsLength,
      messages,
    };

    return new TsAgentLangGraphChatRun(session, agent, logger, options, init, modelReply);
  }

  private static async bindRunnable(
    agent: Agent,
    session: ChatSession,
    logger: Logger,
    model: BaseChatModel
  ): Promise<{ runnable: BaseChatModel; lcToolsLength: number }> {
    const mcpTools = await ProviderHelper.getIncludedTools(agent, session);
    const lcTools = mcpTools.length > 0 ? buildMcpLangChainTools(agent, session, mcpTools) : [];
    const lcToolsLength = lcTools.length;

    let runnable: BaseChatModel = model;
    if (lcTools.length > 0) {
      const bindTools = (
        model as BaseChatModel & { bindTools?: (tools: unknown[], opts?: object) => BaseChatModel }
      ).bindTools;
      if (typeof bindTools === 'function') {
        runnable = bindTools.call(model, lcTools, { tool_choice: 'auto' }) as BaseChatModel;
      } else {
        logger.warn(
          '[LangGraph] Model has no bindTools(); MCP tools are not bound for this provider (chat only).'
        );
      }
    }
    return { runnable, lcToolsLength };
  }

  private static lastAiWithToolCalls(messages: BaseMessage[]): AIMessage | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (AIMessage.isInstance(m) && m.tool_calls && m.tool_calls.length > 0) {
        return m;
      }
    }
    return undefined;
  }

  async execute(): Promise<ModelReply> {
    try {
      const graph = this.compileGraph();
      const threadConfig = { configurable: { thread_id: this.session.id } } as const;

      const { resumeFromInterrupt, resumeApprovals, lcAppend } = await this.prepareInvokePayload(
        graph,
        threadConfig
      );

      this.out = {
        timestamp: this.modelReply.timestamp,
        turns: [...this.modelReply.turns],
        ...(this.modelReply.pendingToolCalls
          ? { pendingToolCalls: [...this.modelReply.pendingToolCalls] }
          : {}),
      };

      const invokeOpts = {
        ...threadConfig,
        recursionLimit: Math.max(2 * this.sessionState.maxChatTurns + 2, 32),
      };

      const finalState = resumeFromInterrupt
        ? await graph.invoke(new Command({ resume: resumeApprovals! }), invokeOpts)
        : await graph.invoke(
            {
              messages: lcAppend,
              turnCount: 0,
              needsAnotherModelRound: false,
              draftTurn: null,
            },
            invokeOpts
          );

      const outReply: ModelReply = {
        ...this.out,
        turns: [...this.out.turns],
        ...(this.out.pendingToolCalls ? { pendingToolCalls: [...this.out.pendingToolCalls] } : {}),
      };

      if (finalState.turnCount >= this.sessionState.maxChatTurns) {
        outReply.turns.push({ error: 'Maximum number of tool uses reached' });
      }

      if (outReply.pendingToolCalls?.length) {
        this.logger.info(
          `[LangGraph] tool approval: yielding to UI session=${this.session.id} pendingToolCalls=${outReply.pendingToolCalls.length} (graph interrupted until approvals)`
        );
      }

      return outReply;
    } catch (error: unknown) {
      this.logger.error('LangGraph chat error:', error instanceof Error ? error.message : error);
      this.modelReply.turns.push({
        error: `Error: Failed to generate response — ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      return this.modelReply;
    }
  }

  private compileGraph() {
    return new StateGraph(TsAgentChatState)
      .addNode('call_model', (state) => this.callModel(state))
      .addNode('apply_tools', (state) => this.applyTools(state))
      .addEdge(START, 'call_model')
      .addConditionalEdges('call_model', (state) => this.routeAfterModel(state), {
        tools: 'apply_tools',
        end: END,
      })
      .addConditionalEdges('apply_tools', (state) => this.routeAfterTools(state), {
        again: 'call_model',
        stop: END,
      })
      .compile({ checkpointer: this.checkpointer });
  }

  private async callModel(state: TsAgentChatStateSnapshot): Promise<Partial<TsAgentChatStateUpdate>> {
    if (state.turnCount >= this.sessionState.maxChatTurns) {
      this.out.turns.push({ error: 'Maximum number of tool uses reached' });
      return {
        needsAnotherModelRound: false,
        draftTurn: null,
      };
    }

    const nextTurnCount = state.turnCount + 1;

    const removals = removalsForMessageCountWindow(state.messages, this.messageWindowMax);
    const modelInput = sliceMessagesForModelInput(state.messages, this.messageWindowMax);
    if (removals.length > 0) {
      this.logger.info(
        `[LangGraph] message window: dropping ${removals.length} oldest checkpoint messages (cap=${this.messageWindowMax}, had=${state.messages.length})`
      );
    }

    this.logger.debug(
      `[LangGraph] call_model turn=${nextTurnCount}/${this.sessionState.maxChatTurns} lcMessages=${state.messages.length} modelInput=${modelInput.length}`
    );

    const response = await this.runnable.invoke(modelInput, this.invokeOptions as never);
    if (!AIMessage.isInstance(response)) {
      throw new Error('Unexpected message type from LangChain model');
    }

    const turn: Turn = { results: [] };
    extractUsage(response, turn);
    const displayText = extractDisplayableAssistantText(response.content);
    if (displayText) {
      turn.results!.push({ type: 'text', text: displayText });
    }

    const toolCalls = response.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      if (turn.results && turn.results.length > 0) {
        this.out.turns.push(turn);
      }
      return {
        messages: [...removals, response],
        turnCount: nextTurnCount,
        needsAnotherModelRound: false,
        draftTurn: null,
      };
    }

    return {
      messages: [...removals, response],
      turnCount: nextTurnCount,
      draftTurn: turn,
      needsAnotherModelRound: false,
    };
  }

  private async applyTools(state: TsAgentChatStateSnapshot): Promise<Partial<TsAgentChatStateUpdate>> {
    const lastAi = TsAgentLangGraphChatRun.lastAiWithToolCalls(state.messages);
    if (!lastAi?.tool_calls?.length) {
      return { needsAnotherModelRound: false, draftTurn: null };
    }

    const baseTurn: Turn =
      state.draftTurn != null
        ? {
            ...state.draftTurn,
            results: [...(state.draftTurn.results ?? [])],
            inputTokens: state.draftTurn.inputTokens,
            outputTokens: state.draftTurn.outputTokens,
          }
        : { results: [] };

    const toolMessages: ToolMessage[] = [];
    const pendingBatch: ToolCallRequest[] = [];

    for (const tc of lastAi.tool_calls) {
      const name = typeof tc.name === 'string' ? tc.name : String(tc.name);
      const toolServerName = ProviderHelper.getToolServerName(name);
      const toolToolName = ProviderHelper.getToolName(name);
      const args =
        typeof tc.args === 'object' && tc.args !== null ? (tc.args as Record<string, unknown>) : {};

      if (await this.session.isToolApprovalRequired(toolServerName, toolToolName)) {
        pendingBatch.push({
          serverName: toolServerName,
          toolName: toolToolName,
          args,
          toolCallId: tc.id,
        });
      } else {
        const toolResult = await ProviderHelper.callTool(this.agent, name, args, this.session);
        const first = toolResult.content[0];
        const resultText =
          first && first.type === 'text' && first.text ? first.text : JSON.stringify(toolResult.content);
        toolMessages.push(
          new ToolMessage({
            tool_call_id: tc.id!,
            content: resultText,
          })
        );
        baseTurn.results!.push({
          type: 'toolCall',
          toolCall: {
            serverName: toolServerName,
            toolName: toolToolName,
            args,
            toolCallId: tc.id,
            output: resultText,
            elapsedTimeMs: toolResult.elapsedTimeMs,
          },
        });
      }
    }

    if (pendingBatch.length > 0) {
      if (baseTurn.results && baseTurn.results.length > 0) {
        this.out.turns.push(baseTurn);
      }
      this.out.pendingToolCalls = [...pendingBatch];

      this.logger.info(
        `[LangGraph] tool approval: interrupt session=${this.session.id} pendingToolCalls=${pendingBatch.length} (graph pauses until Command.resume or transcript replay)`
      );

      const resumeApprovals = interrupt({ pendingToolCalls: [...pendingBatch] }) as ToolCallApproval[];
      const { toolResultMessages: approvalToolMsgs, turn: approvalTurn } = await materializeToolCallApprovals(
        this.session,
        this.agent,
        resumeApprovals
      );
      if (approvalTurn.results && approvalTurn.results.length > 0) {
        this.out.turns.push(approvalTurn);
      }
      toolMessages.push(...approvalToolMsgs);
      delete this.out.pendingToolCalls;

      return {
        messages: toolMessages,
        needsAnotherModelRound: Boolean(lastAi.tool_calls.length > 0),
        draftTurn: null,
      };
    }

    delete this.out.pendingToolCalls;

    if (baseTurn.results && baseTurn.results.length > 0) {
      this.out.turns.push(baseTurn);
    }

    return {
      messages: toolMessages,
      needsAnotherModelRound: Boolean(lastAi.tool_calls.length > 0),
      draftTurn: null,
    };
  }

  private routeAfterModel(state: TsAgentChatStateSnapshot): 'tools' | 'end' {
    const last = state.messages[state.messages.length - 1];
    if (AIMessage.isInstance(last) && last.tool_calls && last.tool_calls.length > 0) {
      return 'tools';
    }
    return 'end';
  }

  private routeAfterTools(state: TsAgentChatStateSnapshot): 'again' | 'stop' {
    return state.needsAnotherModelRound ? 'again' : 'stop';
  }

  private async prepareInvokePayload(
    graph: ReturnType<TsAgentLangGraphChatRun['compileGraph']>,
    threadConfig: { configurable: { thread_id: string } }
  ): Promise<{
    resumeFromInterrupt: boolean;
    resumeApprovals: ToolCallApproval[] | undefined;
    lcAppend: BaseMessage[];
  }> {
    const messages = this.messages;

    let resumeFromInterrupt = false;
    let resumeApprovals: ToolCallApproval[] | undefined;
    if (this.isApproval && this.options?.checkpointer && messages.length > 0) {
      const tail = messages[messages.length - 1];
      if ('toolCallApprovals' in tail && tail.toolCallApprovals.length > 0) {
        const interruptSnapshot = await graph.getState(threadConfig);
        resumeFromInterrupt = Boolean(
          interruptSnapshot.tasks?.some((t) => (t.interrupts?.length ?? 0) > 0)
        );
        if (resumeFromInterrupt) {
          resumeApprovals = tail.toolCallApprovals;
        }
      }
    }

    let lcAppend: BaseMessage[] = [];

    if (!resumeFromInterrupt) {
      if (this.isApproval) {
        this.logger.info(
          `[LangGraph] tool approval: transcript-replay session=${this.session.id} (appendApprovalMessagesToHistory; no graph interrupt on this thread)`
        );
      }
      if (this.useDelta) {
        const snapshot = await graph.getState(threadConfig);
        const prevLen = snapshot.values?.messages?.length ?? 0;

        if (prevLen === 0) {
          const historyMessages = this.isApproval ? messages.slice(0, -1) : messages;
          const lcBase = chatMessagesToBaseMessages(historyMessages);
          if (this.isApproval) {
            await appendApprovalMessagesToHistory(
              this.session,
              this.agent,
              messages,
              lcBase,
              this.modelReply,
              this.logger
            );
          }
          lcAppend = lcBase;
        } else if (this.isApproval) {
          const base = [...(snapshot.values!.messages as BaseMessage[])];
          const lenBefore = base.length;
          await appendApprovalMessagesToHistory(
            this.session,
            this.agent,
            messages,
            base,
            this.modelReply,
            this.logger
          );
          lcAppend = base.slice(lenBefore);
        } else {
          const append = this.options?.graphAppendChatMessages;
          if (!append?.length) {
            throw new Error(
              'runLangGraphChat: graphAppendChatMessages is required for delta user turns when the checkpoint is non-empty'
            );
          }
          lcAppend = chatMessagesToBaseMessages(append);
        }

        this.logger.info(
          `[LangGraph] delta append session=${this.session.id} prevMessages=${prevLen} appendLc=${lcAppend.length} approval=${this.isApproval}`
        );
      } else {
        const historyMessages = this.isApproval ? messages.slice(0, -1) : messages;
        const lcBase = chatMessagesToBaseMessages(historyMessages);
        if (this.isApproval) {
          await appendApprovalMessagesToHistory(
            this.session,
            this.agent,
            messages,
            lcBase,
            this.modelReply,
            this.logger
          );
        }
        lcAppend = lcBase;

        this.logger.info(
          `[LangGraph] chat invoke session=${this.session.id} provider=${this.sessionState.currentModelProvider ?? '?'} model=${this.sessionState.currentModelId ?? '?'} ` +
            `lcModel=${this.rawChatModel.constructor.name} lcMessages=${lcAppend.length} boundLcTools=${this.lcToolsLength}`
        );
      }
    } else {
      this.logger.info(
        `[LangGraph] tool approval: Command.resume session=${this.session.id} approvals=${resumeApprovals?.length ?? 0} (continuing after interrupt)`
      );
    }

    return { resumeFromInterrupt, resumeApprovals, lcAppend };
  }
}

/**
 * LangGraph-backed chat: session, tools, approval, and `ModelReply` mapping.
 * With `useMessageDeltas` + session checkpointer, only **new** messages are appended each turn; the first turn
 * still primes the thread from the full payload (system + transcript + refs/rules + user).
 */
export async function runLangGraphChat(
  session: ChatSession,
  agent: Agent,
  logger: Logger,
  model: BaseChatModel,
  messages: ChatMessage[],
  options?: RunLangGraphChatOptions
): Promise<ModelReply> {
  const runner = await TsAgentLangGraphChatRun.create(session, agent, logger, model, messages, options);
  return runner.execute();
}
