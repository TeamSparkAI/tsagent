import React, { useRef } from 'react';
import { render } from 'ink';
import { ConfirmPrompt } from './ConfirmPrompt.js';
import { useCleanExit } from './useCleanExit.js';

interface ConfirmPromptAppProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmPromptAppInner({ message, onConfirm, onCancel }: ConfirmPromptAppProps) {
  const actionRef = useRef<'confirm' | 'cancel' | null>(null);

  const handleFinished = () => {
    if (actionRef.current === 'confirm') {
      onConfirm();
    } else if (actionRef.current === 'cancel') {
      onCancel();
    }
  };

  const { isExiting, triggerExit } = useCleanExit(handleFinished);

  const handleConfirm = () => {
    actionRef.current = 'confirm';
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
    <ConfirmPrompt
      message={message}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );
}

export function renderConfirmPrompt(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <ConfirmPromptAppInner
        message={message}
        onConfirm={() => {
          unmount();
          resolve(true);
        }}
        onCancel={() => {
          unmount();
          resolve(false);
        }}
      />
    );
  });
}
