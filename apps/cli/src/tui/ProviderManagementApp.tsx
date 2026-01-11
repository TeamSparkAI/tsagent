import React from 'react';
import { render, useApp } from 'ink';
import { ProviderManagementList } from './ProviderManagementList.js';
import type { ProviderItem } from './ProviderManagementList.js';

interface ProviderManagementAppProps {
  title: string;
  providers: ProviderItem[];
  onComplete: (providerId: string, action: 'install' | 'view' | 'reconfigure' | 'remove') => void;
  onCancel: () => void;
}

function ProviderManagementAppInner({ title, providers, onComplete, onCancel }: ProviderManagementAppProps) {
  const { exit } = useApp();

  const handleSubmit = (providerId: string, action: 'install' | 'view' | 'reconfigure' | 'remove') => {
    exit();
    onComplete(providerId, action);
  };

  const handleCancel = () => {
    exit();
    onCancel();
  };

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
