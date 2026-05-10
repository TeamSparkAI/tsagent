import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Agent } from '../src/types/agent.js';
import type { ChatMessage } from '../src/types/chat.js';
import type { ModelReply } from '../src/providers/types.js';

import { MemorySaver } from '@langchain/langgraph';

import TestProviderDescriptor from '../src/providers/test-provider.js';
import { runLangGraphChat } from '../src/providers/langchain/langgraph-chat-runner.js';
import {
  LangChainTestAgent,
  LangChainTestSession,
  noopLogger,
} from './langchain-session-harness.js';

async function createFixtureChatModel(agent: Agent, fixtureModelId: string): Promise<BaseChatModel> {
  const descriptor = new TestProviderDescriptor('');
  return descriptor.createChatModel(agent, noopLogger, {}, fixtureModelId);
}

function collectModelReplyText(reply: ModelReply): string {
  const parts: string[] = [];
  for (const turn of reply.turns) {
    for (const r of turn.results ?? []) {
      if (r.type === 'text') parts.push(r.text);
    }
  }
  return parts.join('');
}

function getToolCallResults(reply: ModelReply) {
  return reply.turns.flatMap((t) => t.results?.filter((r) => r.type === 'toolCall') ?? []);
}

describe('runLangGraphChat (integration)', () => {
  const testAgent = () => new LangChainTestAgent() as unknown as Agent;

  it('echo path: scripted model returns ECHO of last human', async () => {
    const agent = testAgent();
    const session = new LangChainTestSession({
      includeFixtureEchoTool: false,
      toolPermission: 'never',
      fixtureModelId: 'fixture:echo_last_human',
    });
    const model = await createFixtureChatModel(agent, 'fixture:echo_last_human');

    const reply = await runLangGraphChat(session, agent, noopLogger, model, [
      { role: 'user', content: 'hello fixture' },
    ]);

    expect(collectModelReplyText(reply)).toContain('ECHO:hello fixture');
    expect(getToolCallResults(reply)).toHaveLength(0);
  });

  it('tool path: model requests echo tool, runner executes MCP and returns final text', async () => {
    const agent = testAgent();
    const session = new LangChainTestSession({
      includeFixtureEchoTool: true,
      toolPermission: 'never',
      fixtureModelId: 'fixture:tool_then_done',
    });
    const model = await createFixtureChatModel(agent, 'fixture:tool_then_done');

    const reply = await runLangGraphChat(session, agent, noopLogger, model, [
      { role: 'user', content: 'run tool' },
    ]);

    expect(collectModelReplyText(reply)).toBe('done_after_tool');
    const toolCalls = getToolCallResults(reply);
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    const echoCall = toolCalls.find((c) => c.toolCall.toolName === 'echo');
    expect(echoCall).toBeDefined();
    expect(echoCall!.toolCall.output).toContain('FIXTURE_TOOL:echo');
  });

  it('approval path: first round returns pending; after approval message, tool runs and model finishes', async () => {
    const agent = testAgent();
    const session = new LangChainTestSession({
      includeFixtureEchoTool: true,
      toolPermission: 'always',
      fixtureModelId: 'fixture:tool_then_done',
    });
    const model = await createFixtureChatModel(agent, 'fixture:tool_then_done');

    const first = await runLangGraphChat(session, agent, noopLogger, model, [
      { role: 'user', content: 'need approval' },
    ]);

    expect(collectModelReplyText(first)).toBe('');
    expect(first.pendingToolCalls?.length).toBe(1);
    const pending = first.pendingToolCalls![0];
    expect(pending.toolName).toBe('echo');

    const approvalMsg: ChatMessage = {
      role: 'approval',
      toolCallApprovals: [
        {
          decision: 'allow-once',
          serverName: pending.serverName,
          toolName: pending.toolName,
          args: pending.args,
          toolCallId: pending.toolCallId,
        },
      ],
    };

    const second = await runLangGraphChat(session, agent, noopLogger, model, [
      { role: 'user', content: 'need approval' },
      approvalMsg,
    ]);

    expect(collectModelReplyText(second)).toBe('done_after_tool');
    expect(second.pendingToolCalls).toBeUndefined();
  });

  it('approval + message deltas + shared checkpointer: resumes graph via Command after interrupt', async () => {
    const agent = testAgent();
    const session = new LangChainTestSession({
      includeFixtureEchoTool: true,
      toolPermission: 'always',
      fixtureModelId: 'fixture:tool_then_done',
    });
    const model = await createFixtureChatModel(agent, 'fixture:tool_then_done');
    const checkpointer = new MemorySaver();
    const deltaOpts = { checkpointer, useMessageDeltas: true as const };

    const first = await runLangGraphChat(session, agent, noopLogger, model, [{ role: 'user', content: 'need approval' }], deltaOpts);

    expect(collectModelReplyText(first)).toBe('');
    expect(first.pendingToolCalls?.length).toBe(1);
    const pending = first.pendingToolCalls![0];

    const approvalMsg: ChatMessage = {
      role: 'approval',
      toolCallApprovals: [
        {
          decision: 'allow-once',
          serverName: pending.serverName,
          toolName: pending.toolName,
          args: pending.args,
          toolCallId: pending.toolCallId,
        },
      ],
    };

    const second = await runLangGraphChat(
      session,
      agent,
      noopLogger,
      model,
      [{ role: 'user', content: 'need approval' }, approvalMsg],
      deltaOpts
    );

    expect(collectModelReplyText(second)).toBe('done_after_tool');
    expect(second.pendingToolCalls).toBeUndefined();
  });

  it('tool loop: history already contains tool result; model returns final assistant text', async () => {
    const agent = testAgent();
    const session = new LangChainTestSession({
      includeFixtureEchoTool: true,
      toolPermission: 'never',
      fixtureModelId: 'fixture:tool_then_done',
    });
    const model = await createFixtureChatModel(agent, 'fixture:tool_then_done');

    const toolCallId = 'fixture-tool-call-1';
    const priorAssistant: ChatMessage = {
      role: 'assistant',
      modelReply: {
        timestamp: 1,
        turns: [
          {
            results: [
              {
                type: 'toolCall',
                toolCall: {
                  serverName: 'fixture',
                  toolName: 'echo',
                  args: { msg: 'from-test' },
                  toolCallId,
                  output: 'FIXTURE_TOOL:echo:{"msg":"from-test"}',
                  elapsedTimeMs: 0,
                },
              },
            ],
          },
        ],
      },
    };

    const reply = await runLangGraphChat(session, agent, noopLogger, model, [
      { role: 'user', content: 'pre-seeded' },
      priorAssistant,
    ]);

    expect(collectModelReplyText(reply)).toBe('done_after_tool');
  });

  it('message deltas: second invoke appends only new user; model sees full thread via checkpoint', async () => {
    const agent = testAgent();
    const session = new LangChainTestSession({
      includeFixtureEchoTool: false,
      toolPermission: 'never',
      fixtureModelId: 'fixture:echo_last_human',
    });
    const model = await createFixtureChatModel(agent, 'fixture:echo_last_human');
    const checkpointer = new MemorySaver();
    const deltaOpts = { checkpointer, useMessageDeltas: true as const };

    const primeMessages: ChatMessage[] = [
      { role: 'system', content: 'You are a test.' },
      { role: 'user', content: 'first line' },
    ];
    const first = await runLangGraphChat(session, agent, noopLogger, model, primeMessages, deltaOpts);
    expect(collectModelReplyText(first)).toContain('ECHO:first line');

    const secondUser: ChatMessage = { role: 'user', content: 'second line' };
    const second = await runLangGraphChat(session, agent, noopLogger, model, [secondUser], {
      ...deltaOpts,
      graphAppendChatMessages: [secondUser],
    });
    expect(collectModelReplyText(second)).toContain('ECHO:second line');
  });
});
