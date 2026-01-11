import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';

interface ConfirmPromptProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmPrompt({ message, onConfirm, onCancel }: ConfirmPromptProps) {
  const [isComplete, setIsComplete] = useState(false);
  const [selectedOption, setSelectedOption] = useState<'yes' | 'no'>('no');

  useInput((input: string, key: any) => {
    if (isComplete) return;

    if (key.leftArrow || key.rightArrow) {
      setSelectedOption(prev => prev === 'yes' ? 'no' : 'yes');
      return;
    }

    if (key.return) {
      setIsComplete(true);
      setTimeout(() => {
        if (selectedOption === 'yes') {
          onConfirm();
        } else {
          onCancel();
        }
      }, 0);
      return;
    }

    if (key.escape) {
      setIsComplete(true);
      setTimeout(() => {
        onCancel();
      }, 0);
      return;
    }

    if (key.ctrl && input === 'c') {
      setIsComplete(true);
      setTimeout(() => {
        onCancel();
      }, 0);
      return;
    }
  });

  if (isComplete) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text>{message}</Text>
      </Box>
      <Box flexDirection="row" gap={2}>
        <Text inverse={selectedOption === 'yes'} color={selectedOption === 'yes' ? undefined : 'gray'}>
          Yes
        </Text>
        <Text inverse={selectedOption === 'no'} color={selectedOption === 'no' ? undefined : 'gray'}>
          No
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color="cyan">
          ←→ to select, Enter to confirm, Esc to cancel
        </Text>
      </Box>
    </Box>
  );
}
