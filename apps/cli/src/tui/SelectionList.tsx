import React, { useState, useEffect } from 'react';
import { Text, Box, useInput } from 'ink';

export interface SelectableItem {
  name: string;
  description?: string;
  isSelected: boolean;
}

interface SelectionListProps {
  title: string;
  items: SelectableItem[];
  onSubmit: (items: SelectableItem[]) => void;
  onCancel?: () => void;
}

export function SelectionList({ title, items, onSubmit, onCancel }: SelectionListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [localItems, setLocalItems] = useState<SelectableItem[]>(items);
  const [isComplete, setIsComplete] = useState(false);

  // Calculate visible range for scrolling (similar to CommandInput)
  const maxVisible = 10;
  const startIndex = Math.max(0, selectedIndex - maxVisible + 1);
  const endIndex = Math.min(localItems.length, startIndex + maxVisible);
  const visibleItems = localItems.slice(startIndex, endIndex);
  const visibleSelectedIndex = selectedIndex - startIndex;

  // Handle keyboard input
  useInput((input: string, key: any) => {
    if (isComplete) return;

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(localItems.length - 1, prev + 1));
      return;
    }

    if (input === ' ') {
      // Space bar toggles selection
      setLocalItems(prev => {
        const updated = [...prev];
        updated[selectedIndex] = {
          ...updated[selectedIndex],
          isSelected: !updated[selectedIndex].isSelected,
        };
        return updated;
      });
      return;
    }

    if (key.return) {
      // Enter to submit
      setIsComplete(true);
      setTimeout(() => {
        onSubmit(localItems);
      }, 0);
      return;
    }

    if (key.escape) {
      // Escape to cancel
      setIsComplete(true);
      setTimeout(() => {
        if (onCancel) {
          onCancel();
        }
      }, 0);
      return;
    }

    if (key.ctrl && input === 'c') {
      // Ctrl+C to cancel
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
      <Box height={1} />
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" position="relative">
        <Box position="absolute" marginTop={-1} marginLeft={2}>
          <Text bold color="cyan">{title}</Text>
        </Box>
        <Box height={1} />
        {visibleItems.map((item, idx) => {
          const isSelected = idx === visibleSelectedIndex;
          const marker = item.isSelected ? '*' : ' ';
          const checkbox = `[${marker}]`;
          
          return (
            <Box key={item.name} paddingX={1} paddingY={0}>
              <Text inverse={isSelected}>
                {isSelected ? '▶ ' : '  '}
                <Text color={item.isSelected ? 'green' : (isSelected ? undefined : 'yellow')} bold={isSelected || item.isSelected}>
                  {checkbox} {item.name}
                </Text>
                {item.description && (
                  <Text color={isSelected ? undefined : 'gray'}>
                    {' - '}{item.description}
                  </Text>
                )}
              </Text>
            </Box>
          );
        })}
        {localItems.length > maxVisible && (
          <Box paddingX={1} paddingY={0}>
            <Text color="cyan">
              {selectedIndex + 1} of {localItems.length} (↑↓ to navigate, Space to toggle, Enter to apply, Esc to cancel)
            </Text>
          </Box>
        )}
        {localItems.length <= maxVisible && (
          <Box paddingX={1} paddingY={0}>
            <Text color="cyan">
              ↑↓ to navigate, Space to toggle, Enter to apply, Esc to cancel
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
