import React, { useState, useEffect } from 'react';
import { ChatAPI } from '../api/ChatAPI';
import log from 'electron-log';

interface ToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatApi: ChatAPI | null;
  tabId: string;
  onContextChange?: () => void;
}

interface Tool {
  serverName: string;
  toolName: string;
  description: string;
}

export const ToolsModal: React.FC<ToolsModalProps> = ({
  isOpen,
  onClose,
  chatApi,
  tabId,
  onContextChange
}) => {
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [activeTools, setActiveTools] = useState<{serverName: string, toolName: string}[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && chatApi) {
      loadToolsData();
    }
  }, [isOpen, chatApi]);

  const loadToolsData = async () => {
    if (!chatApi) return;
    
    setLoading(true);
    try {
      // Load available tools from all MCP servers
      const tools = await window.api.getServerConfigs();
      const allTools: Tool[] = [];
      
      for (const server of tools) {
        try {
          const client = await window.api.getMCPClient(server.name);
          if (client && client.serverTools) {
            for (const tool of client.serverTools) {
              allTools.push({
                serverName: server.name,
                toolName: tool.name,
                description: tool.description || ''
              });
            }
          }
        } catch (error) {
          log.warn(`Failed to load tools from server ${server.name}:`, error);
        }
      }
      
      setAvailableTools(allTools);

      // Load active tools
      const activeToolsList = await chatApi.getActiveTools();
      setActiveTools(activeToolsList);
    } catch (error) {
      log.error('Error loading tools data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToolToggle = async (serverName: string, toolName: string, isActive: boolean) => {
    if (!chatApi) return;
    
    try {
      if (isActive) {
        const success = await chatApi.removeTool(serverName, toolName);
        if (success) {
          setActiveTools(prev => prev.filter(tool => 
            !(tool.serverName === serverName && tool.toolName === toolName)
          ));
          onContextChange?.();
        }
      } else {
        const success = await chatApi.addTool(serverName, toolName);
        if (success) {
          setActiveTools(prev => [...prev, { serverName, toolName }]);
          onContextChange?.();
        }
      }
    } catch (error) {
      log.error('Error toggling tool:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Manage Tools</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-content">
          {loading ? (
            <div className="loading">Loading tools...</div>
          ) : (
            <div className="tools-list">
              {availableTools.map(tool => {
                const isActive = activeTools.some(active => 
                  active.serverName === tool.serverName && active.toolName === tool.toolName
                );
                return (
                  <div key={`${tool.serverName}:${tool.toolName}`} className={`tool-item ${isActive ? 'active' : ''}`}>
                    <div className="tool-item-header">
                      <span className="server">{tool.serverName}</span>
                      <span className="name" title={tool.description}>{tool.toolName}</span>
                      <button 
                        className={`toggle-button ${isActive ? 'remove' : 'add'}`}
                        onClick={() => handleToolToggle(tool.serverName, tool.toolName, isActive)}
                      >
                        {isActive ? 'Remove' : 'Add'}
                      </button>
                    </div>
                    <div className="tool-item-description">{tool.description}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
