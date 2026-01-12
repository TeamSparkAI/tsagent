import React, { useRef } from 'react';
import { render } from 'ink';
import { SettingsList } from './SettingsList.js';
import type { SettingItem } from './SettingsList.js';
import { useCleanExit } from './useCleanExit.js';

interface SettingsListAppProps {
  title: string;
  settings: SettingItem[];
  onComplete: (action: 'edit' | 'reset' | 'save', settingKey?: string) => void;
  onCancel: () => void;
}

function SettingsListAppInner({ title, settings, onComplete, onCancel }: SettingsListAppProps) {
  const resultRef = useRef<{ action: 'edit' | 'reset' | 'save'; settingKey?: string } | null>(null);
  const actionRef = useRef<'submit' | 'cancel' | null>(null);

  const handleFinished = () => {
    if (actionRef.current === 'submit' && resultRef.current !== null) {
      onComplete(resultRef.current.action, resultRef.current.settingKey);
    } else if (actionRef.current === 'cancel') {
      onCancel();
    }
  };

  const { isExiting, triggerExit } = useCleanExit(handleFinished);

  const handleSubmit = (action: 'edit' | 'reset' | 'save', settingKey?: string) => {
    resultRef.current = { action, settingKey };
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
