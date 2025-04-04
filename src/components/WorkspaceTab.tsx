import React, { useState, useEffect } from 'react';
import { TabProps } from '../types/TabProps';
import type { WorkspaceWindow } from '../types/workspace';

interface WorkspaceTabProps extends TabProps {
  id: string;
  name: string;
  activeTabId: string | null;
}

export const WorkspaceTab: React.FC<WorkspaceTabProps> = ({ id, name, activeTabId }) => {
  const [activeWindows, setActiveWindows] = useState<WorkspaceWindow[]>([]);
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);

  useEffect(() => {
    // Load initial data
    window.api.getActiveWindows().then(setActiveWindows);
    window.api.getRecentWorkspaces().then(setRecentWorkspaces);
  }, []);

  const handleOpenWorkspace = async () => {
    const result = await window.api.showOpenDialog({
      properties: ['openDirectory'],
      filters: [{ name: 'Workspaces', extensions: ['json'] }]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const workspacePath = result.filePaths[0];
      await window.api.openWorkspace(workspacePath);
      // Refresh data
      const windows = await window.api.getActiveWindows();
      setActiveWindows(windows);
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
    }
  };

  const handleSwitchWorkspace = async (windowId: string) => {
    await window.api.switchWorkspace(windowId);
  };

  const handleOpenRecent = async (workspacePath: string) => {
    await window.api.openWorkspace(workspacePath);
    // Refresh data
    const windows = await window.api.getActiveWindows();
    setActiveWindows(windows);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Open Workspace</h2>
        <button
          onClick={handleOpenWorkspace}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Open Workspace
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Create Workspace</h2>
        <button
          onClick={handleCreateWorkspace}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Create Workspace
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Switch to Workspace</h2>
        <div className="space-y-2">
          {activeWindows.map(window => (
            <div
              key={window.windowId}
              className="p-2 border rounded hover:bg-gray-100 cursor-pointer"
              onClick={() => handleSwitchWorkspace(window.windowId)}
            >
              <div className="font-medium">{window.workspacePath}</div>
              <div className="text-sm text-gray-500">
                {window.isMinimized ? 'Minimized' : ''} {window.isActive ? 'Active' : ''}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Open Recent</h2>
        <div className="space-y-2">
          {recentWorkspaces.map(path => (
            <div
              key={path}
              className="p-2 border rounded hover:bg-gray-100 cursor-pointer"
              onClick={() => handleOpenRecent(path)}
            >
              <div className="font-medium">{path}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}; 