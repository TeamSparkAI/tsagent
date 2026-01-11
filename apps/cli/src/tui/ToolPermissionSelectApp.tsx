import React from 'react';
import { render, useApp } from 'ink';
import { ToolPermissionSelect } from './ToolPermissionSelect.js';

interface ToolPermissionSelectAppProps {
  currentValue: string;
  onComplete: (value: string) => void;
  onCancel: () => void;
}

function ToolPermissionSelectAppInner({ currentValue, onComplete, onCancel }: ToolPermissionSelectAppProps) {
  const { exit } = useApp();

  const handleSubmit = (value: string) => {
    exit();
    onComplete(value);
  };

  const handleCancel = () => {
    exit();
    onCancel();
  };

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
