import React, { useRef } from 'react';
import { render } from 'ink';
import { SelectionList } from './SelectionList.js';
import type { SelectableItem } from './SelectionList.js';
import { useCleanExit } from './useCleanExit.js';

interface SelectionListAppProps {
  title: string;
  items: SelectableItem[];
  onComplete: (items: SelectableItem[]) => void;
  onCancel: () => void;
}

function SelectionListAppInner({ title, items, onComplete, onCancel }: SelectionListAppProps) {
  const resultRef = useRef<SelectableItem[] | null>(null);
  const actionRef = useRef<'submit' | 'cancel' | null>(null);

  const handleFinished = () => {
    if (actionRef.current === 'submit' && resultRef.current !== null) {
      onComplete(resultRef.current);
    } else if (actionRef.current === 'cancel') {
      onCancel();
    }
  };

  const { isExiting, triggerExit } = useCleanExit(handleFinished);

  const handleSubmit = (items: SelectableItem[]) => {
    resultRef.current = items;
    actionRef.current = 'submit';
    triggerExit();
  };

  const handleCancel = () => {
    actionRef.current = 'cancel';
    triggerExit();
  };

  if (isExiting) {
    return null;
  }

  return (
    <SelectionList
      title={title}
      items={items}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}

export function renderSelectionList(
  title: string,
  items: SelectableItem[]
): Promise<SelectableItem[]> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <SelectionListAppInner
        title={title}
        items={items}
        onComplete={(items) => {
          unmount();
          resolve(items);
        }}
        onCancel={() => {
          unmount();
          // Resolve with original items (no changes)
          resolve(items);
        }}
      />
    );
  });
}
