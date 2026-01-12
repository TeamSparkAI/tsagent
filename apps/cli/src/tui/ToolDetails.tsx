import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';

export interface ToolDetailsData {
  name: string;
  fullName: string;
  description?: string;
  serverName: string;
}

interface ToolDetailsProps {
  tool: ToolDetailsData;
  onBack?: () => void;
}

export function ToolDetails({ tool, onBack }: ToolDetailsProps) {
  const [isComplete, setIsComplete] = useState(false);

  useInput((input: string, key: any) => {
    if (isComplete) return;

    if (key.escape) {
      setIsComplete(true);
      setTimeout(() => {
        if (onBack) {
          onBack();
        }
      }, 0);
      return;
    }

    if (key.ctrl && input === 'c') {
      setIsComplete(true);
      setTimeout(() => {
        if (onBack) {
          onBack();
        }
      }, 0);
      return;
    }
  });

  if (isComplete) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" position="relative">
        <Box position="absolute" marginTop={-1} marginLeft={2}>
          <Text bold color="cyan">{tool.name} ({tool.serverName})</Text>
        </Box>
        <Box height={1} />
        <Box paddingX={1} paddingY={0}>
          <Text>Tool name: <Text color="yellow">{tool.name}</Text></Text>
        </Box>
        <Box paddingX={1} paddingY={0}>
          <Text>Full name: <Text color="yellow">{tool.fullName}</Text></Text>
        </Box>
        {tool.description && (
          <>
            <Box height={1} />
            <Box paddingX={1} paddingY={0}>
              <Text>Description:</Text>
            </Box>
            <Box paddingX={1} paddingY={0}>
              <Text>{tool.description}</Text>
            </Box>
          </>
        )}
        <Box height={1} />
        <Box paddingX={1} paddingY={0}>
          <Text color="cyan">escape to go back</Text>
        </Box>
      </Box>
    </Box>
  );
}
