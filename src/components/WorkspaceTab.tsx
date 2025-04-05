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
      
      log.info('Workspace data loaded successfully:', {
        windows: windows.length,
        currentId,
        recent: recent.length
      });
    } catch (error) {
      log.error('Error loading workspace data:', error);
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
      log.info('Configuration changed, refreshing workspace data');
      loadData();
    };
    
    // Listen for workspace switched event using the API method
    const handleWorkspaceSwitched = () => {
      log.info('[WORKSPACE TAB] Received workspace:switched event, refreshing data');
      // Force a refresh of the data
      loadData().then(() => {
        log.info('[WORKSPACE TAB] Data refreshed after workspace switch');
      }).catch(error => {
        log.error('[WORKSPACE TAB] Error refreshing data after workspace switch:', error);
      });
    };
    
    // Set up event listeners
    window.api.onConfigurationChanged(handleConfigurationChanged);
    
    window.api.onWorkspaceSwitched(handleWorkspaceSwitched);
    
    // Clean up the event listeners when the component unmounts
    return () => {
      log.info('Cleaning up event listeners in WorkspaceTab');
      // Note: We don't need to remove the API event listeners as they are handled by the API
    };
  }, []);

  const handleOpenWorkspace = async () => {
    const result = await window.api.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Workspace Files', extensions: ['json'] }],
      title: 'Select Workspace File'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const workspaceFilePath = result.filePaths[0];
      // The API will handle extracting the directory path
      await window.api.openWorkspace(workspaceFilePath);
      // Refresh data
      const windows = await window.api.getActiveWindows();
      setActiveWindows(windows);
      
      // Update current window
      const currentId = await window.api.getCurrentWindowId();
      setCurrentWindowId(currentId);
    }
  };

  const handleCreateWorkspace = async () => {
    const result = await window.api.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Directory for New Workspace'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const workspacePath = result.filePaths[0];
      await window.api.createWorkspace(workspacePath);
      // Refresh data
      const windows = await window.api.getActiveWindows();
      setActiveWindows(windows);
      
      // Update current window
      const currentId = await window.api.getCurrentWindowId();
      setCurrentWindowId(currentId);
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
    // Pass the full path to openWorkspace
    await window.api.openWorkspace(workspacePath);
    // Refresh data
    const windows = await window.api.getActiveWindows();
    setActiveWindows(windows);
    
    // Update current window
    const currentId = await window.api.getCurrentWindowId();
    setCurrentWindowId(currentId);
  };

  const handleSwitchToRecent = async (workspacePath: string) => {
    try {
      log.info(`[WORKSPACE SWITCH] handleSwitchToRecent called with workspacePath ${workspacePath}`);
      
      // Get the current window ID
      const currentId = await window.api.getCurrentWindowId();
      if (!currentId) {
        log.error(`[WORKSPACE SWITCH] No current window ID found`);
        return;
      }
      
      // Switch to the workspace
      const success = await window.api.switchWorkspace(currentId.toString(), workspacePath);
      
      if (success) {
        // Force a refresh of the data
        await loadData();
      } else {
        log.error(`[WORKSPACE SWITCH] Failed to switch to workspace ${workspacePath}`);
      }
    } catch (error) {
      log.error(`[WORKSPACE SWITCH] Error in handleSwitchToRecent:`, error);
    }
  };

  const handleOpenRecentInNewWindow = async (workspacePath: string) => {
    // Use the new API to open in a new window
    await window.api.openInNewWindow(workspacePath);
    
    // Refresh data
    const windows = await window.api.getActiveWindows();
    setActiveWindows(windows);
    
    // Update current window
    const currentId = await window.api.getCurrentWindowId();
    setCurrentWindowId(currentId);
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
          {currentWorkspace && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '16px', backgroundColor: '#eff6ff' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>Current Workspace</h2>
              <div style={{ padding: '12px', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                <div style={{ fontWeight: '500', color: '#111' }}>{currentWorkspace.workspacePath}</div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  {currentWorkspace.isMinimized ? 'Minimized' : ''} {currentWorkspace.isActive ? 'Active' : ''}
                </div>
              </div>
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
                    onClick={() => handleSwitchWorkspace(window.windowId, window.workspacePath)}
                  >
                    <div>
                      <div style={{ fontWeight: '500', color: '#111' }}>{window.workspacePath}</div>
                      <div style={{ fontSize: '14px', color: '#666' }}>
                        {window.isMinimized ? 'Minimized' : ''} {window.isActive ? 'Active' : ''}
                      </div>
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