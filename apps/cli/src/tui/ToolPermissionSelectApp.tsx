import React, { useRef } from 'react';
import { render } from 'ink';
import { ToolPermissionSelect } from './ToolPermissionSelect.js';
import { useCleanExit } from './useCleanExit.js';

interface ToolPermissionSelectAppProps {
  currentValue: string;
  onComplete: (value: string) => void;
  onCancel: () => void;
}

function ToolPermissionSelectAppInner({ currentValue, onComplete, onCancel }: ToolPermissionSelectAppProps) {
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

  const handleSubmit = (value: string) => {
    resultRef.current = value;
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
    <ToolPermissionSelect
      currentValue={currentValue}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}

export function renderToolPermissionSelect(currentValue: string): Promise<string | null> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <ToolPermissionSelectAppInner
        currentValue={currentValue}
        onComplete={(value) => {
          unmount();
          resolve(value);
        }}
        onCancel={() => {
          unmount();
          resolve(null);
        }}
      />
    );
  });
}
