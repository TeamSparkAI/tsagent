import React, { useState, useEffect } from 'react';
import { TabManager } from './TabManager';
import { ChatTab } from './ChatTab';
import { Tools } from './Tools';
import { v4 as uuidv4 } from 'uuid';

interface TabInstance {
  id: string;
  type: string;
  title: string;
}

export const App: React.FC = () => {
  const [tabs, setTabs] = useState<TabInstance[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Create initial chat tab
  useEffect(() => {
    // Create both tabs on mount
    const initialTabs = [
      {
        id: uuidv4(),
        type: 'chat',
        title: 'Chat'
      },
      {
        id: uuidv4(),
        type: 'tools',
        title: 'Tools'
      }
    ];
    setTabs(initialTabs);
    setActiveTabId(initialTabs[0].id);
  }, []); // Empty dependency array means this runs once on mount

  const handleAddTab = (type: string) => {
    if (type !== 'chat') return; // Only allow creating new chat tabs
    console.log('Adding tab of type:', type);
    const newTab = {
      id: uuidv4(),
      type,
      title: type === 'chat' ? 'Chat' : 'Tools'
    };
    console.log('New tab:', newTab);
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleCloseTab = (id: string) => {
    // Don't allow closing the Tools tab
    if (tabs.find(tab => tab.id === id)?.type === 'tools') return;
    
    setTabs(tabs.filter(tab => tab.id !== id));
    if (activeTabId === id) {
      const remainingTabs = tabs.filter(tab => tab.id !== id);
      setActiveTabId(remainingTabs[0]?.id || null);
    }
  };

  return (
    <TabManager 
      onAddTab={handleAddTab} 
      activeTabId={activeTabId} 
      onTabChange={setActiveTabId}
      onCloseTab={handleCloseTab}
    >
      {tabs.map(tab => {
        console.log('Rendering tab:', tab);
        return tab.type === 'chat' 
          ? <ChatTab key={tab.id} id={tab.id} activeTabId={activeTabId} name={tab.title} type={tab.type} />
          : <Tools key={tab.id} id={tab.id} activeTabId={activeTabId} name={tab.title} type={tab.type} />
      })}
    </TabManager>
  );
}; 