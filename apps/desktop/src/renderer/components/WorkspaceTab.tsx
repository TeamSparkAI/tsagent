import React, { useState, useEffect } from 'react';
import { TabProps } from '../types/TabProps';
import type { WorkspaceWindow } from '../../main/workspaces-manager';
import log from 'electron-log';
import './WorkspaceTab.css';

interface WorkspaceTabProps extends TabProps {
  id: string;
  name: string;
  activeTabId: string | null;
}

export const WorkspaceTab: React.FC<WorkspaceTabProps> = ({ id, name, activeTabId }) => {
  const [activeWindows, setActiveWindows] = useState<WorkspaceWindow[]>([]);
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
  const [currentWindowId, setCurrentWindowId] = useState<string | null>(null);
  const [isHelpVisible, setIsHelpVisible] = useState<boolean>(false);

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
      
      // Show help panel only if there's no current workspace
      const currentWorkspace = windows.find(window => window.windowId === currentId);
      setIsHelpVisible(!currentWorkspace);
      
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
    // Listen for workspace switched event using the API method
    const handleWorkspaceSwitched = async (data: { windowId: string, workspacePath: string, targetWindowId: string }) => {      
      try {
        // Get the current window ID
        const id = await window.api.getCurrentWindowId();
        log.info(`[WORKSPACE TAB] Current window ID: ${id}, target window ID: ${data.targetWindowId}`);
        
        // Only update the UI if this event is targeted at the current window
        if (id === data.targetWindowId) {
          log.info(`[WORKSPACE TAB] Event is targeted at this window, refreshing all workspace data`);
          await loadData();
        } else {
          log.info(`[WORKSPACE TAB] Event is not targeted at this window, refreshing active windows only`);
          // If not targeted, we still need to update the activeWindows list, but we'll do it without refreshing the entire UI
          const windows = await window.api.getActiveWindows();
          setActiveWindows(windows);
        }
      } catch (error) {
        log.error(`[WORKSPACE TAB] Error in workspace switch handler:`, error);
      }
    };
    
    // Set up event listeners
    log.info('[WORKSPACE TAB] Setting up event listeners');
    const listener = window.api.onWorkspaceSwitched(handleWorkspaceSwitched);
    
    // Clean up the event listeners when the component unmounts
    return () => {
      if (listener) {
        log.info('[WORKSPACE TAB] Cleaning up event listeners');
        window.api.offWorkspaceSwitched(listener);
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

      // Check if workspace already exists at the target location
      const workspaceExists = await window.api.workspaceExists(workspacePath);
      if (workspaceExists) {
        log.error(`[WORKSPACE CREATE] Workspace already exists at: ${workspacePath}`);
        await window.api.showMessageBox({
          type: 'error',
          title: 'Create Failed',
          message: 'Failed to create workspace',
          detail: 'A workspace already exists at the selected location',
          buttons: ['OK']
        });
        return;
      }
      
      // Get the current window ID
      const currentId = await window.api.getCurrentWindowId();
      log.info(`[WORKSPACE CREATE] Current window ID: ${currentId}`);
      
      if (!currentId) {
        log.error(`[WORKSPACE CREATE] No current window ID found`);
        return;
      }

      // Check if current window already has a workspace
      const currentWorkspace = activeWindows.find(window => window.windowId === currentId);
      
      if (currentWorkspace) {
        // If current window has a workspace, open in new window
        log.info(`[WORKSPACE CREATE] Current window has workspace, opening in new window`);
        await window.api.createWorkspaceInNewWindow(workspacePath);
      } else {
        // If current window has no workspace, open in current window
        log.info(`[WORKSPACE CREATE] Current window has no workspace, opening in current window`);
        await window.api.createWorkspace(currentId, workspacePath);
      }
      
      // Force a refresh of the data
      log.info(`[WORKSPACE CREATE] Calling loadData to refresh workspace data`);
      await loadData();
      log.info(`[WORKSPACE CREATE] loadData completed`);
    } catch (error) {
      log.error(`[WORKSPACE CREATE] Error in handleCreateWorkspace:`, error);
      // Show error dialog to user
      await window.api.showMessageBox({
        type: 'error',
        title: 'Create Failed',
        message: 'Failed to create workspace',
        detail: error instanceof Error ? error.message : 'An unexpected error occurred',
        buttons: ['OK']
      });
    }
  };

  const handleCloneWorkspace = async () => {
    try {
      log.info(`[WORKSPACE CLONE] handleCloneWorkspace called`);
      
      if (!currentWorkspace) {
        log.error(`[WORKSPACE CLONE] No current workspace to clone`);
        return;
      }

      // Show the open dialog
      const dialogResult = await window.api.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Directory for Cloned Workspace'
      });
      
      if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
        log.info(`[WORKSPACE CLONE] Dialog canceled or no directory selected`);
        return;
      }
      
      const targetPath = dialogResult.filePaths[0];
      log.info(`[WORKSPACE CLONE] Selected target path: ${targetPath}`);
      
      // Clone the workspace
      const cloneResult = await window.api.cloneWorkspace(currentWorkspace.workspacePath, targetPath);
      if (!cloneResult.success) {
        log.error(`[WORKSPACE CLONE] Failed to clone workspace: ${cloneResult.error}`);
        await window.api.showMessageBox({
          type: 'error',
          title: 'Clone Failed',
          message: 'Failed to clone workspace',
          detail: cloneResult.error || 'A workspace already exists at the target location',
          buttons: ['OK']
        });
        return;
      }
    } catch (error) {
      log.error(`[WORKSPACE CLONE] Error in handleCloneWorkspace:`, error);
      // Show error dialog to user
      await window.api.showMessageBox({
        type: 'error',
        title: 'Clone Failed',
        message: 'Failed to clone workspace',
        detail: error instanceof Error ? error.message : 'An unexpected error occurred',
        buttons: ['OK']
      });
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
    <div className="workspace-tab">
      <div className="help-header" style={{ marginBottom: isHelpVisible ? '8px' : '0' }}>
        <h2>Workspace Management</h2>
        <button 
          className="about-button"
          onClick={() => setIsHelpVisible(!isHelpVisible)}
        >
          {isHelpVisible ? "Hide About" : "About"}
        </button>
      </div>
      <div className={`help-panel ${isHelpVisible ? '' : 'hidden'}`}>
        <div className="about-content">
          <p><strong>Manage Your Workspaces and Windows</strong></p>
          <p>
            All activity in TeamSpark AI Workbench takes place in a workspace.  A workspace can be any folder you choose, which will then be used to store your
            prompt, settings, providers, references, rules, and tools.  You can use one workspace for everything, or you can make workspaces for different
            projects (or "agents") to organize your work.
          </p>
          <p>
            If you are running TeamSpark AI Workbench for first time, select Create Workspace below, then select a new or empty folder to serve as your first workspace.
          </p>
        </div>
      </div>
      <div className="workspace-content">
        <div className="workspace-section">    
          <div className="workspace-actions">
            <button
              onClick={handleOpenWorkspace}
              className="btn configure-button"
            >
              Open Workspace
            </button>
            <button
              onClick={handleCreateWorkspace}
              className="btn add-button"
            >
              Create Workspace
            </button>
          </div>
          
          <div className="workspace-grid">
            {/* Current Workspace */}
            {currentWorkspace ? (
              <div className="workspace-container">
                <div className="section-header">
                  <h2>Current Workspace</h2>
                </div>
                <div className="workspace-item">
                  <div className="path">{currentWorkspace.workspacePath}</div>
                  <div className="workspace-buttons">
                    <button
                      onClick={handleCloneWorkspace}
                      className="btn add-button"
                    >
                      Clone Workspace
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="no-workspace">
                <p>No workspace selected</p>
              </div>
            )}
            
            {/* Other Active Workspaces */}
            {otherActiveWorkspaces.length > 0 && (
              <div className="workspace-container">
                <div className="section-header">
                  <h2>Other Active Workspaces</h2>
                </div>
                <div className="workspace-list">
                  {otherActiveWorkspaces.map(window => (
                    <div
                      key={window.windowId}
                      className="workspace-item"
                    >
                      <div className="window-item">
                        <div className="path">{window.workspacePath}</div>
                      </div>
                      <div className="workspace-buttons">
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
            
            {/* Recent Workspaces */}
            {filteredRecentWorkspaces.length > 0 && (
              <div className="workspace-container">
                <div className="section-header">
                  <h2>Recent Workspaces</h2>
                </div>
                <div className="workspace-list">
                  {filteredRecentWorkspaces.map(path => (
                    <div
                      key={path}
                      className="workspace-item"
                    >
                      <div className="path">{path}</div>
                      <div className="workspace-buttons">
                        <button
                          onClick={() => handleSwitchToRecent(path)}
                          className="btn configure-button"
                        >
                          Switch to Workspace
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