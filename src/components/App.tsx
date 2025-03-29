import React, { useState, useEffect } from 'react';
import { TabManager } from './TabManager';
import { ChatTab } from './ChatTab';
import { Tools } from './Tools';
import { PromptTab } from './PromptTab';
import { RulesTab } from './RulesTab';
import { ReferencesTab } from './ReferencesTab';
import { v4 as uuidv4 } from 'uuid';
import { TabProps } from '../types/TabProps';

interface TabInstance {
  id: string;
  type: string;
  title: string;
}

export const App: React.FC = () => {
  const [tabs, setTabs] = useState<TabInstance[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Create initial tabs
  useEffect(() => {
    const initialTabs = [
      {
        id: uuidv4(),
        type: 'prompt',
        title: 'Prompt'
      },
      {
        id: uuidv4(),
        type: 'references',
        title: 'References'
      },
      {
        id: uuidv4(),
        type: 'rules',
        title: 'Rules'
      },
      {
        id: uuidv4(),
        type: 'tools',
        title: 'Tools'
      },
      {
        id: uuidv4(),
        type: 'chat',
        title: 'Chat'
      }
    ];
    setTabs(initialTabs);
    setActiveTabId(initialTabs[4].id);  // Update index to keep Chat as default
  }, []);

  const handleAddTab = (type: string) => {
    if (type !== 'chat') return; // Only allow creating new chat tabs
    const newTab = {
      id: uuidv4(),
      type,
      title: type === 'chat' ? 'Chat' : 'Tools'
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleCloseTab = (id: string) => {
    // Only allow closing chat tabs
    if (tabs.find(tab => tab.id === id)?.type !== 'chat') return;
    
    setTabs(tabs.filter(tab => tab.id !== id));
    if (activeTabId === id) {
      const remainingTabs = tabs.filter(tab => tab.id !== id);
      setActiveTabId(remainingTabs[0]?.id || null);
    }
  };

  const renderTabContent = (tab: TabInstance) => {
    switch (tab.type) {
      case 'chat':
        return <ChatTab key={tab.id} id={tab.id} activeTabId={activeTabId} name={tab.title} type={tab.type} />;
      case 'prompt':
        return <PromptTab key={tab.id} id={tab.id} activeTabId={activeTabId} name={tab.title} type={tab.type} />;
      case 'rules':
        return <RulesTab key={tab.id} id={tab.id} activeTabId={activeTabId} name={tab.title} type={tab.type} />;
      case 'references':
        return <ReferencesTab key={tab.id} id={tab.id} activeTabId={activeTabId} name={tab.title} type={tab.type} />;
      case 'tools':
        return <Tools key={tab.id} id={tab.id} activeTabId={activeTabId} name={tab.title} type={tab.type} />;
      default:
        return <div key={tab.id} />;
    }
  };

  return (
    <TabManager 
      onAddTab={handleAddTab} 
      activeTabId={activeTabId} 
      onTabChange={setActiveTabId}
      onCloseTab={handleCloseTab}
    >
      {tabs.map(renderTabContent)}
    </TabManager>
  );
}; 