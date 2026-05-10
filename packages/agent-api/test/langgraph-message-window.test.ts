import { AIMessage, HumanMessage, RemoveMessage } from '@langchain/core/messages';
import {
  DEFAULT_GRAPH_MESSAGE_WINDOW_MAX,
  removalsForMessageCountWindow,
  resolveGraphMessageWindowMax,
  sliceMessagesForModelInput,
} from '../src/providers/langchain/langgraph-message-window.js';

describe('langgraph-message-window', () => {
  test('resolveGraphMessageWindowMax uses default and floors at 1', () => {
    expect(resolveGraphMessageWindowMax(undefined)).toBe(DEFAULT_GRAPH_MESSAGE_WINDOW_MAX);
    expect(resolveGraphMessageWindowMax(50)).toBe(50);
    expect(resolveGraphMessageWindowMax(0)).toBe(1);
    expect(resolveGraphMessageWindowMax(-3)).toBe(1);
  });

  test('no removals when under cap', () => {
    const msgs = [mk('a', 'human'), mk('b', 'ai')];
    expect(removalsForMessageCountWindow(msgs, 100)).toEqual([]);
    expect(sliceMessagesForModelInput(msgs, 100)).toBe(msgs);
  });

  test('removals and slice keep last N by count', () => {
    const msgs = [mk('1', 'human'), mk('2', 'ai'), mk('3', 'human'), mk('4', 'ai')];
    const removals = removalsForMessageCountWindow(msgs, 2);
    expect(removals).toHaveLength(2);
    expect(removals.every((r) => RemoveMessage.isInstance(r))).toBe(true);
    expect(removals.map((r) => r.id)).toEqual(['1', '2']);
    expect(sliceMessagesForModelInput(msgs, 2).map((m) => m.id)).toEqual(['3', '4']);
  });

  test('throws when a message to drop has no id', () => {
    const bad = new HumanMessage('x');
    expect(bad.id).toBeUndefined();
    expect(() => removalsForMessageCountWindow([bad, mk('b', 'human')], 1)).toThrow(/no id/);
  });
});

function mk(id: string, role: 'human' | 'ai'): HumanMessage | AIMessage {
  if (role === 'human') return new HumanMessage({ content: `m-${id}`, id });
  return new AIMessage({ content: `m-${id}`, id });
}
