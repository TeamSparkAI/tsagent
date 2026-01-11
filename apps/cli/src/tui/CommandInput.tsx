import React, { useState, useEffect } from 'react';
import { Text, Box, useInput } from 'ink';
import chalk from 'chalk';

export interface Command {
  name: string;
  description: string;
}

interface CommandInputProps {
  prompt: string;
  commands: Command[];
  onSubmit: (value: string) => void;
  onCancel?: () => void;
}

export function CommandInput({ prompt, commands, onSubmit, onCancel }: CommandInputProps) {
  const [value, setValue] = useState('');
  const [filteredCommands, setFilteredCommands] = useState<Command[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCommands, setShowCommands] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update filtered commands when value changes
  useEffect(() => {
    if (value === '/') {
      // Just `/` typed - show all commands
      setFilteredCommands(commands);
      setShowCommands(true);
      setSelectedIndex(0);
    } else if (value.startsWith('/') && value.length > 1) {
      // User typing after `/` - filter commands
      const filter = value.substring(1).toLowerCase();
      const filtered = commands.filter(cmd => 
        cmd.name.toLowerCase().includes(filter) ||
        cmd.description.toLowerCase().includes(filter)
      );
      setFilteredCommands(filtered);
      setShowCommands(true);
      setSelectedIndex(0);
    } else {
      // Not in command mode
      setShowCommands(false);
    }
  }, [value, commands]);

  // Handle all keyboard input manually
  useInput((input: string, key: any) => {
    // Handle special keys
    if (key.upArrow) {
      if (showCommands && filteredCommands.length > 0) {
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
      }
      return;
    }
    if (key.downArrow) {
      if (showCommands && filteredCommands.length > 0) {
        setSelectedIndex(prev => 
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
      }
      return;
    }
    if (key.return) {
      if (showCommands && filteredCommands.length > 0 && filteredCommands[selectedIndex] && !isSubmitting) {
        // Select the highlighted command - set value first so it appears in prompt/history
        const selectedCommand = filteredCommands[selectedIndex].name;
        setValue(selectedCommand);
        setIsSubmitting(true);
        setShowCommands(false);
        // Submit after state updates to show command and hide menu first
        setTimeout(() => {
          onSubmit(selectedCommand);
        }, 0);
      } else if (!isSubmitting) {
        // Submit the raw value
        onSubmit(value);
      }
      return;
    }
    if (key.escape) {
      // Escape should clear input and close menu (like backspacing over the slash)
      if (showCommands) {
        setValue('');
        setShowCommands(false);
      } else if (value.length > 0) {
        setValue('');
      }
      // If input is empty and no menu, do nothing (no-op)
      return;
    }
    // Handle backspace/delete - check both key object and input character
    if (key.backspace || key.delete || input === '\x7f' || input === '\b') {
      setValue(prev => prev.slice(0, -1));
      return;
    }
    if (key.ctrl && input === 'c') {
      // Ctrl+C to cancel
      if (onCancel) {
        onCancel();
      }
      return;
    }
    
    // Handle regular text input
    if (input && !key.ctrl && !key.meta && !key.alt) {
      setValue(prev => prev + input);
    }
  });


  // Calculate visible range for scrolling
  const maxVisible = 10; // Maximum visible items
  const startIndex = Math.max(0, selectedIndex - maxVisible + 1);
  const endIndex = Math.min(filteredCommands.length, startIndex + maxVisible);
  const visibleCommands = filteredCommands.slice(startIndex, endIndex);
  const visibleSelectedIndex = selectedIndex - startIndex;

  return (
    <Box flexDirection="column">
      <Box>
        <Text>{prompt}</Text>
        <Text>{value}</Text>
        <Text dimColor>█</Text>
      </Box>
      {showCommands && filteredCommands.length > 0 && !isSubmitting && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan">
          <Box paddingX={1} paddingY={0}>
            <Text color="cyan" bold>
              Available Commands ({filteredCommands.length})
            </Text>
          </Box>
          {visibleCommands.map((cmd, idx) => {
            const isSelected = idx === visibleSelectedIndex;
            return (
              <Box key={cmd.name} paddingX={1} paddingY={0}>
                <Text inverse={isSelected}>
                  {isSelected ? '▶ ' : '  '}
                  <Text color={isSelected ? undefined : 'yellow'} bold={isSelected}>
                    {cmd.name}
                  </Text>
                  <Text color={isSelected ? undefined : 'gray'}>
                    {' - '}{cmd.description}
                  </Text>
                </Text>
              </Box>
            );
          })}
          {filteredCommands.length > maxVisible && (
            <Box paddingX={1} paddingY={0}>
              <Text color="gray" dimColor>
                {selectedIndex + 1} of {filteredCommands.length} (↑↓ to navigate, Enter to select, Esc to cancel)
              </Text>
            </Box>
          )}
          {filteredCommands.length <= maxVisible && (
            <Box paddingX={1} paddingY={0}>
              <Text color="gray" dimColor>
                ↑↓ to navigate, Enter to select, Esc to cancel
              </Text>
            </Box>
          )}
        </Box>
      )}
      {showCommands && filteredCommands.length === 0 && !isSubmitting && (
        <Box marginTop={1}>
          <Text color="red">No commands found matching "{value.substring(1)}"</Text>
        </Box>
      )}
    </Box>
  );
}
