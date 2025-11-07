import React, { useState, useEffect } from 'react';
import { RequestContext, RequestContextItem } from '@tsagent/core';
import log from 'electron-log';

interface RequestContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestContext: RequestContext | undefined;
}

type ContextItemWithDetails = 
  | ({ type: 'rule'; name: string; includeMode: 'always' | 'manual' | 'agent'; similarityScore?: number; description?: string; priorityLevel?: number })
  | ({ type: 'reference'; name: string; includeMode: 'always' | 'manual' | 'agent'; similarityScore?: number; description?: string; priorityLevel?: number })
  | ({ type: 'tool'; name: string; serverName: string; includeMode: 'always' | 'manual' | 'agent'; similarityScore?: number; description?: string });

export const RequestContextModal: React.FC<RequestContextModalProps> = ({
  isOpen,
  onClose,
  requestContext
}) => {
  const [rules, setRules] = useState<ContextItemWithDetails[]>([]);
  const [references, setReferences] = useState<ContextItemWithDetails[]>([]);
  const [tools, setTools] = useState<ContextItemWithDetails[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && requestContext) {
      loadContextDetails();
    }
  }, [isOpen, requestContext]);

  const loadContextDetails = async () => {
    if (!requestContext) return;
    
    setLoading(true);
    try {
      // Load all rules and references to get descriptions
      const allRules = await window.api.getRules();
      const allReferences = await window.api.getReferences();
      
      // Load tools from all MCP servers
      const serverConfigs = await window.api.getServerConfigs();
      const toolsMap: Map<string, { description?: string }> = new Map();
      
      for (const server of serverConfigs) {
        try {
          const client = await window.api.getMCPClient(server.name);
          if (client && client.serverTools) {
            for (const tool of client.serverTools) {
              toolsMap.set(`${server.name}:${tool.name}`, {
                description: tool.description
              });
            }
          }
        } catch (error) {
          log.warn(`Failed to load tools from server ${server.name}:`, error);
        }
      }

      // Separate items by type and enrich with details
      const rulesList: ContextItemWithDetails[] = [];
      const referencesList: ContextItemWithDetails[] = [];
      const toolsList: ContextItemWithDetails[] = [];

      for (const item of requestContext.items) {
        if (item.type === 'rule') {
          const rule = allRules.find(r => r.name === item.name);
          const enriched: ContextItemWithDetails = {
            ...item,
            description: rule?.description,
            priorityLevel: rule?.priorityLevel
          };
          rulesList.push(enriched);
        } else if (item.type === 'reference') {
          const reference = allReferences.find(r => r.name === item.name);
          const enriched: ContextItemWithDetails = {
            ...item,
            description: reference?.description,
            priorityLevel: reference?.priorityLevel
          };
          referencesList.push(enriched);
        } else if (item.type === 'tool') {
          const toolInfo = toolsMap.get(`${item.serverName}:${item.name}`);
          const enriched: ContextItemWithDetails = {
            ...item,
            description: toolInfo?.description
          };
          toolsList.push(enriched);
        }
      }

      // Sort by priority level (if available), then by name
      const sortItems = (a: ContextItemWithDetails, b: ContextItemWithDetails) => {
        // Type narrowing for priority level comparison
        const aPriority = ('priorityLevel' in a) ? a.priorityLevel : undefined;
        const bPriority = ('priorityLevel' in b) ? b.priorityLevel : undefined;
        
        if (aPriority !== undefined && bPriority !== undefined) {
          if (aPriority !== bPriority) {
            return bPriority - aPriority; // Higher priority first
          }
        }
        
        // Both should have name since they're RequestContextItems
        if ('name' in a && 'name' in b) {
          return a.name.localeCompare(b.name);
        }
        return 0;
      };

      setRules(rulesList.sort(sortItems));
      setReferences(referencesList.sort(sortItems));
      setTools(toolsList.sort((a, b) => {
        // Sort tools by server name first, then tool name
        if (a.type === 'tool' && b.type === 'tool') {
          if (a.serverName !== b.serverName) {
            return a.serverName.localeCompare(b.serverName);
          }
          return a.name.localeCompare(b.name);
        }
        return 0;
      }));
    } catch (error) {
      log.error('Error loading context details:', error);
    } finally {
      setLoading(false);
    }
  };

  const getIncludeModeBadge = (includeMode: 'always' | 'manual' | 'agent') => {
    const styles: Record<string, { label: string; className: string }> = {
      always: { label: 'Always', className: 'include-badge always' },
      manual: { label: 'Manual', className: 'include-badge manual' },
      agent: { label: 'Agent', className: 'include-badge agent' }
    };
    const style = styles[includeMode] || styles.manual;
    return <span className={style.className}>{style.label}</span>;
  };

  const renderContextItem = (item: ContextItemWithDetails) => {
    const priorityLevel = ('priorityLevel' in item) ? item.priorityLevel : undefined;
    const description = ('description' in item) ? item.description : undefined;
    const key = item.type === 'tool' ? `${item.serverName}:${item.name}` : item.name;
    
    return (
      <div key={key} className="context-item-readonly">
        <div className="context-item-header-readonly">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            {priorityLevel !== undefined && (
              <span className="priority">{priorityLevel.toString().padStart(3, '0')}</span>
            )}
            {item.type === 'tool' && (
              <span className="server-name">{item.serverName}.</span>
            )}
            <span className="name" title={description}>{item.name}</span>
            {getIncludeModeBadge(item.includeMode)}
            {item.includeMode === 'agent' && item.similarityScore !== undefined && (
              <span className="similarity-score" title="Similarity score">
                {item.similarityScore.toFixed(2)}
              </span>
            )}
          </div>
        </div>
        {description && (
          <div className="context-item-description">{description}</div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '90vw', maxWidth: '1200px', height: '80vh' }}>
        <div className="modal-header">
          <div>
            <h2>Request Context</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Context items used to generate this response
            </p>
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-content" style={{ display: 'flex', flexDirection: 'row', gap: '16px', overflow: 'hidden' }}>
          {loading ? (
            <div className="loading">Loading context details...</div>
          ) : (
            <>
              <div className="context-column-readonly" style={{ flex: 1, overflowY: 'auto' }}>
                <div className="context-section">
                  <div className="context-section-header">
                    <h3>Rules ({rules.length})</h3>
                  </div>
                  {rules.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No rules used</p>
                  ) : (
                    <div className="context-list-readonly">
                      {rules.map(renderContextItem)}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="context-column-readonly" style={{ flex: 1, overflowY: 'auto' }}>
                <div className="context-section">
                  <div className="context-section-header">
                    <h3>References ({references.length})</h3>
                  </div>
                  {references.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No references used</p>
                  ) : (
                    <div className="context-list-readonly">
                      {references.map(renderContextItem)}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="context-column-readonly" style={{ flex: 1, overflowY: 'auto' }}>
                <div className="context-section">
                  <div className="context-section-header">
                    <h3>Tools ({tools.length})</h3>
                  </div>
                  {tools.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No tools used</p>
                  ) : (
                    <div className="context-list-readonly">
                      {tools.map(renderContextItem)}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

