import React from 'react';
import { Box, Text } from 'ink';
import os from 'os';
import path from 'path';

interface WelcomeBannerProps {
  version: string;
  agentPath: string;
  agentName?: string;
}

export function WelcomeBanner({ version, agentPath, agentName }: WelcomeBannerProps) {
  const username = os.userInfo().username;
  const productName = 'TsAgent CLI';

  // Format agent path - show relative if in home directory, otherwise show relative to cwd
  const homeDir = os.homedir();
  let displayPath = agentPath;
  if (agentPath.startsWith(homeDir)) {
    displayPath = agentPath.replace(homeDir, '~');
  } else {
    const cwd = process.cwd();
    if (agentPath.startsWith(cwd)) {
      displayPath = '.' + agentPath.substring(cwd.length);
    }
  }

  const title = `${productName} v${version}`;
  const welcomeText = `Welcome back ${username}!`;
  const agentDisplayName = agentName || path.basename(agentPath, path.extname(agentPath));

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} position="relative">
      {/* Title overlaid on top border using absolute positioning */}
      <Box position="absolute" marginTop={-1} paddingLeft={5}>
        <Text color="cyan" bold>{title}</Text>
      </Box>

      <Box justifyContent="center" marginBottom={1} marginTop={1}>
        <Text bold>{welcomeText}</Text>
      </Box>

      <Box paddingLeft={2}>
        <Text color="cyan" bold>Agent:</Text>
        <Text>{' ' + agentDisplayName}</Text>
      </Box>

      <Box paddingLeft={2} marginBottom={1}>
        <Text color="cyan" bold>Path:</Text>
        <Text>{' '}</Text>
        <Text dimColor>{displayPath}</Text>
      </Box>

      <Box paddingLeft={2}>
        <Text color="yellow" bold>Tips for getting started</Text>
      </Box>

      <Box paddingLeft={2}>
        <Text>Type </Text>
        <Text color="yellow">/help</Text>
        <Text> to see all available commands</Text>
      </Box>

      <Box paddingLeft={2} marginBottom={1}>
        <Text>Type </Text>
        <Text color="yellow">/</Text>
        <Text> to browse commands with autocomplete</Text>
      </Box>
    </Box>
  );
}
