import React from 'react';
import { render } from 'ink';
import { ResourceDetails } from './ResourceDetails.js';
import type { ResourceDetailsData } from './ResourceDetails.js';
import { useCleanExit } from './useCleanExit.js';

interface ResourceDetailsAppProps {
  resource: ResourceDetailsData;
  onBack: () => void;
}

function ResourceDetailsAppInner({ resource, onBack }: ResourceDetailsAppProps) {
  const { isExiting, triggerExit } = useCleanExit(() => onBack());

  const handleBack = () => {
    triggerExit();
  };

  if (isExiting) {
    return null;
  }

  return <ResourceDetails resource={resource} onBack={handleBack} />;
}

export function renderResourceDetails(resource: ResourceDetailsData): Promise<void> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <ResourceDetailsAppInner
        resource={resource}
        onBack={() => {
          unmount();
          resolve();
        }}
      />
    );
  });
}
