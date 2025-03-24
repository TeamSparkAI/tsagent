import React from 'react';
import { RulesTab } from './RulesTab';
import { PromptTab } from './PromptTab';
import { ChatTab } from './ChatTab';
import { TabContent } from '../types/TabContent';
import '../styles/AppLayout.css';

interface Tab {
  label: string;
  id: string;
  content: React.ReactNode;
}

export const AppLayout: React.FC = () => {
  const [activeTabId, setActiveTabId] = React.useState('chat');

  const tabs: Tab[] = [
    {
      id: 'chat',
      label: 'Chat',
      content: <ChatTab id="chat" activeTabId={activeTabId} name="Chat" type="chat" />
    },
    {
      id: 'prompt',
      label: 'Prompt',
      content: <PromptTab id="prompt" activeTabId={activeTabId} name="Prompt" type="prompt" />
    },
    {
      id: 'rules',
      label: 'Rules',
      content: <RulesTab 
        id="rules"
        activeTabId={activeTabId}
        name="Rules"
        type="rules"
      />
    }
  ];

  return (
    <div className="app-container">
      <div className="tabs">
        {tabs.map(tab => (
          <button 
            key={tab.id}
            className={`tab-button ${activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tab-content">
        {tabs.find(tab => tab.id === activeTabId)?.content}
      </div>
    </div>
  );
}; 