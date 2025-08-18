import React from 'react';
import { RulesTab } from './RulesTab';
import { ChatTab } from './ChatTab';
import { ReferencesTab } from './ReferencesTab';
import { AgentTab } from './AgentTab';
import { ProvidersTab } from './ProvidersTab';
import { SettingsTab } from './SettingsTab';
import { Tools } from './Tools';

interface Tab {
  label: string;
  id: string;
  content: React.ReactNode;
}

export const AppLayout: React.FC = () => {
  const [activeTabId, setActiveTabId] = React.useState('agent');

  const tabs: Tab[] = [
    {
      id: 'agent',
      label: 'Agent',
      content: <AgentTab id="agent" activeTabId={activeTabId} name="Agent" type="agent" />
    },
    {
      id: 'providers',
      label: 'Providers',
      content: <ProvidersTab id="providers" activeTabId={activeTabId} name="Providers" type="providers" />
    },
    {
      id: 'settings',
      label: 'Settings',
      content: <SettingsTab id="settings" activeTabId={activeTabId} name="Settings" type="settings" />
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
      id: 'tools',
      label: 'Tools',
      content: <Tools id="tools" activeTabId={activeTabId} name="Tools" type="tools" />
    },
    {
      id: 'chat',
      label: 'Chat',
      content: <ChatTab id="chat" activeTabId={activeTabId} name="Chat" type="chat" />
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