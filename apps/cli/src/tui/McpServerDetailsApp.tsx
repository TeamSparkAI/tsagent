import React, { useRef } from 'react';
import { render } from 'ink';
import { McpServerDetails } from './McpServerDetails.js';
import type { McpServerDetailsData } from './McpServerDetails.js';
import { useCleanExit } from './useCleanExit.js';

interface McpServerDetailsAppProps {
  server: McpServerDetailsData;
  onComplete: (action: 'view-tools' | 'view-prompts' | 'view-resources' | 'reconnect' | 'disable') => void;
  onCancel: () => void;
}

function McpServerDetailsAppInner({ server, onComplete, onCancel }: McpServerDetailsAppProps) {
  const actionRef = useRef<'view-tools' | 'view-prompts' | 'view-resources' | 'reconnect' | 'disable' | 'cancel' | null>(null);

  const handleFinished = () => {
    if (actionRef.current && actionRef.current !== 'cancel') {
      onComplete(actionRef.current);
    } else if (actionRef.current === 'cancel') {
      onCancel();
    }
  };

  const { isExiting, triggerExit } = useCleanExit(handleFinished);

  const handleSubmit = (action: 'view-tools' | 'view-prompts' | 'view-resources' | 'reconnect' | 'disable') => {
    actionRef.current = action;
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
    <McpServerDetails
      server={server}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}

export function renderMcpServerDetails(
  server: McpServerDetailsData
): Promise<'view-tools' | 'view-prompts' | 'view-resources' | 'reconnect' | 'disable' | null> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <McpServerDetailsAppInner
        server={server}
        onComplete={(action: 'view-tools' | 'view-prompts' | 'view-resources' | 'reconnect' | 'disable') => {
          unmount();
          resolve(action);
        }}
        onCancel={() => {
          unmount();
          resolve(null);
        }}
      />
    );
  });
}
