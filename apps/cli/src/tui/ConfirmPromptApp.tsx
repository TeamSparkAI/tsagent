import React from 'react';
import { render, useApp } from 'ink';
import { ConfirmPrompt } from './ConfirmPrompt.js';

interface ConfirmPromptAppProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmPromptAppInner({ message, onConfirm, onCancel }: ConfirmPromptAppProps) {
  const { exit } = useApp();

  const handleConfirm = () => {
    exit();
    onConfirm();
  };

  const handleCancel = () => {
    exit();
    onCancel();
  };

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
