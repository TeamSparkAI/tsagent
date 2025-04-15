import React, { useState, useEffect } from 'react';
import { TabManager } from './TabManager';
import { ChatTab } from './ChatTab';
import { Tools } from './Tools';
import { PromptTab } from './PromptTab';
import { RulesTab } from './RulesTab';
import { ReferencesTab } from './ReferencesTab';
import { WorkspaceTab } from './WorkspaceTab';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log';

interface TabInstance {
  id: string;
  type: string;
  title: string;
}

export const App: React.FC = () => {
  const [tabs, setTabs] = useState<TabInstance[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [hasWorkspace, setHasWorkspace] = useState<boolean>(false);

  // Define checkWorkspace function outside useEffect so it can be called directly
  const checkWorkspace = async () => {
    try {
      log.info('[APP] checkWorkspace called');
      const currentWindowId = await window.api.getCurrentWindowId();
      log.info(`[APP] Current window ID: ${currentWindowId}`);
      
      const activeWindows = await window.api.getActiveWindows();
      log.info(`[APP] Active windows: ${JSON.stringify(activeWindows)}`);
      
      // Check if the current window is registered with a workspace
      const isRegistered = activeWindows.some(window => window.windowId === currentWindowId);
      log.info(`[APP] Window ${currentWindowId} is ${isRegistered ? 'registered' : 'not registered'} with a workspace`);
      
      setHasWorkspace(isRegistered);
      
      log.info(`[APP] Workspace status: ${isRegistered ? 'Selected' : 'Not selected'}`);
      
      // If a workspace is selected, replace all tabs
      if (isRegistered) {
        log.info('[APP] Creating all tabs for workspace');
        const allTabs = [
          {
            id: uuidv4(),
            type: 'workspace',
            title: 'Workspace'
          },
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
        log.info(`[APP] Setting ${allTabs.length} tabs`);
        setTabs(allTabs);
        // Set the first tab (workspace) as active
        log.info(`[APP] Setting active tab to ${allTabs[0].id}`);
        setActiveTabId(allTabs[0].id);
      } else {
        // If no workspace is selected, only show the workspace tab
        log.info('[APP] No workspace selected, only showing workspace tab');
        const workspaceTab = {
          id: uuidv4(),
          type: 'workspace',
          title: 'Workspace'
        };
        log.info(`[APP] Setting single tab: ${workspaceTab.id}`);
        setTabs([workspaceTab]);
        log.info(`[APP] Setting active tab to ${workspaceTab.id}`);
        setActiveTabId(workspaceTab.id);
      }
    } catch (error) {
      log.error('[APP] Error checking workspace status:', error);
      setHasWorkspace(false);
    }
  };

  // Check if a workspace is selected
  useEffect(() => {
    log.info('[APP] Initial checkWorkspace call');
    checkWorkspace();
    
    // Listen for workspace switched event from the API
    const handleWorkspaceSwitched = async (data: { windowId: string, workspacePath: string, targetWindowId: string }) => {
      log.info('[APP] Workspace switched event received from API with data:', data);
      
      const currentWindowId = await window.api.getCurrentWindowId();
      log.info(`[APP] Current window ID: ${currentWindowId}, target window ID: ${data.targetWindowId}`);
        
      // Only update the UI if this event is targeted at the current window
      if (currentWindowId === data.targetWindowId) {
        log.info(`[APP] Event is targeted at this window, updating tabs`);
        checkWorkspace();
      }
    };
    
    log.info('[APP] Setting up workspace:switched event listener');
    const listener = window.api.onWorkspaceSwitched(handleWorkspaceSwitched);
    
    return () => {
      if (listener) {
        log.info('[APP] Cleaning up workspace:switched event listener');
        window.api.offWorkspaceSwitched(listener);
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
      case 'workspace':
        return <WorkspaceTab key={tab.id} id={tab.id} activeTabId={activeTabId} name={tab.title} type={tab.type} />;
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
      hasWorkspace={hasWorkspace}
    >
      {tabs.map(renderTabContent)}
    </TabManager>
  );
}; 