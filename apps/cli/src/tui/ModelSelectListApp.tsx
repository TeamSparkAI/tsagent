import { renderSingleSelectList } from './SingleSelectListApp.js';
import type { SelectableItem } from './SingleSelectList.js';

// Re-export for backward compatibility
export type ModelItem = SelectableItem;

export function renderModelSelectList(
  title: string,
  models: ModelItem[],
  currentModelId?: string
): Promise<string | null> {
  return renderSingleSelectList(title, models, currentModelId);
}
