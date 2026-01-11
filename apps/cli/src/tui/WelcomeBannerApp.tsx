import React, { useEffect } from 'react';
import { render, useApp, useInput } from 'ink';
import { WelcomeBanner } from './WelcomeBanner.js';

interface WelcomeBannerAppProps {
  version: string;
  agentPath: string;
  agentName?: string;
  onComplete: () => void;
}

function WelcomeBannerAppInner({ version, agentPath, agentName, onComplete }: WelcomeBannerAppProps) {
  const { exit } = useApp();

  // Handle any key press to continue
  useInput(() => {
    exit();
    onComplete();
  });

  useEffect(() => {
    // Also auto-continue after 3 seconds
    const timer = setTimeout(() => {
      exit();
      onComplete();
    }, 3000);

    return () => clearTimeout(timer);
  }, [exit, onComplete]);

  return (
    <WelcomeBanner
      version={version}
      agentPath={agentPath}
      agentName={agentName}
    />
  );
}

export function showWelcomeBanner(
  version: string,
  agentPath: string,
  agentName?: string
): Promise<void> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <WelcomeBannerAppInner
        version={version}
        agentPath={agentPath}
        agentName={agentName}
        onComplete={() => {
          unmount();
          // Small delay to ensure clean unmount
          setTimeout(() => resolve(), 100);
        }}
      />
    );
  });
}
