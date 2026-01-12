import React, { useRef } from 'react';
import { render } from 'ink';
import { ProviderManagementList } from './ProviderManagementList.js';
import type { ProviderItem } from './ProviderManagementList.js';
import { useCleanExit } from './useCleanExit.js';

interface ProviderManagementAppProps {
  title: string;
  providers: ProviderItem[];
  onComplete: (providerId: string, action: 'install' | 'view' | 'reconfigure' | 'remove') => void;
  onCancel: () => void;
}

function ProviderManagementAppInner({ title, providers, onComplete, onCancel }: ProviderManagementAppProps) {
  const resultRef = useRef<{ providerId: string; action: 'install' | 'view' | 'reconfigure' | 'remove' } | null>(null);
  const actionRef = useRef<'submit' | 'cancel' | null>(null);

  const handleFinished = () => {
    if (actionRef.current === 'submit' && resultRef.current !== null) {
      onComplete(resultRef.current.providerId, resultRef.current.action);
    } else if (actionRef.current === 'cancel') {
      onCancel();
    }
  };

  const { isExiting, triggerExit } = useCleanExit(handleFinished);

  const handleSubmit = (providerId: string, action: 'install' | 'view' | 'reconfigure' | 'remove') => {
    resultRef.current = { providerId, action };
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
    <ProviderManagementList
      title={title}
      providers={providers}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}

export function renderProviderManagement(
  title: string,
  providers: ProviderItem[]
): Promise<{ providerId: string; action: 'install' | 'view' | 'reconfigure' | 'remove' } | null> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <ProviderManagementAppInner
        title={title}
        providers={providers}
        onComplete={(providerId, action) => {
          unmount();
          resolve({ providerId, action });
        }}
        onCancel={() => {
          unmount();
          resolve(null);
        }}
      />
    );
  });
}
