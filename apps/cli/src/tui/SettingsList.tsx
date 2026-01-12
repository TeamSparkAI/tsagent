import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';

export interface SettingItem {
  key: string;
  label: string;
  value: string;
  defaultValue: string;
  isOverridden: boolean;
  type: 'numeric' | 'enum';
}

interface SettingsListProps {
  title: string;
  settings: SettingItem[];
  onSubmit: (action: 'edit' | 'reset' | 'save', settingKey?: string) => void;
  onCancel?: () => void;
}

export function SettingsList({ title, settings, onSubmit, onCancel }: SettingsListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const hasOverrides = settings.some(s => s.isOverridden);

  // Calculate visible range for scrolling
  const maxVisible = 10;
  const startIndex = Math.max(0, selectedIndex - maxVisible + 1);
  const endIndex = Math.min(settings.length, startIndex + maxVisible);
  const visibleSettings = settings.slice(startIndex, endIndex);
  const visibleSelectedIndex = selectedIndex - startIndex;

  // Handle keyboard input
  useInput((input: string, key: any) => {
    if (isComplete) return;

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(settings.length - 1, prev + 1));
      return;
    }

    if (key.return) {
      // Enter to edit selected setting
      const selectedSetting = settings[selectedIndex];
      if (selectedSetting) {
        setIsComplete(true);
        setTimeout(() => {
          onSubmit('edit', selectedSetting.key);
        }, 0);
      }
      return;
    }

    if (input === 'r' && hasOverrides) {
      // r to reset all
      setIsComplete(true);
      setTimeout(() => {
        onSubmit('reset');
      }, 0);
      return;
    }

    if (input === 's' && hasOverrides) {
      // s to save all
      setIsComplete(true);
      setTimeout(() => {
        onSubmit('save');
      }, 0);
      return;
    }

    if (key.escape) {
      if (onCancel) {
        setIsComplete(true);
        setTimeout(() => {
          onCancel();
        }, 0);
      }
      return;
    }

    if (key.ctrl && input === 'c') {
      if (onCancel) {
        setIsComplete(true);
        setTimeout(() => {
          onCancel();
        }, 0);
      }
      return;
    }
  });

  // Don't render if complete
  if (isComplete) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" position="relative">
        <Box position="absolute" marginTop={-1} marginLeft={2}>
          <Text bold color="cyan">{title}</Text>
        </Box>
        <Box height={1} />
        {visibleSettings.map((setting, idx) => {
          const isSelected = idx === visibleSelectedIndex;
          const marker = setting.isOverridden ? '*' : ' ';
          const overrideText = setting.isOverridden ? ` * (default: ${setting.defaultValue})` : '';
          
          return (
            <Box key={setting.key} paddingX={1} paddingY={0}>
              <Text inverse={isSelected}>
                {isSelected ? '▶ ' : '  '}
                <Text color={setting.isOverridden ? 'green' : (isSelected ? undefined : 'yellow')} bold={isSelected || setting.isOverridden}>
                  {marker} {setting.label}:
                </Text>
                <Text color={isSelected ? undefined : 'gray'}>
                  {' '}{setting.value}{overrideText}
                </Text>
              </Text>
            </Box>
          );
        })}
        {settings.length > maxVisible && (
          <Box paddingX={1} paddingY={0}>
            <Text color="cyan">
              {selectedIndex + 1} of {settings.length}
              {hasOverrides ? ' • r: reset all • s: save as defaults • ' : ' • '}
              Enter to edit, Esc to cancel
            </Text>
          </Box>
        )}
        {settings.length <= maxVisible && (
          <Box paddingX={1} paddingY={0}>
            <Text color="cyan">
              {hasOverrides ? 'r: reset all • s: save as defaults • ' : ''}
              ↑↓ to navigate, Enter to edit, Esc to cancel
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
