import React from 'react';
import { TabInstance } from './TabManager';

interface PromptTabProps {
  id: string;
  activeTabId: string | null;
  name: string;
  type: string;
}

export const PromptTab: React.FC<PromptTabProps> = ({ id, activeTabId, name, type }) => {
  if (id !== activeTabId) return null;

  return (
    <div className="prompt-tab">
      <h2>System Prompt</h2>
      <p>This tab will allow editing of the system prompt.</p>
    </div>
  );
}; 