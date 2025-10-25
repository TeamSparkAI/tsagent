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
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

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

  const toggleServer = (serverName: string) => {
    setExpandedServers(prev => {
      const next = new Set(prev);
      if (next.has(serverName)) {
        next.delete(serverName);
      } else {
        next.add(serverName);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Manage Tools</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Manage which tools are available to the current chat session context
            </p>
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-content">
          {loading ? (
            <div className="loading">Loading tools...</div>
          ) : (
            <div className="tools-list">
              {(() => {
                const toolsByServer: Record<string, Tool[]> = {};
                availableTools.forEach(tool => {
                  if (!toolsByServer[tool.serverName]) {
                    toolsByServer[tool.serverName] = [];
                  }
                  toolsByServer[tool.serverName].push(tool);
                });

                return Object.keys(toolsByServer).sort().map(serverName => {
                  const serverTools = toolsByServer[serverName].sort((a, b) => a.toolName.localeCompare(b.toolName));
                  const activeServerTools = activeTools.filter(t => t.serverName === serverName);
                  const isExpanded = expandedServers.has(serverName);

                  const allToolsActive = activeServerTools.length === serverTools.length;

                  return (
                    <div key={serverName} style={{ marginBottom: '16px' }}>
                      <div 
                        style={{ 
                          padding: '12px',
                          backgroundColor: 'var(--background-secondary)',
                          borderRadius: '4px',
                          marginBottom: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px'
                        }}
                      >
                        <div 
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}
                          onClick={() => toggleServer(serverName)}
                        >
                          <span style={{ fontSize: '14px' }}>{isExpanded ? '▼' : '▶'}</span>
                          <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{serverName}</span>
                          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                            {activeServerTools.length === serverTools.length ? (
                              `(all ${activeServerTools.length} tools)`
                            ) : (
                              `(${activeServerTools.length} of ${serverTools.length} tools)`
                            )}
                          </span>
                        </div>
                        <button
                          className={`toggle-button ${allToolsActive ? 'remove' : 'add'}`}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (allToolsActive) {
                              // Remove all tools for this server
                              for (const tool of serverTools) {
                                const isActive = activeTools.some(active => 
                                  active.serverName === tool.serverName && active.toolName === tool.toolName
                                );
                                if (isActive) {
                                  await handleToolToggle(tool.serverName, tool.toolName, true);
                                }
                              }
                            } else {
                              // Add all tools for this server
                              for (const tool of serverTools) {
                                const isActive = activeTools.some(active => 
                                  active.serverName === tool.serverName && active.toolName === tool.toolName
                                );
                                if (!isActive) {
                                  await handleToolToggle(tool.serverName, tool.toolName, false);
                                }
                              }
                            }
                          }}
                        >
                          {allToolsActive ? 'Remove All' : 'Add All'}
                        </button>
                      </div>
                      {isExpanded && (
                        <div style={{ marginLeft: '24px' }}>
                          {serverTools.map(tool => {
                            const isActive = activeTools.some(active => 
                              active.serverName === tool.serverName && active.toolName === tool.toolName
                            );
                            return (
                              <div key={`${tool.serverName}:${tool.toolName}`} className={`tool-item ${isActive ? 'active' : ''}`}>
                                <div className="tool-item-header">
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
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
