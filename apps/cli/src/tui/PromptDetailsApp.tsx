import React from 'react';
import { render } from 'ink';
import { PromptDetails } from './PromptDetails.js';
import type { PromptDetailsData } from './PromptDetails.js';
import { useCleanExit } from './useCleanExit.js';

interface PromptDetailsAppProps {
  prompt: PromptDetailsData;
  onBack: () => void;
}

function PromptDetailsAppInner({ prompt, onBack }: PromptDetailsAppProps) {
  const { isExiting, triggerExit } = useCleanExit(() => onBack());

  const handleBack = () => {
    triggerExit();
  };

  if (isExiting) {
    return null;
  }

  return <PromptDetails prompt={prompt} onBack={handleBack} />;
}

export function renderPromptDetails(prompt: PromptDetailsData): Promise<void> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <PromptDetailsAppInner
        prompt={prompt}
        onBack={() => {
          unmount();
          resolve();
        }}
      />
    );
  });
}
