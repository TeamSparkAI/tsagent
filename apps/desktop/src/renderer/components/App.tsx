import React, { useState, useEffect } from 'react';
import { TabManager } from './TabManager';
import { ChatTab } from './ChatTab';
import { Tools } from './Tools';
import { RulesTab } from './RulesTab';
import { ReferencesTab } from './ReferencesTab';
import { AgentTab } from './AgentTab';
import { ProvidersTab } from './ProvidersTab';
import { SettingsTab } from './SettingsTab';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';

// NOTE: Currently, all tabs are remounted (here in App.tsx) on agent:switch
// - This is how rules/references tabs are getting reloaded even though they don't listen for workplace:switch
// - We could try to be more clever, because all tabs other than the Chat tabs don't actually need to detach/attach (they can update themselves on agent:switch)

interface TabInstance {
  id: string;
  type: string;
  title: string;
}

export const App: React.FC = () => {
  const [tabs, setTabs] = useState<TabInstance[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [hasAgent, setHasAgent] = useState<boolean>(false);

  // Define checkAgent function outside useEffect so it can be called directly
  const checkAgent = async () => {
    try {
      log.info('[APP] checkAgent called');
      const currentWindowId = await window.api.getCurrentWindowId();
      log.info(`[APP] Current window ID: ${currentWindowId}`);
      
      const activeWindows = await window.api.getActiveWindows();
      log.info(`[APP] Active windows: ${JSON.stringify(activeWindows)}`);
      
      // Check if the current window is registered with an agent
      const isRegistered = activeWindows.some(window => window.windowId === currentWindowId);
      log.info(`[APP] Window ${currentWindowId} is ${isRegistered ? 'registered' : 'not registered'} with an agent`);
      
      setHasAgent(isRegistered);
      
      log.info(`[APP] Agent status: ${isRegistered ? 'Selected' : 'Not selected'}`);
      
      // If an agent is selected, replace all tabs
      if (isRegistered) {
        log.info('[APP] Creating all tabs for agent');
        const allTabs = [
          {
            id: uuidv4(),
            type: 'agent',
            title: 'Agent'
          },
          {
            id: uuidv4(),
            type: 'providers',
            title: 'Providers'
          },
          {
            id: uuidv4(),
            type: 'settings',
            title: 'Settings'
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
        log.info(`[APP] Setting ${allTabs.length} tabs`);
        setTabs(allTabs);
        // Set the first tab (agent) as active
        log.info(`[APP] Setting active tab to ${allTabs[0].id}`);
        setActiveTabId(allTabs[0].id);
      } else {
        // If no agent is selected, only show the agent tab
        log.info('[APP] No agent selected, only showing agent tab');
        const agentTab = {
          id: uuidv4(),
          type: 'agent',
          title: 'Agent'
        };
        log.info(`[APP] Setting single tab: ${agentTab.id}`);
        setTabs([agentTab]);
        log.info(`[APP] Setting active tab to ${agentTab.id}`);
        setActiveTabId(agentTab.id);
      }
    } catch (error) {
      log.error('[APP] Error checking agent status:', error);
      setHasAgent(false);
    }
  };

  // Check if an agent is selected
  useEffect(() => {
    log.info('[APP] Initial checkAgent call');
    checkAgent();
    
    // Listen for agent switched event from the API
    const handleAgentSwitched = async (data: { windowId: string, agentPath: string, targetWindowId: string }) => {
      log.info('[APP] Agent switched event received from API with data:', data);
      
      const currentWindowId = await window.api.getCurrentWindowId();
      log.info(`[APP] Current window ID: ${currentWindowId}, target window ID: ${data.targetWindowId}`);
        
      // Only update the UI if this event is targeted at the current window
      if (currentWindowId === data.targetWindowId) {
        log.info(`[APP] Event is targeted at this window, updating tabs`);
        checkAgent();
      }
    };
    
    log.info('[APP] Setting up agent:switched event listener');
    const listener = window.api.onAgentSwitched(handleAgentSwitched);
    
    return () => {
      if (listener) {
        log.info('[APP] Cleaning up agent:switched event listener');
        window.api.offAgentSwitched(listener);
      }
    };
  }, []); // Empty dependency array to avoid circular dependency

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
      case 'agent':
        return <AgentTab key={tab.id} id={tab.id} activeTabId={activeTabId} name={tab.title} type={tab.type} />;
      case 'providers':
        return <ProvidersTab key={tab.id} id={tab.id} activeTabId={activeTabId} name={tab.title} type={tab.type} />;
      case 'settings':
        return <SettingsTab key={tab.id} id={tab.id} activeTabId={activeTabId} name={tab.title} type={tab.type} />;
      case 'chat':
        return <ChatTab key={tab.id} id={tab.id} activeTabId={activeTabId} name={tab.title} type={tab.type} />;
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
      hasAgent={hasAgent}
    >
      {tabs.map(renderTabContent)}
    </TabManager>
  );
}; 