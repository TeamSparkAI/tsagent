import { renderSingleSelectList } from './SingleSelectListApp.js';
import type { SelectableItem } from './SingleSelectList.js';

// Re-export for backward compatibility
export type ProviderItem = SelectableItem;

export function renderProviderSelectList(
  title: string,
  providers: ProviderItem[],
  currentProviderId?: string
): Promise<string | null> {
  return renderSingleSelectList(title, providers, currentProviderId);
}
