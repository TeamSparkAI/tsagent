import React from 'react';
import { RulesTab } from './RulesTab';
import { PromptTab } from './PromptTab';
import { ChatTab } from './ChatTab';
import { ReferencesTab } from './ReferencesTab';
import { WorkspaceTab } from './WorkspaceTab';
import { TabContent } from '../types/TabContent';
import '../styles/AppLayout.css';

interface Tab {
  label: string;
  id: string;
  content: React.ReactNode;
}

export const AppLayout: React.FC = () => {
  const [activeTabId, setActiveTabId] = React.useState('workspace');

  const tabs: Tab[] = [
    {
      id: 'workspace',
      label: 'Workspace',
      content: <WorkspaceTab id="workspace" activeTabId={activeTabId} name="Workspace" type="workspace" />
    },
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
    },
    {
      id: 'references',
      label: 'References',
      content: <ReferencesTab 
        id="references"
        activeTabId={activeTabId}
        name="References"
        type="references"
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