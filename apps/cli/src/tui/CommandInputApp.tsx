import React, { useState } from 'react';
import { render, Box, Text, useApp } from 'ink';
import { CommandInput } from './CommandInput.js';
import type { Command } from './CommandInput.js';

interface CommandInputAppProps {
  prompt: string;
  commands: Command[];
  onComplete: (value: string) => void;
  onCancel: () => void;
}

function CommandInputAppInner({ prompt, commands, onComplete, onCancel }: CommandInputAppProps) {
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
    <CommandInput
      prompt={prompt}
      commands={commands}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}

export function renderCommandInput(
  prompt: string,
  commands: Command[]
): Promise<string> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <CommandInputAppInner
        prompt={prompt}
        commands={commands}
        onComplete={(value) => {
          unmount();
          resolve(value);
        }}
        onCancel={() => {
          unmount();
          // Resolve with empty string instead of rejecting - no error
          resolve('');
        }}
      />
    );
  });
}
