import React from 'react';
import { TabInstance } from './TabManager';

interface RulesTabProps {
  id: string;
  activeTabId: string | null;
  name: string;
  type: string;
}

export const RulesTab: React.FC<RulesTabProps> = ({ id, activeTabId, name, type }) => {
  if (id !== activeTabId) return null;

  return (
    <div className="rules-tab">
      <h2>Rules</h2>
      <p>This tab will show the rules configuration.</p>
    </div>
  );
}; 