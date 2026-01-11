import React from 'react';
import { render, useApp } from 'ink';
import { SelectionList } from './SelectionList.js';
import type { SelectableItem } from './SelectionList.js';

interface SelectionListAppProps {
  title: string;
  items: SelectableItem[];
  onComplete: (items: SelectableItem[]) => void;
  onCancel: () => void;
}

function SelectionListAppInner({ title, items, onComplete, onCancel }: SelectionListAppProps) {
  const { exit } = useApp();

  const handleSubmit = (items: SelectableItem[]) => {
    exit();
    onComplete(items);
  };

  const handleCancel = () => {
    exit();
    onCancel();
  };

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
