import React from 'react';

interface ToolsProps {
  id: string;
  activeTabId: string | null;
  name: string;
  type: string;
}

export const Tools: React.FC<ToolsProps> = ({ id, activeTabId }) => {
  console.log('Tools component rendering with id:', id, 'activeTabId:', activeTabId);
  if (id !== activeTabId) return null;
  
  return (
    <div className="tools-container">
      <div>Tools</div>
    </div>
  );
}; 