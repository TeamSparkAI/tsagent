import React, { useRef } from 'react';
import { render } from 'ink';
import { SingleSelectList } from './SingleSelectList.js';
import type { SelectableItem } from './SingleSelectList.js';
import { useCleanExit } from './useCleanExit.js';

interface SingleSelectListAppProps {
  title: string;
  items: SelectableItem[];
  currentItemId?: string;
  onComplete: (itemId: string) => void;
  onCancel: () => void;
}

function SingleSelectListAppInner({ title, items, currentItemId, onComplete, onCancel }: SingleSelectListAppProps) {
  const resultRef = useRef<string | null>(null);
  const actionRef = useRef<'submit' | 'cancel' | null>(null);

  const handleFinished = () => {
    if (actionRef.current === 'submit' && resultRef.current !== null) {
      onComplete(resultRef.current);
    } else if (actionRef.current === 'cancel') {
      onCancel();
    }
  };

  const { isExiting, triggerExit } = useCleanExit(handleFinished);

  const handleSubmit = (itemId: string) => {
    resultRef.current = itemId;
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
