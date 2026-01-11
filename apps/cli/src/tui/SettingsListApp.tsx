import React from 'react';
import { render, useApp } from 'ink';
import { SettingsList } from './SettingsList.js';
import type { SettingItem } from './SettingsList.js';

interface SettingsListAppProps {
  title: string;
  settings: SettingItem[];
  onComplete: (action: 'edit' | 'reset' | 'save', settingKey?: string) => void;
  onCancel: () => void;
}

function SettingsListAppInner({ title, settings, onComplete, onCancel }: SettingsListAppProps) {
  const { exit } = useApp();

  const handleSubmit = (action: 'edit' | 'reset' | 'save', settingKey?: string) => {
    exit();
    onComplete(action, settingKey);
  };

  const handleCancel = () => {
    exit();
    onCancel();
  };

  return (
    <SettingsList
      title={title}
      settings={settings}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}

export function renderSettingsList(
  title: string,
  settings: SettingItem[]
): Promise<{ action: 'edit' | 'reset' | 'save'; settingKey?: string } | null> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <SettingsListAppInner
        title={title}
        settings={settings}
        onComplete={(action, settingKey) => {
          unmount();
          resolve({ action, settingKey });
        }}
        onCancel={() => {
          unmount();
          resolve(null);
        }}
      />
    );
  });
}
