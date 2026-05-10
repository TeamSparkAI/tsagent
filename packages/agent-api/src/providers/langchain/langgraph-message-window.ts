import type { BaseMessage } from '@langchain/core/messages';
import { RemoveMessage } from '@langchain/core/messages';

/** Default max checkpointed `messages` before oldest entries are dropped (count, not tokens). */
export const DEFAULT_GRAPH_MESSAGE_WINDOW_MAX = 100;

export function resolveGraphMessageWindowMax(explicit?: number): number {
  const n = explicit ?? DEFAULT_GRAPH_MESSAGE_WINDOW_MAX;
  return Math.max(1, Math.floor(n));
}

/**
 * Oldest-first removals so the merged checkpoint retains at most `maxKeep` messages.
 * Requires every message in `messages` to have a stable `id` (LangGraph's reducer assigns UUIDs when missing).
 */
export function removalsForMessageCountWindow(messages: BaseMessage[], maxKeep: number): RemoveMessage[] {
  const cap = Math.max(1, maxKeep);
  if (messages.length <= cap) return [];
  const toDrop = messages.length - cap;
  const removals: RemoveMessage[] = [];
  for (let i = 0; i < toDrop; i++) {
    const id = messages[i]?.id;
    if (id == null || id === '') {
      throw new Error(
        `Graph message window: message at index ${i} has no id; cannot emit RemoveMessage.`
      );
    }
    removals.push(new RemoveMessage({ id }));
  }
  return removals;
}

/** Messages passed to `BaseChatModel.invoke` after applying the same count window as {@link removalsForMessageCountWindow}. */
export function sliceMessagesForModelInput(messages: BaseMessage[], maxKeep: number): BaseMessage[] {
  const cap = Math.max(1, maxKeep);
  if (messages.length <= cap) return messages;
  return messages.slice(-cap);
}
