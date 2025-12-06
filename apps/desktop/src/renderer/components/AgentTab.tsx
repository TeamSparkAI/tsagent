import React, { useState, useEffect, useCallback } from 'react';
import { TabProps } from '../types/TabProps';
import type { AgentWindow } from '../../main/agents-manager';
import { AgentMetadata } from '@tsagent/core';
import log from 'electron-log';
import './AgentTab.css';


interface AgentInfoProps {
  agentPath: string;
  showPath?: boolean;
}

const AgentInfo: React.FC<AgentInfoProps> = ({ agentPath, showPath = true }) => {
  const [metadata, setMetadata] = useState<AgentMetadata | null>(null);
  const [actualPath, setActualPath] = useState<string>(agentPath);
  const [isLoading, setIsLoading] = useState(true);

  const loadMetadata = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await window.api.getAgentMetadataByPath(agentPath);
      if (result) {
        setMetadata(result.metadata);
        setActualPath(result.path); // Use actual path after migration
      } else {
        setMetadata(null);
        setActualPath(agentPath);
      }
    } catch (err) {
      log.error('Error loading agent metadata:', err);
      setMetadata(null);
      setActualPath(agentPath);
    } finally {
      setIsLoading(false);
    }
  }, [agentPath]);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    // Refresh metadata when a metadata-changed event fires for this agent
    const listener = window.api.onMetadataChanged(async (data) => {
      try {
        if (!data || !data.agentPath) return;
        // If the changed agent matches this component's agentPath (or resolved path), reload
        if (data.agentPath === agentPath || data.agentPath === actualPath) {
          await loadMetadata();
        }
      } catch (error) {
        log.error('[AGENT TAB] Error handling metadata-changed event in AgentInfo:', error);
      }
    });

    return () => {
      window.api.offMetadataChanged(listener);
    };
  }, [agentPath, actualPath, loadMetadata]);

  if (isLoading) {
    return (
      <div className="agent-info">
        <div className="agent-name">Loading...</div>
        {showPath && <div className="agent-path">{actualPath}</div>}
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="agent-info">
        <div className="agent-name">Unknown Agent</div>
        {showPath && <div className="agent-path">{actualPath}</div>}
      </div>
    );
  }

  const truncateDescription = (description: string | undefined, maxLength: number = 60) => {
    if (!description) return '';
    return description.length > maxLength ? description.substring(0, maxLength) + '...' : description;
  };

  // Use autonomous property to determine display name
  const modeDisplayName = metadata.autonomous ? 'Autonomous' : 'Interactive';

  return (
    <div className="agent-info">
      <div className="agent-name">{metadata.name} ({modeDisplayName})</div>
      {metadata.description && (
        <div className="agent-description">{truncateDescription(metadata.description)}</div>
      )}
      {showPath && <div className="agent-path">{actualPath}</div>}
    </div>
  );
};

interface AgentTabProps extends TabProps {
  id: string;
  name: string;
  activeTabId: string | null;
}

export const AgentTab: React.FC<AgentTabProps> = ({ id, name, activeTabId }) => {
  const [activeWindows, setActiveWindows] = useState<AgentWindow[]>([]);
  const [recentAgents, setRecentAgents] = useState<string[]>([]);
  const [currentWindowId, setCurrentWindowId] = useState<string | null>(null);
  const [isHelpVisible, setIsHelpVisible] = useState<boolean>(false);

  // Function to load agent data
  const loadData = async () => {
    try {
      log.info('[AGENT TAB] Loading agent data');
      // Load all data in parallel
      const [windows, currentId, recent] = await Promise.all([
        window.api.getActiveWindows(),
        window.api.getCurrentWindowId(),
        window.api.getRecentAgents()
      ]);
      
      // Update state with all data at once
      setActiveWindows(windows);
      setCurrentWindowId(currentId);
      setRecentAgents(recent);
      
      // Show help panel only if there's no current agent
      const currentAgent = windows.find(window => window.windowId === currentId);
      setIsHelpVisible(!currentAgent);
      
      log.info('[AGENT TAB] Agent data loaded successfully:', {
        windows: windows.length,
        currentId,
        recent: recent.length
      });
    } catch (error) {
      log.error('[AGENT TAB] Error loading agent data:', error);
      // Set empty states on error
      setActiveWindows([]);
      setCurrentWindowId(null);
      setRecentAgents([]);
    }
  };

  useEffect(() => {
    // Load initial data
    loadData();
  }, []);

  useEffect(() => {
    // Listen for agent switched event using the API method
    const handleAgentSwitched = async (data: { windowId: string, agentPath: string, targetWindowId: string }) => {      
      try {
        // Get the current window ID
        const id = await window.api.getCurrentWindowId();
        log.info(`[AGENT TAB] Current window ID: ${id}, target window ID: ${data.targetWindowId}`);
        
        // Only update the UI if this event is targeted at the current window
        if (id === data.targetWindowId) {
          log.info(`[AGENT TAB] Event is targeted at this window, refreshing all agent data`);
          await loadData();
        } else {
          log.info(`[AGENT TAB] Event is not targeted at this window, refreshing active windows only`);
          // If not targeted, we still need to update the activeWindows list, but we'll do it without refreshing the entire UI
          const windows = await window.api.getActiveWindows();
          setActiveWindows(windows);
        }
      } catch (error) {
        log.error(`[AGENT TAB] Error in agent switch handler:`, error);
      }
    };
    
    // Set up event listeners
    log.info('[AGENT TAB] Setting up event listeners');
    const switchedListener = window.api.onAgentSwitched(handleAgentSwitched);

    // Also listen for agent deletions so we can refresh lists in all windows
    const deletedListener = window.api.onAgentDeleted(async (_data: { agentPath: string }) => {
      try {
        log.info('[AGENT TAB] agent-deleted event received, refreshing agent data');
        await loadData();
      } catch (error) {
        log.error('[AGENT TAB] Error handling agent-deleted event:', error);
      }
    });
    
    // Clean up the event listeners when the component unmounts
    return () => {
      if (switchedListener) {
        log.info('[AGENT TAB] Cleaning up agent-switched listener');
        window.api.offAgentSwitched(switchedListener);
      }
      if (deletedListener) {
        log.info('[AGENT TAB] Cleaning up agent-deleted listener');
        window.api.offAgentDeleted(deletedListener);
      }
    };
  }, []);

  const handleOpenAgent = async () => {
    try {
      log.info(`[AGENT OPEN] handleOpenAgent called`);
      
      // Show the open dialog
      const result = await window.api.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Agent Files', extensions: ['yaml', 'yml', 'json'] }],
        title: 'Select Agent File'
      });
      
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        log.info(`[AGENT OPEN] Dialog canceled or no file selected`);
        return;
      }
      
      const agentPath = result.filePaths[0];
      log.info(`[AGENT OPEN] Selected agent path: ${agentPath}`);
      
      // Get the current window ID
      const currentId = await window.api.getCurrentWindowId();
      log.info(`[AGENT OPEN] Current window ID: ${currentId}`);
      
      if (!currentId) {
        log.error(`[AGENT OPEN] No current window ID found`);
        return;
      }
      
      // Open the agent
      log.info(`[AGENT OPEN] Calling openAgent with path: ${agentPath}`);
      await window.api.openAgent(agentPath);
      log.info(`[AGENT OPEN] openAgent completed`);
      
      // Force a refresh of the data
      log.info(`[AGENT OPEN] Calling loadData to refresh agent data`);
      await loadData();
      log.info(`[AGENT OPEN] loadData completed`);
    } catch (error) {
      log.error(`[AGENT OPEN] Error in handleOpenAgent:`, error);
    }
  };

  const handlecreateAgent = async () => {
    try {
      log.info(`[AGENT CREATE] handlecreateAgent called`);
      
      // Show the save dialog to create a new agent file
      const result = await window.api.showSaveDialog({
        title: 'Create New Agent',
        defaultPath: 'tsagent.yaml',
        filters: [
          { name: 'Agent Files', extensions: ['yaml', 'yml'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        buttonLabel: 'Create'
      });
      
      if (result.canceled || !result.filePath) {
        log.info(`[AGENT CREATE] Dialog canceled or no file path selected`);
        return;
      }
      
      let agentPath = result.filePath;
      log.info(`[AGENT CREATE] Selected agent path: ${agentPath}`);

      // Ensure the file has a valid extension - add .yaml if missing
      const lowerPath = agentPath.toLowerCase();
      if (!lowerPath.endsWith('.yaml') && !lowerPath.endsWith('.yml')) {
        // No extension provided, add .yaml
        agentPath = agentPath + '.yaml';
        log.info(`[AGENT CREATE] Added .yaml extension: ${agentPath}`);
      }

      // Check if agent already exists at the target location
      const agentExists = await window.api.agentExists(agentPath);
      if (agentExists) {
        log.error(`[AGENT CREATE] Agent already exists at: ${agentPath}`);
        await window.api.showMessageBox({
          type: 'error',
          title: 'Create Failed',
          message: 'Failed to create agent',
          detail: 'An agent already exists at the selected location',
          buttons: ['OK']
        });
        return;
      }
      
      // Get the current window ID
      const currentId = await window.api.getCurrentWindowId();
      log.info(`[AGENT CREATE] Current window ID: ${currentId}`);
      
      if (!currentId) {
        log.error(`[AGENT CREATE] No current window ID found`);
        return;
      }

      // Check if current window already has an agent
      const currentAgent = activeWindows.find(window => window.windowId === currentId);
      
      if (currentAgent) {
        // If current window has an agent, open in new window
        log.info(`[AGENT CREATE] Current window has agent, opening in new window`);
        await window.api.createAgentInNewWindow(agentPath);
      } else {
        // If current window has no agent, open in current window
        log.info(`[AGENT CREATE] Current window has no agent, opening in current window`);
        await window.api.createAgent(currentId, agentPath);
      }
      
      // Force a refresh of the data
      log.info(`[AGENT CREATE] Calling loadData to refresh agent data`);
      await loadData();
      log.info(`[AGENT CREATE] loadData completed`);
    } catch (error) {
      log.error(`[AGENT CREATE] Error in handlecreateAgent:`, error);
      // Show error dialog to user
      await window.api.showMessageBox({
        type: 'error',
        title: 'Create Failed',
        message: 'Failed to create agent',
        detail: error instanceof Error ? error.message : 'An unexpected error occurred',
        buttons: ['OK']
      });
    }
  };

  const handlecloneAgent = async () => {
    try {
      log.info(`[AGENT CLONE] handlecloneAgent called`);
      
      if (!currentAgent) {
        log.error(`[AGENT CLONE] No current agent to clone`);
        return;
      }

      const sourcePath = currentAgent.agentPath;

      // Ask main process for a sensible default clone path in the same directory
      const defaultPath = await window.api.getCloneDefaultPath(sourcePath);
      log.info(`[AGENT CLONE] Default clone path from main: ${defaultPath}`);

      const dialogResult = await window.api.showSaveDialog({
        title: 'Clone Agent',
        defaultPath,
        filters: [
          { name: 'Agent Files', extensions: ['yaml', 'yml'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        buttonLabel: 'Clone'
      });

      if (dialogResult.canceled || !dialogResult.filePath) {
        log.info(`[AGENT CLONE] Dialog canceled or no file path selected`);
        return;
      }

      let targetPath = dialogResult.filePath;
      log.info(`[AGENT CLONE] Selected target path: ${targetPath}`);

      // Ensure we have a YAML extension
      const lowerTarget = targetPath.toLowerCase();
      if (!lowerTarget.endsWith('.yaml') && !lowerTarget.endsWith('.yml')) {
        targetPath = `${targetPath}.yaml`;
        log.info(`[AGENT CLONE] Added .yaml extension to target path: ${targetPath}`);
      }

      // Check if target already exists
      const exists = await window.api.agentExists(targetPath);
      if (exists) {
        log.error(`[AGENT CLONE] Target agent already exists at: ${targetPath}`);
        await window.api.showMessageBox({
          type: 'error',
          title: 'Clone Failed',
          message: 'Failed to clone agent',
          detail: 'An agent already exists at the selected location',
          buttons: ['OK']
        });
        return;
      }

      // Clone the agent
      const cloneResult = await window.api.cloneAgent(sourcePath, targetPath);
      if (!cloneResult.success) {
        log.error(`[AGENT CLONE] Failed to clone agent: ${cloneResult.error}`);
        await window.api.showMessageBox({
          type: 'error',
          title: 'Clone Failed',
          message: 'Failed to clone agent',
          detail: cloneResult.error || 'An agent already exists at the target location',
          buttons: ['OK']
        });
        return;
      }

      // Optionally refresh data so the new clone appears in recent agents
      log.info('[AGENT CLONE] Clone succeeded, refreshing agent data');
      await loadData();
    } catch (error) {
      log.error(`[AGENT CLONE] Error in handlecloneAgent:`, error);
      // Show error dialog to user
      await window.api.showMessageBox({
        type: 'error',
        title: 'Clone Failed',
        message: 'Failed to clone agent',
        detail: error instanceof Error ? error.message : 'An unexpected error occurred',
        buttons: ['OK']
      });
    }
  };

  const handleSwitchAgent = async (windowId: string, agentPath: string) => {
    try {
      log.info(`[AGENT SWITCH] handleSwitchAgent called with windowId ${windowId} and agentPath ${agentPath}`);
      
      // Switch to the agent
      const success = await window.api.switchAgent(windowId, agentPath);
      
      if (success) {
        log.info(`[AGENT SWITCH] API call successful for agent ${agentPath} in window ${windowId}`);
      } else {
        log.error(`[AGENT SWITCH] API call failed for agent ${agentPath} in window ${windowId}`);
      }
    } catch (error) {
      log.error(`[AGENT SWITCH] Error in handleSwitchAgent:`, error);
    }
  };

  const handleOpenRecent = async (agentPath: string) => {
    try {
      log.info(`[AGENT OPEN RECENT] handleOpenRecent called with agentPath ${agentPath}`);
      
      // Get the current window ID
      const currentId = await window.api.getCurrentWindowId();
      log.info(`[AGENT OPEN RECENT] Current window ID: ${currentId}`);
      
      if (!currentId) {
        log.error(`[AGENT OPEN RECENT] No current window ID found`);
        return;
      }
      
      // Open the agent
      log.info(`[AGENT OPEN RECENT] Calling openAgent with path: ${agentPath}`);
      await window.api.openAgent(agentPath);
      log.info(`[AGENT OPEN RECENT] openAgent completed`);
      
      // Force a refresh of the data
      log.info(`[AGENT OPEN RECENT] Calling loadData to refresh agent data`);
      await loadData();
      log.info(`[AGENT OPEN RECENT] loadData completed`);
    } catch (error) {
      log.error(`[AGENT OPEN RECENT] Error in handleOpenRecent:`, error);
    }
  };

  const handleSwitchToRecent = async (agentPath: string) => {
    try {
      log.info(`[AGENT SWITCH] handleSwitchToRecent called with agentPath ${agentPath}`);
      
      // Get the current window ID
      const currentId = await window.api.getCurrentWindowId();
      log.info(`[AGENT SWITCH] Current window ID: ${currentId}`);
      
      if (!currentId) {
        log.error(`[AGENT SWITCH] No current window ID found`);
        return;
      }
      
      // First, check if the window is registered with an agent
      const windows = await window.api.getActiveWindows();
      log.info(`[AGENT SWITCH] Active windows: ${JSON.stringify(windows)}`);
      
      const isRegistered = windows.some(window => window.windowId === currentId);
      log.info(`[AGENT SWITCH] Window ${currentId} is ${isRegistered ? 'registered' : 'not registered'} with an agent`);
      
      if (!isRegistered) {
        log.info(`[AGENT SWITCH] Window ${currentId} is not registered with an agent, registering first`);
        // Register the window with the agent
        log.info(`[AGENT SWITCH] Calling openAgent with path: ${agentPath}`);
        await window.api.openAgent(agentPath);
        log.info(`[AGENT SWITCH] openAgent completed`);
      }
      
      // Always use switchAgent to ensure the agent:switched event is triggered
      log.info(`[AGENT SWITCH] Calling switchAgent with windowId: ${currentId} and path: ${agentPath}`);
      const success = await window.api.switchAgent(currentId.toString(), agentPath);
      log.info(`[AGENT SWITCH] switchAgent result: ${success}`);
      
      if (success) {
        // Force a refresh of the data
        log.info(`[AGENT SWITCH] Calling loadData to refresh agent data`);
        await loadData();
        log.info(`[AGENT SWITCH] loadData completed`);
      } else {
        log.error(`[AGENT SWITCH] Failed to switch to agent ${agentPath}`);
      }
    } catch (error) {
      log.error(`[AGENT SWITCH] Error in handleSwitchToRecent:`, error);
    }
  };

  const handleOpenRecentInNewWindow = async (agentPath: string) => {
    try {
      log.info(`[AGENT OPEN NEW WINDOW] handleOpenRecentInNewWindow called with agentPath ${agentPath}`);
      
      // Open the agent in a new window
      log.info(`[AGENT OPEN NEW WINDOW] Calling openInNewWindow with path: ${agentPath}`);
      await window.api.openInNewWindow(agentPath);
      log.info(`[AGENT OPEN NEW WINDOW] openInNewWindow completed`);
      
      // Force a refresh of the data
      log.info(`[AGENT OPEN NEW WINDOW] Calling loadData to refresh agent data`);
      await loadData();
      log.info(`[AGENT OPEN NEW WINDOW] loadData completed`);
    } catch (error) {
      log.error(`[AGENT OPEN NEW WINDOW] Error in handleOpenRecentInNewWindow:`, error);
    }
  };

  const handleFocusWindow = async (windowId: string) => {
    try {
      log.info(`[WINDOW FOCUS] handleFocusWindow called with windowId ${windowId}`);
      
      // Focus the window
      const result = await window.api.focusWindow(windowId);
      
      if (result) {
        log.info(`[WINDOW FOCUS] Successfully focused window ${windowId}`);
      } else {
        log.error(`[WINDOW FOCUS] Failed to focus window ${windowId}`);
      }
    } catch (error) {
      log.error(`[WINDOW FOCUS] Error in handleFocusWindow:`, error);
    }
  };

  // Get current window's agent
  const currentAgent = activeWindows.find(window => window.windowId === currentWindowId);
  
  // Get other active agents (excluding current)
  // Only include agents from other windows, not the current window
  const otherActiveAgents = activeWindows.filter(window => 
    window.windowId !== currentWindowId && 
    window.agentPath !== currentAgent?.agentPath
  );
  
  // Get recent agents (excluding active ones)
  const activePaths = activeWindows.map(window => window.agentPath);
  const filteredRecentAgents = recentAgents.filter(path => !activePaths.includes(path));
  
  log.debug('Agent state:', {
    currentWindowId,
    currentAgent: currentAgent,
    activePaths,
    recentAgents: recentAgents,
    filteredRecentAgents
  });
  
  return (
    <div className="agent-tab">
      <div className="help-header" style={{ marginBottom: isHelpVisible ? '8px' : '0' }}>
        <h2>Agent Management</h2>
        <button 
          className="about-button"
          onClick={() => setIsHelpVisible(!isHelpVisible)}
        >
          {isHelpVisible ? "Hide About" : "About"}
        </button>
      </div>
      <div className={`help-panel ${isHelpVisible ? '' : 'hidden'}`}>
        <div className="about-content">
          <p><strong>Manage Your Agents and Windows</strong></p>
          <p>
            All activity in this application takes place in an agent.  An agent can be any folder you choose, which will then be used to store your
            prompt, settings, providers, references, rules, and tools.  You can use one agent for everything, or you can make agents for different
            projects to organize your work.
          </p>
          <p>
            If you are running this application for first time, select Create Agent below, then select a new or empty folder to serve as your first agent.
          </p>
        </div>
      </div>
      <div className="agent-content">
        <div className="agent-section">    
          <div className="agent-actions">
            <button
              onClick={handleOpenAgent}
              className="btn configure-button"
            >
              Open Agent
            </button>
            <button
              onClick={handlecreateAgent}
              className="btn add-button"
            >
              Create Agent
            </button>
          </div>
          
          <div className="agent-grid">
            {/* Current Agent */}
            {currentAgent ? (
              <div className="agent-container">
                <div className="section-header">
                  <h2>Current Agent</h2>
                </div>
                <div className="agent-item">
                  <AgentInfo agentPath={currentAgent.agentPath} />
                  <div className="agent-buttons">
                    <button
                      onClick={handlecloneAgent}
                      className="btn add-button"
                    >
                      Clone Agent
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="no-agent">
                <p>No agent selected</p>
              </div>
            )}
            
            {/* Other Active Agents */}
            {otherActiveAgents.length > 0 && (
              <div className="agent-container">
                <div className="section-header">
                  <h2>Other Active Agents</h2>
                </div>
                <div className="agent-list">
                  {otherActiveAgents.map(window => (
                    <div
                      key={window.windowId}
                      className="agent-item"
                    >
                      <AgentInfo agentPath={window.agentPath} />
                      <div className="agent-buttons">
                        <button
                          onClick={() => handleFocusWindow(window.windowId)}
                          className="btn configure-button"
                        >
                          Switch to Window
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Recent Agents */}
            {filteredRecentAgents.length > 0 && (
              <div className="agent-container">
                <div className="section-header">
                  <h2>Recent Agents</h2>
                </div>
                <div className="agent-list">
                  {filteredRecentAgents.map(path => (
                    <div
                      key={path}
                      className="agent-item"
                    >
                      <AgentInfo agentPath={path} />
                      <div className="agent-buttons">
                        <button
                          onClick={() => handleSwitchToRecent(path)}
                          className="btn configure-button"
                        >
                          Switch to Agent
                        </button>
                        <button
                          onClick={() => handleOpenRecentInNewWindow(path)}
                          className="btn add-button"
                        >
                          Open in New Window
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}; 