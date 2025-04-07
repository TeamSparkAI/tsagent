import React, { useState, useEffect } from 'react';
import { TabProps } from '../types/TabProps';
import type { WorkspaceWindow } from '../types/workspace';
import log from 'electron-log';

interface WorkspaceTabProps extends TabProps {
  id: string;
  name: string;
  activeTabId: string | null;
}

export const WorkspaceTab: React.FC<WorkspaceTabProps> = ({ id, name, activeTabId }) => {
  const [activeWindows, setActiveWindows] = useState<WorkspaceWindow[]>([]);
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
  const [currentWindowId, setCurrentWindowId] = useState<string | null>(null);

  // Function to load workspace data
  const loadData = async () => {
    try {
      log.info('[WORKSPACE TAB] Loading workspace data');
      // Load all data in parallel
      const [windows, currentId, recent] = await Promise.all([
        window.api.getActiveWindows(),
        window.api.getCurrentWindowId(),
        window.api.getRecentWorkspaces()
      ]);
      
      // Update state with all data at once
      setActiveWindows(windows);
      setCurrentWindowId(currentId);
      setRecentWorkspaces(recent);
      
      log.info('[WORKSPACE TAB] Workspace data loaded successfully:', {
        windows: windows.length,
        currentId,
        recent: recent.length
      });
    } catch (error) {
      log.error('[WORKSPACE TAB] Error loading workspace data:', error);
      // Set empty states on error
      setActiveWindows([]);
      setCurrentWindowId(null);
      setRecentWorkspaces([]);
    }
  };

  useEffect(() => {
    // Load initial data
    loadData();
  }, []);

  useEffect(() => {
    // Listen for configuration changes
    const handleConfigurationChanged = () => {
      log.info('[WORKSPACE TAB] Configuration changed, refreshing workspace data');
      loadData();
    };
    
    // Listen for workspace switched event using the API method
    const handleWorkspaceSwitched = (data: { windowId: string, workspacePath: string, targetWindowId: string }) => {
      log.info('[WORKSPACE TAB] Received workspace:switched event with data:', data);
      
      // Get the current window ID
      window.api.getCurrentWindowId().then(id => {
        log.info(`[WORKSPACE TAB] Current window ID: ${id}, target window ID: ${data.targetWindowId}`);
        
        // Only update the UI if this event is targeted at the current window
        if (id === data.targetWindowId) {
          log.info(`[WORKSPACE TAB] Event is targeted at this window, refreshing data`);
          // Force a refresh of the data
          loadData().then(() => {
            log.info('[WORKSPACE TAB] Data refreshed after workspace switch');
          }).catch(error => {
            log.error('[WORKSPACE TAB] Error refreshing data after workspace switch:', error);
          });
        } else {
          log.info(`[WORKSPACE TAB] Event is not targeted at this window, ignoring`);
          // Even if not targeted, we should still update the activeWindows list
          // but we'll do it without refreshing the entire UI
          window.api.getActiveWindows().then(windows => {
            log.info(`[WORKSPACE TAB] Updating activeWindows list without refreshing UI`);
            setActiveWindows(windows);
          }).catch(error => {
            log.error(`[WORKSPACE TAB] Error updating activeWindows list:`, error);
          });
        }
      }).catch(error => {
        log.error(`[WORKSPACE TAB] Error getting current window ID:`, error);
      });
    };
    
    // Set up event listeners
    log.info('[WORKSPACE TAB] Setting up event listeners');
    const configListener = window.api.onConfigurationChanged(handleConfigurationChanged);
    const listener = window.api.onWorkspaceSwitched(handleWorkspaceSwitched);
    log.info('[WORKSPACE TAB] Event listeners set up');
    
    // Clean up the event listeners when the component unmounts
    return () => {
      log.info('[WORKSPACE TAB] Cleaning up event listeners');
      if (listener) {
        window.api.offWorkspaceSwitched(listener);
        log.info('[WORKSPACE TAB] Successfully removed workspace:switched listener');
      }
      if (configListener) {
        window.api.offConfigurationChanged(configListener);
        log.info('[WORKSPACE TAB] Successfully removed configuration:changed listener');
      }
    };
  }, []);

  const handleOpenWorkspace = async () => {
    try {
      log.info(`[WORKSPACE OPEN] handleOpenWorkspace called`);
      
      // Show the open dialog
      const result = await window.api.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Workspace Files', extensions: ['json'] }],
        title: 'Select Workspace File'
      });
      
      if (result.canceled || result.filePaths.length === 0) {
        log.info(`[WORKSPACE OPEN] Dialog canceled or no file selected`);
        return;
      }
      
      const workspacePath = result.filePaths[0];
      log.info(`[WORKSPACE OPEN] Selected workspace path: ${workspacePath}`);
      
      // Get the current window ID
      const currentId = await window.api.getCurrentWindowId();
      log.info(`[WORKSPACE OPEN] Current window ID: ${currentId}`);
      
      if (!currentId) {
        log.error(`[WORKSPACE OPEN] No current window ID found`);
        return;
      }
      
      // Open the workspace
      log.info(`[WORKSPACE OPEN] Calling openWorkspace with path: ${workspacePath}`);
      await window.api.openWorkspace(workspacePath);
      log.info(`[WORKSPACE OPEN] openWorkspace completed`);
      
      // Force a refresh of the data
      log.info(`[WORKSPACE OPEN] Calling loadData to refresh workspace data`);
      await loadData();
      log.info(`[WORKSPACE OPEN] loadData completed`);
    } catch (error) {
      log.error(`[WORKSPACE OPEN] Error in handleOpenWorkspace:`, error);
    }
  };

  const handleCreateWorkspace = async () => {
    try {
      log.info(`[WORKSPACE CREATE] handleCreateWorkspace called`);
      
      // Show the open dialog
      const result = await window.api.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Directory for New Workspace'
      });
      
      if (result.canceled || result.filePaths.length === 0) {
        log.info(`[WORKSPACE CREATE] Dialog canceled or no directory selected`);
        return;
      }
      
      const workspacePath = result.filePaths[0];
      log.info(`[WORKSPACE CREATE] Selected workspace path: ${workspacePath}`);
      
      // Create the workspace
      log.info(`[WORKSPACE CREATE] Calling createWorkspace with path: ${workspacePath}`);
      await window.api.createWorkspace(workspacePath);
      log.info(`[WORKSPACE CREATE] createWorkspace completed`);
      
      // Get the current window ID
      const currentId = await window.api.getCurrentWindowId();
      log.info(`[WORKSPACE CREATE] Current window ID: ${currentId}`);
      
      if (!currentId) {
        log.error(`[WORKSPACE CREATE] No current window ID found`);
        return;
      }
      
      // Force a refresh of the data
      log.info(`[WORKSPACE CREATE] Calling loadData to refresh workspace data`);
      await loadData();
      log.info(`[WORKSPACE CREATE] loadData completed`);
    } catch (error) {
      log.error(`[WORKSPACE CREATE] Error in handleCreateWorkspace:`, error);
    }
  };

  const handleSwitchWorkspace = async (windowId: string, workspacePath: string) => {
    try {
      log.info(`[WORKSPACE SWITCH] handleSwitchWorkspace called with windowId ${windowId} and workspacePath ${workspacePath}`);
      
      // Switch to the workspace
      const success = await window.api.switchWorkspace(windowId, workspacePath);
      
      if (success) {
        log.info(`[WORKSPACE SWITCH] API call successful for workspace ${workspacePath} in window ${windowId}`);
      } else {
        log.error(`[WORKSPACE SWITCH] API call failed for workspace ${workspacePath} in window ${windowId}`);
      }
    } catch (error) {
      log.error(`[WORKSPACE SWITCH] Error in handleSwitchWorkspace:`, error);
    }
  };

  const handleOpenRecent = async (workspacePath: string) => {
    try {
      log.info(`[WORKSPACE OPEN RECENT] handleOpenRecent called with workspacePath ${workspacePath}`);
      
      // Get the current window ID
      const currentId = await window.api.getCurrentWindowId();
      log.info(`[WORKSPACE OPEN RECENT] Current window ID: ${currentId}`);
      
      if (!currentId) {
        log.error(`[WORKSPACE OPEN RECENT] No current window ID found`);
        return;
      }
      
      // Open the workspace
      log.info(`[WORKSPACE OPEN RECENT] Calling openWorkspace with path: ${workspacePath}`);
      await window.api.openWorkspace(workspacePath);
      log.info(`[WORKSPACE OPEN RECENT] openWorkspace completed`);
      
      // Force a refresh of the data
      log.info(`[WORKSPACE OPEN RECENT] Calling loadData to refresh workspace data`);
      await loadData();
      log.info(`[WORKSPACE OPEN RECENT] loadData completed`);
    } catch (error) {
      log.error(`[WORKSPACE OPEN RECENT] Error in handleOpenRecent:`, error);
    }
  };

  const handleSwitchToRecent = async (workspacePath: string) => {
    try {
      log.info(`[WORKSPACE SWITCH] handleSwitchToRecent called with workspacePath ${workspacePath}`);
      
      // Get the current window ID
      const currentId = await window.api.getCurrentWindowId();
      log.info(`[WORKSPACE SWITCH] Current window ID: ${currentId}`);
      
      if (!currentId) {
        log.error(`[WORKSPACE SWITCH] No current window ID found`);
        return;
      }
      
      // First, check if the window is registered with a workspace
      const windows = await window.api.getActiveWindows();
      log.info(`[WORKSPACE SWITCH] Active windows: ${JSON.stringify(windows)}`);
      
      const isRegistered = windows.some(window => window.windowId === currentId);
      log.info(`[WORKSPACE SWITCH] Window ${currentId} is ${isRegistered ? 'registered' : 'not registered'} with a workspace`);
      
      if (!isRegistered) {
        log.info(`[WORKSPACE SWITCH] Window ${currentId} is not registered with a workspace, registering first`);
        // Register the window with the workspace
        log.info(`[WORKSPACE SWITCH] Calling openWorkspace with path: ${workspacePath}`);
        await window.api.openWorkspace(workspacePath);
        log.info(`[WORKSPACE SWITCH] openWorkspace completed`);
      }
      
      // Always use switchWorkspace to ensure the workspace:switched event is triggered
      log.info(`[WORKSPACE SWITCH] Calling switchWorkspace with windowId: ${currentId} and path: ${workspacePath}`);
      const success = await window.api.switchWorkspace(currentId.toString(), workspacePath);
      log.info(`[WORKSPACE SWITCH] switchWorkspace result: ${success}`);
      
      if (success) {
        // Force a refresh of the data
        log.info(`[WORKSPACE SWITCH] Calling loadData to refresh workspace data`);
        await loadData();
        log.info(`[WORKSPACE SWITCH] loadData completed`);
      } else {
        log.error(`[WORKSPACE SWITCH] Failed to switch to workspace ${workspacePath}`);
      }
    } catch (error) {
      log.error(`[WORKSPACE SWITCH] Error in handleSwitchToRecent:`, error);
    }
  };

  const handleOpenRecentInNewWindow = async (workspacePath: string) => {
    try {
      log.info(`[WORKSPACE OPEN NEW WINDOW] handleOpenRecentInNewWindow called with workspacePath ${workspacePath}`);
      
      // Open the workspace in a new window
      log.info(`[WORKSPACE OPEN NEW WINDOW] Calling openInNewWindow with path: ${workspacePath}`);
      await window.api.openInNewWindow(workspacePath);
      log.info(`[WORKSPACE OPEN NEW WINDOW] openInNewWindow completed`);
      
      // Force a refresh of the data
      log.info(`[WORKSPACE OPEN NEW WINDOW] Calling loadData to refresh workspace data`);
      await loadData();
      log.info(`[WORKSPACE OPEN NEW WINDOW] loadData completed`);
    } catch (error) {
      log.error(`[WORKSPACE OPEN NEW WINDOW] Error in handleOpenRecentInNewWindow:`, error);
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

  // Get current window's workspace
  const currentWorkspace = activeWindows.find(window => window.windowId === currentWindowId);
  
  // Get other active workspaces (excluding current)
  // Only include workspaces from other windows, not the current window
  const otherActiveWorkspaces = activeWindows.filter(window => 
    window.windowId !== currentWindowId && 
    window.workspacePath !== currentWorkspace?.workspacePath
  );
  
  // Get recent workspaces (excluding active ones)
  const activePaths = activeWindows.map(window => window.workspacePath);
  const filteredRecentWorkspaces = recentWorkspaces.filter(path => !activePaths.includes(path));
  
  log.debug('Workspace state:', {
    currentWindowId,
    currentWorkspace,
    activePaths,
    recentWorkspaces,
    filteredRecentWorkspaces
  });
  
  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>Workspace Management</h1>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', gap: '24px', justifyContent: 'flex-start' }}>
          <button
            onClick={handleOpenWorkspace}
            style={{ 
              width: '200px', 
              padding: '12px 24px', 
              backgroundColor: '#2563eb', 
              color: 'white', 
              fontWeight: '500', 
              borderRadius: '6px', 
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Open Workspace
          </button>
          <button
            onClick={handleCreateWorkspace}
            style={{ 
              width: '200px', 
              padding: '12px 24px', 
              backgroundColor: '#059669', 
              color: 'white', 
              fontWeight: '500', 
              borderRadius: '6px', 
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Create Workspace
          </button>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          {/* Current Workspace */}
          {currentWorkspace ? (
            <div className="workspace-info">
              <h3>Current Workspace</h3>
              <p>Path: {currentWorkspace.workspacePath}</p>
              <p>Window ID: {currentWindowId}</p>
            </div>
          ) : (
            <div className="no-workspace">
              <p>No workspace selected</p>
            </div>
          )}
          
          {/* Other Active Workspaces */}
          {otherActiveWorkspaces.length > 0 && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>Other Active Workspaces</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {otherActiveWorkspaces.map(window => (
                  <div
                    key={window.windowId}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      padding: '12px', 
                      backgroundColor: '#f9fafb', 
                      border: '1px solid #e5e7eb', 
                      borderRadius: '6px', 
                      cursor: 'pointer'
                    }}
                    onClick={() => handleFocusWindow(window.windowId)}
                  >
                    <div>
                      {window.windowId === currentWindowId ? (
                        <div className="window-item active">
                          <span className="window-id">Window {window.windowId}</span>
                          <span className="workspace-path">{window.workspacePath}</span>
                        </div>
                      ) : (
                        <div className="window-item">
                          <span className="window-id">Window {window.windowId}</span>
                          <span className="workspace-path">{window.workspacePath}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ color: '#9ca3af' }}>→</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Recent Workspaces */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>Recent Workspaces</h2>
            
            {filteredRecentWorkspaces.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#666' }}>
                <p>No recent workspaces</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredRecentWorkspaces.map(path => (
                  <div
                    key={path}
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column',
                      padding: '12px', 
                      backgroundColor: '#f9fafb', 
                      border: '1px solid #e5e7eb', 
                      borderRadius: '6px'
                    }}
                  >
                    <div style={{ fontWeight: '500', color: '#111', marginBottom: '8px' }}>{path}</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleSwitchToRecent(path)}
                        style={{ 
                          flex: 1,
                          padding: '8px 12px', 
                          backgroundColor: '#3b82f6', 
                          color: 'white', 
                          fontWeight: '500', 
                          borderRadius: '4px', 
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        Switch To This Workspace
                      </button>
                      <button
                        onClick={() => handleOpenRecentInNewWindow(path)}
                        style={{ 
                          flex: 1,
                          padding: '8px 12px', 
                          backgroundColor: '#10b981', 
                          color: 'white', 
                          fontWeight: '500', 
                          borderRadius: '4px', 
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        Open in New Window
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}; 