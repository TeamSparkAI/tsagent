import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatTab } from './ChatTab';
import { Tools } from './Tools';

export interface TabInstance {
  id: string;
  type: string;
  title: string;
}

interface TabChildProps {
  id: string;
  activeTabId: string | null;
  name: string;
}

interface TabManagerProps {
  children: React.ReactNode;
  onAddTab: (type: string) => void;
  activeTabId: string | null;
  onTabChange: (id: string | null) => void;
  onCloseTab: (id: string) => void;
}

export const TabManager: React.FC<TabManagerProps> = ({ 
  children, 
  onAddTab,
  activeTabId,
  onTabChange,
  onCloseTab
}) => {
  return (
    <div className="tab-container">
      <div className="tab-buttons">
        {React.Children.map(children, (child: any) => (
          <button
            key={child.props.id}
            className={`tab-button ${activeTabId === child.props.id ? 'active' : ''}`}
            onClick={() => onTabChange(child.props.id)}
          >
            {child.props.name}
            {child.props.type === 'chat' && 
              <span className="close-button" onClick={(e) => { e.stopPropagation(); onCloseTab(child.props.id); }}>×</span>
            }
          </button>
        ))}
        <button className="new-tab-button" onClick={() => onAddTab('chat')}>+ New Chat</button>
      </div>
      {React.Children.map(children, child => {
        if (React.isValidElement<TabChildProps>(child)) {
          return (
            <div className={`tab-content ${activeTabId === child.props.id ? 'active' : ''}`}>
              {React.cloneElement(child, {
                ...child.props,
                activeTabId
              })}
            </div>
          );
        }
        return child;
      })}
    </div>
  );
}; 