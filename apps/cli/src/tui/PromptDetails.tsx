import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';

export interface PromptDetailsData {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  serverName: string;
}

interface PromptDetailsProps {
  prompt: PromptDetailsData;
  onBack?: () => void;
}

export function PromptDetails({ prompt, onBack }: PromptDetailsProps) {
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
          <Text bold color="cyan">{prompt.name} ({prompt.serverName})</Text>
        </Box>
        <Box height={1} />
        <Box paddingX={1} paddingY={0}>
          <Text>Prompt name: <Text color="yellow">{prompt.name}</Text></Text>
        </Box>
        {prompt.description && (
          <>
            <Box height={1} />
            <Box paddingX={1} paddingY={0}>
              <Text>Description:</Text>
            </Box>
            <Box paddingX={1} paddingY={0}>
              <Text>{prompt.description}</Text>
            </Box>
          </>
        )}
        {prompt.arguments && prompt.arguments.length > 0 && (
          <>
            <Box height={1} />
            <Box paddingX={1} paddingY={0}>
              <Text>Arguments:</Text>
            </Box>
            {prompt.arguments.map((arg, idx) => (
              <Box key={idx} paddingX={1} paddingY={0}>
                <Text>
                  {arg.required ? <Text color="red">*</Text> : ' '}
                  <Text color="yellow">{arg.name}</Text>
                  {arg.description && <Text>: {arg.description}</Text>}
                </Text>
              </Box>
            ))}
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
