import React from 'react';
import { render } from 'ink';
import { ToolDetails } from './ToolDetails.js';
import type { ToolDetailsData } from './ToolDetails.js';
import { useCleanExit } from './useCleanExit.js';

interface ToolDetailsAppProps {
  tool: ToolDetailsData;
  onBack: () => void;
}

function ToolDetailsAppInner({ tool, onBack }: ToolDetailsAppProps) {
  const { isExiting, triggerExit } = useCleanExit(() => onBack());

  const handleBack = () => {
    triggerExit();
  };

  if (isExiting) {
    return null;
  }

  return <ToolDetails tool={tool} onBack={handleBack} />;
}

export function renderToolDetails(tool: ToolDetailsData): Promise<void> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <ToolDetailsAppInner
        tool={tool}
        onBack={() => {
          unmount();
          resolve();
        }}
      />
    );
  });
}
