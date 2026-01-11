import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';

export interface ProviderItem {
  id: string;
  name: string;
  isInstalled: boolean;
}

interface ProviderManagementListProps {
  title: string;
  providers: ProviderItem[];
  onSubmit: (providerId: string, action: 'install' | 'view' | 'reconfigure' | 'remove') => void;
  onCancel?: () => void;
}

export function ProviderManagementList({ title, providers, onSubmit, onCancel }: ProviderManagementListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [actionMenuIndex, setActionMenuIndex] = useState(0);

  const selectedProvider = providers[selectedIndex];
  const isInstalled = selectedProvider?.isInstalled ?? false;

  // Action menu items (only shown for installed providers)
  const actionMenuItems = ['View', 'Reconfigure', 'Remove'];

  // Calculate visible range for scrolling
  const maxVisible = 10;
  const startIndex = Math.max(0, selectedIndex - maxVisible + 1);
  const endIndex = Math.min(providers.length, startIndex + maxVisible);
  const visibleProviders = providers.slice(startIndex, endIndex);
  const visibleSelectedIndex = selectedIndex - startIndex;

  // Handle keyboard input
  useInput((input: string, key: any) => {
    if (isComplete) return;

    if (showActionMenu) {
      // Handle action menu navigation
      if (key.upArrow) {
        setActionMenuIndex(prev => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow) {
        setActionMenuIndex(prev => Math.min(actionMenuItems.length - 1, prev + 1));
        return;
      }

      if (key.return) {
        const action = actionMenuItems[actionMenuIndex].toLowerCase() as 'view' | 'reconfigure' | 'remove';
        setIsComplete(true);
        setTimeout(() => {
          onSubmit(selectedProvider.id, action);
        }, 0);
        return;
      }

      if (key.escape) {
        setShowActionMenu(false);
        return;
      }
    } else {
      // Handle main list navigation
      if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow) {
        setSelectedIndex(prev => Math.min(providers.length - 1, prev + 1));
        return;
      }

      if (key.return) {
        if (isInstalled) {
          // Show action menu for installed providers
          setShowActionMenu(true);
          setActionMenuIndex(0);
        } else {
          // Direct install for uninstalled providers
          setIsComplete(true);
          setTimeout(() => {
            onSubmit(selectedProvider.id, 'install');
          }, 0);
        }
        return;
      }

      if (key.escape) {
        if (onCancel) {
          setIsComplete(true);
          setTimeout(() => {
            onCancel();
          }, 0);
        }
        return;
      }

      if (key.ctrl && input === 'c') {
        if (onCancel) {
          setIsComplete(true);
          setTimeout(() => {
            onCancel();
          }, 0);
        }
        return;
      }
    }
  });

  // Don't render if complete
  if (isComplete) {
    return null;
  }

  if (showActionMenu && selectedProvider) {
    // Show action menu
    return (
      <Box flexDirection="column">
        <Box height={1} />
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" position="relative">
          <Box position="absolute" marginTop={-1} marginLeft={2}>
            <Text bold color="cyan">{title} - {selectedProvider.name}</Text>
          </Box>
          <Box height={1} />
          {actionMenuItems.map((action, idx) => {
            const isSelected = idx === actionMenuIndex;
            return (
              <Box key={action} paddingX={1} paddingY={0}>
                <Text inverse={isSelected}>
                  {isSelected ? '▶ ' : '  '}
                  <Text bold={isSelected}>{action}</Text>
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

  // Show main provider list
  return (
    <Box flexDirection="column">
      <Box height={1} />
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" position="relative">
        <Box position="absolute" marginTop={-1} marginLeft={2}>
          <Text bold color="cyan">{title}</Text>
        </Box>
        <Box height={1} />
        {visibleProviders.map((provider, idx) => {
          const isSelected = idx === visibleSelectedIndex;
          const marker = provider.isInstalled ? '*' : ' ';
          
          return (
            <Box key={provider.id} paddingX={1} paddingY={0}>
              <Text inverse={isSelected}>
                {isSelected ? '▶ ' : '  '}
                <Text color={provider.isInstalled ? 'green' : (isSelected ? undefined : 'gray')} bold={isSelected || provider.isInstalled}>
                  {marker} {provider.id}
                </Text>
                {provider.name && (
                  <Text color={isSelected ? undefined : 'gray'}>
                    {' - '}{provider.name}
                  </Text>
                )}
              </Text>
            </Box>
          );
        })}
        {providers.length > maxVisible && (
          <Box paddingX={1} paddingY={0}>
            <Text color="cyan">
              {selectedIndex + 1} of {providers.length} (↑↓ to navigate, Enter to select, Esc to cancel)
            </Text>
          </Box>
        )}
        {providers.length <= maxVisible && (
          <Box paddingX={1} paddingY={0}>
            <Text color="cyan">
              {selectedProvider?.isInstalled 
                ? '↑↓ to navigate, Enter: view/reconfigure/remove, Esc: cancel'
                : '↑↓ to navigate, Enter: install, Esc: cancel'}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
