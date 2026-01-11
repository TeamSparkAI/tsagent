import React from 'react';
import { render, useApp } from 'ink';
import { SingleSelectList } from './SingleSelectList.js';
import type { SelectableItem } from './SingleSelectList.js';

interface SingleSelectListAppProps {
  title: string;
  items: SelectableItem[];
  currentItemId?: string;
  onComplete: (itemId: string) => void;
  onCancel: () => void;
}

function SingleSelectListAppInner({ title, items, currentItemId, onComplete, onCancel }: SingleSelectListAppProps) {
  const { exit } = useApp();

  const handleSubmit = (itemId: string) => {
    exit();
    onComplete(itemId);
  };

  const handleCancel = () => {
    exit();
    onCancel();
  };

  return (
    <SingleSelectList
      title={title}
      items={items}
      currentItemId={currentItemId}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}

export function renderSingleSelectList(
  title: string,
  items: SelectableItem[],
  currentItemId?: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <SingleSelectListAppInner
        title={title}
        items={items}
        currentItemId={currentItemId}
        onComplete={(itemId) => {
          unmount();
          resolve(itemId);
        }}
        onCancel={() => {
          unmount();
          // Resolve with null to indicate cancellation
          resolve(null);
        }}
      />
    );
  });
}
