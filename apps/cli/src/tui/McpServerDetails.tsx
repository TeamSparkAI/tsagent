import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';

export interface McpServerDetailsData {
  name: string;
  serverName: string;
  status: 'connected' | 'disconnected';
  command?: string;
  args?: string[];
  capabilities: string[];
  toolCount: number;
  promptCount?: number;
  resourceCount?: number;
}

interface McpServerDetailsProps {
  server: McpServerDetailsData;
  onSubmit: (action: 'view-tools' | 'view-prompts' | 'view-resources' | 'reconnect' | 'disable') => void;
  onCancel?: () => void;
}

export function McpServerDetails({ server, onSubmit, onCancel }: McpServerDetailsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  // Build action menu items based on available capabilities
  const actionMenuItems: string[] = ['View tools'];
  if (server.promptCount !== undefined && server.promptCount > 0) {
    actionMenuItems.push('View prompts');
  }
  if (server.resourceCount !== undefined && server.resourceCount > 0) {
    actionMenuItems.push('View resources');
  }
  actionMenuItems.push('Reconnect', 'Disable');

  // Handle keyboard input
  useInput((input: string, key: any) => {
    if (isComplete) return;

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(actionMenuItems.length - 1, prev + 1));
      return;
    }

    if (key.return) {
      const action = actionMenuItems[selectedIndex];
      if (action === 'View tools') {
        setIsComplete(true);
        setTimeout(() => {
          onSubmit('view-tools');
        }, 0);
      } else if (action === 'View prompts') {
        setIsComplete(true);
        setTimeout(() => {
          onSubmit('view-prompts');
        }, 0);
      } else if (action === 'View resources') {
        setIsComplete(true);
        setTimeout(() => {
          onSubmit('view-resources');
        }, 0);
      } else if (action === 'Reconnect') {
        setIsComplete(true);
        setTimeout(() => {
          onSubmit('reconnect');
        }, 0);
      } else if (action === 'Disable') {
        setIsComplete(true);
        setTimeout(() => {
          onSubmit('disable');
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

  const statusIcon = server.status === 'connected' ? '✔' : '✗';
  const statusColor = server.status === 'connected' ? 'green' : 'red';
  const argsText = server.args && server.args.length > 0 ? server.args.join(' ') : '';

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" position="relative">
        <Box position="absolute" marginTop={-1} marginLeft={2}>
          <Text bold color="cyan">{server.name}</Text>
        </Box>
        <Box height={1} />
        <Box paddingX={1} paddingY={0}>
          <Text>Status: <Text color={statusColor}>{statusIcon} {server.status}</Text></Text>
        </Box>
        {server.command && (
          <Box paddingX={1} paddingY={0}>
            <Text>Command: <Text color="yellow">{server.command}</Text></Text>
          </Box>
        )}
        {argsText && (
          <Box paddingX={1} paddingY={0}>
            <Text>Args: <Text color="yellow">{argsText}</Text></Text>
          </Box>
        )}
        <Box paddingX={1} paddingY={0}>
          <Text>Capabilities: <Text color="cyan">{server.capabilities.join(', ')}</Text></Text>
        </Box>
        <Box paddingX={1} paddingY={0}>
          <Text>Tools: <Text color="cyan">{server.toolCount} tools</Text></Text>
        </Box>
        {server.promptCount !== undefined && (
          <Box paddingX={1} paddingY={0}>
            <Text>Prompts: <Text color="cyan">{server.promptCount} prompts</Text></Text>
          </Box>
        )}
        {server.resourceCount !== undefined && (
          <Box paddingX={1} paddingY={0}>
            <Text>Resources: <Text color="cyan">{server.resourceCount} resources</Text></Text>
          </Box>
        )}
        <Box height={1} />
        {actionMenuItems.map((action, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <Box key={action} paddingX={1} paddingY={0}>
              <Text>
                {isSelected ? '❯ ' : '  '}
                <Text inverse={isSelected} bold={isSelected} color={isSelected ? undefined : 'yellow'}>
                  {action}
                </Text>
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
