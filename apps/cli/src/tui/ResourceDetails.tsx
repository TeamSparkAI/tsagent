import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';

export interface ResourceDetailsData {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverName: string;
}

interface ResourceDetailsProps {
  resource: ResourceDetailsData;
  onBack?: () => void;
}

export function ResourceDetails({ resource, onBack }: ResourceDetailsProps) {
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
          <Text bold color="cyan">{resource.name} ({resource.serverName})</Text>
        </Box>
        <Box height={1} />
        <Box paddingX={1} paddingY={0}>
          <Text>Resource name: <Text color="yellow">{resource.name}</Text></Text>
        </Box>
        <Box paddingX={1} paddingY={0}>
          <Text>URI: <Text color="yellow">{resource.uri}</Text></Text>
        </Box>
        {resource.mimeType && (
          <Box paddingX={1} paddingY={0}>
            <Text>MIME type: <Text color="yellow">{resource.mimeType}</Text></Text>
          </Box>
        )}
        {resource.description && (
          <>
            <Box height={1} />
            <Box paddingX={1} paddingY={0}>
              <Text>Description:</Text>
            </Box>
            <Box paddingX={1} paddingY={0}>
              <Text>{resource.description}</Text>
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
