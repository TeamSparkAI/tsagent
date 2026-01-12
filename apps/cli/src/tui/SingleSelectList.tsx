import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';

export interface SelectableItem {
  id: string;
  name: string;
}

interface SingleSelectListProps {
  title: string;
  items: SelectableItem[];
  currentItemId?: string;
  onSubmit: (itemId: string) => void;
  onCancel?: () => void;
}

export function SingleSelectList({ title, items, currentItemId, onSubmit, onCancel }: SingleSelectListProps) {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    // Start at current item if it exists
    if (currentItemId) {
      const index = items.findIndex(item => item.id === currentItemId);
      return index >= 0 ? index : 0;
    }
    return 0;
  });
  const [isComplete, setIsComplete] = useState(false);

  // Calculate visible range for scrolling
  const maxVisible = 10;
  const startIndex = Math.max(0, selectedIndex - maxVisible + 1);
  const endIndex = Math.min(items.length, startIndex + maxVisible);
  const visibleItems = items.slice(startIndex, endIndex);
  const visibleSelectedIndex = selectedIndex - startIndex;

  // Handle keyboard input
  useInput((input: string, key: any) => {
    if (isComplete) return;

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(items.length - 1, prev + 1));
      return;
    }

    if (key.return) {
      // Enter to select
      const selectedItem = items[selectedIndex];
      if (selectedItem) {
        setIsComplete(true);
        setTimeout(() => {
          onSubmit(selectedItem.id);
        }, 0);
      }
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
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" position="relative">
        <Box position="absolute" marginTop={-1} marginLeft={2}>
          <Text bold color="cyan">{title}</Text>
        </Box>
        <Box height={1} />
        {visibleItems.map((item, idx) => {
          const isSelected = idx === visibleSelectedIndex;
          const isCurrent = item.id === currentItemId;
          
          return (
            <Box key={item.id} paddingX={1} paddingY={0}>
              <Text>
                {isSelected ? '❯ ' : '  '}
                <Text inverse={isSelected} bold={isSelected || isCurrent} color={isCurrent ? 'green' : (isSelected ? undefined : 'yellow')}>
                  {item.name}
                </Text>
              </Text>
            </Box>
          );
        })}
        {items.length > maxVisible && (
          <Box paddingX={1} paddingY={0}>
            <Text color="cyan">
              {selectedIndex + 1} of {items.length} (↑↓ to navigate, Enter to select, Esc to cancel)
            </Text>
          </Box>
        )}
        {items.length <= maxVisible && (
          <Box paddingX={1} paddingY={0}>
            <Text color="cyan">
              ↑↓ to navigate, Enter to select, Esc to cancel
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
