import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';

interface ToolPermissionSelectProps {
  currentValue: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
}

const TOOL_PERMISSION_OPTIONS = [
  { value: 'tool', label: 'Request permission based on tool setting' },
  { value: 'always', label: 'Always request permission' },
  { value: 'never', label: 'Never request permission' },
];

export function ToolPermissionSelect({ currentValue, onSubmit, onCancel }: ToolPermissionSelectProps) {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const index = TOOL_PERMISSION_OPTIONS.findIndex(opt => opt.value === currentValue);
    return index >= 0 ? index : 0;
  });
  const [isComplete, setIsComplete] = useState(false);

  // Handle keyboard input
  useInput((input: string, key: any) => {
    if (isComplete) return;

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(TOOL_PERMISSION_OPTIONS.length - 1, prev + 1));
      return;
    }

    if (key.return) {
      const selectedOption = TOOL_PERMISSION_OPTIONS[selectedIndex];
      if (selectedOption) {
        setIsComplete(true);
        setTimeout(() => {
          onSubmit(selectedOption.value);
        }, 0);
      }
      return;
    }

    if (key.escape) {
      setIsComplete(true);
      setTimeout(() => {
        if (onCancel) {
          onCancel();
        }
      }, 0);
      return;
    }

    if (key.ctrl && input === 'c') {
      setIsComplete(true);
      setTimeout(() => {
        if (onCancel) {
          onCancel();
        }
      }, 0);
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
          <Text bold color="cyan">toolPermission</Text>
        </Box>
        <Box height={1} />
        {TOOL_PERMISSION_OPTIONS.map((option, idx) => {
          const isSelected = idx === selectedIndex;
          const isCurrent = option.value === currentValue;
          const marker = isCurrent ? '*' : ' ';
          
          return (
            <Box key={option.value} paddingX={1} paddingY={0}>
              <Text inverse={isSelected}>
                {isSelected ? '▶ ' : '  '}
                <Text color={isCurrent ? 'green' : (isSelected ? undefined : 'yellow')} bold={isSelected || isCurrent}>
                  {marker} {option.value}
                </Text>
                {option.label && (
                  <Text color={isSelected ? undefined : 'gray'}>
                    {' - '}{option.label}
                  </Text>
                )}
              </Text>
            </Box>
          );
        })}
        <Box paddingX={1} paddingY={0}>
          <Text color="cyan">
            ↑↓ to navigate, Enter to select, Esc to cancel
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
