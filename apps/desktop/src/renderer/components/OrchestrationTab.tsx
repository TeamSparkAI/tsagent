import React, { useState, useEffect } from 'react';
import { TabProps } from '../types/TabProps';
import { TabState, TabMode } from '../types/TabState';
import { AboutView } from './AboutView';
import { McpServerEntry } from '@tsagent/core';
import log from 'electron-log';
import './OrchestrationTab.css';

interface AgentInfo {
  agentId: string;
  name: string;
  description: string;
  version: string;
  url: string;
  provider: {
    organization: string;
    url: string;
  };
  iconUrl: string;
  documentationUrl: string;
  skills: Array<{
    id: string;
    name: string;
    description: string;
    examples?: string[];
    inputModes?: string[];
    outputModes?: string[];
    tags: string[];
  }>;
  capabilities: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
}

export const OrchestrationTab: React.FC<TabProps> = ({ id, activeTabId, name, type }) => {
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [a2aServer, setA2aServer] = useState<McpServerEntry | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOrchestrationEnabled, setIsOrchestrationEnabled] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [tabState, setTabState] = useState<TabState>({ mode: 'about' });

  // Load servers and find a2a-mcp server
  useEffect(() => {
    if (id === activeTabId) {
      loadServers();
    }
  }, [id, activeTabId]);

  // Helper function to find orchestrator server by version
  const findOrchestratorServer = async (serverConfigs: any[]) => {
    for (const serverConfig of serverConfigs) {
      try {
        const clientInfo = await window.api.getMCPClient(serverConfig.name);
        if (clientInfo.serverVersion?.name === '@tsagent/orchestrator') {
          return serverConfig;
        }
      } catch (error) {
        // Server might not be running, skip it
        log.debug(`Could not connect to server "${serverConfig.name}":`, error);
        continue;
      }
    }
    return null;
  };

  const loadServers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const serverConfigs = await window.api.getServerConfigs();
      setServers(serverConfigs);
      
      // Find orchestrator server by checking server version
      const a2aServerConfig = await findOrchestratorServer(serverConfigs);
      
      if (a2aServerConfig) {
        setA2aServer(a2aServerConfig);
        await loadAgents(a2aServerConfig.name);
      } else {
        setError('No @tsagent/orchestrator server found. Please configure an @tsagent/orchestrator server in the Tools tab.');
        setAgents([]);
      }
    } catch (err) {
      log.error('Error loading servers:', err);
      setError('Failed to load server configurations');
      setAgents([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAgents = async (serverName: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await window.api.callTool(serverName, 'a2a_list_agents', {});
      
      // Extract agents from the result
      if (result && result.structuredContent && result.structuredContent.agents) {
        const agents = result.structuredContent.agents as AgentInfo[];
        setAgents(agents);
      } else {
        setAgents([]);
      }
    } catch (err) {
      log.error('Error loading agents:', err);
      setError(`Failed to load agents: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setAgents([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestAgent = async () => {
    if (!a2aServer || !selectedAgent || !testMessage.trim()) return;
    
    try {
      setIsTesting(true);
      setTestResult(null);
      
      const result = await window.api.callTool(a2aServer.name, 'a2a_send_message', {
        agentId: selectedAgent.agentId,
        message: testMessage
      });
      
      log.info('Agent test result:', result);
      
      // Extract response from result
      if (result && result.structuredContent && result.structuredContent.response) {
        setTestResult(String(result.structuredContent.response));
      } else if (result && result.content && result.content[0] && result.content[0].type === 'text' && result.content[0].text) {
        setTestResult(String(result.content[0].text));
      } else {
        setTestResult('Message sent successfully');
      }
    } catch (err) {
      log.error('Error testing agent:', err);
      setTestResult(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleOrchestration = async () => {
    // TODO: Implement orchestration enable/disable logic
    setIsOrchestrationEnabled(!isOrchestrationEnabled);
    log.info('Orchestration toggled:', !isOrchestrationEnabled);
  };

  const handleRefresh = () => {
    if (a2aServer) {
      loadAgents(a2aServer.name);
    }
  };

  const renderContent = () => {
    if (tabState.mode === 'about') {
      return (
        <AboutView
          title="About Orchestration"
          description={
            <div>
              <p>
                <strong>Agent Orchestration</strong> allows you to discover, manage, and interact with A2A (Agent-to-Agent) agents 
                through the @tsagent/orchestrator server. This enables you to coordinate multiple AI agents and leverage their specialized capabilities.
              </p>
              
              <p>
                This tab will be present when the @tsagent/orchestrator server is installed in this agent to allow you to discover, inspect, and test the agents it provides.
              </p>

              {a2aServer && (
                <div className="server-status">
                  <h4>Server Status</h4>
                  <p><strong>Connected to:</strong> {a2aServer.name} | <strong>Agents Found:</strong> {agents.length}</p>
                  <div className="control-group">
                    <button
                      onClick={handleRefresh}
                      disabled={isLoading}
                      className="btn configure-button"
                    >
                      {isLoading ? 'Loading...' : 'Refresh Agents'}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="error-message">
                  <h4>Error</h4>
                  <p>{error}</p>
                  <button onClick={loadServers} className="btn configure-button">
                    Retry Connection
                  </button>
                </div>
              )}
            </div>
          }
        />
      );
    }

    if (tabState.mode === 'item' && selectedAgent) {
      return (
        <div className="agent-details">
          <div className="agent-header">
            <div className="agent-title-section">
              {selectedAgent.iconUrl && (
                <img 
                  src={selectedAgent.iconUrl} 
                  alt={`${selectedAgent.name} icon`}
                  className="agent-icon-image"
                  onError={(e) => {
                    // Hide the image if it fails to load
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div className="agent-title-text">
                <h2>
                  {selectedAgent.name}
                  <span className="agent-version">v{selectedAgent.version}</span>
                </h2>
                <div className="agent-meta">
                  <span className="agent-id">ID: {selectedAgent.agentId}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="agent-description">
            <p>{selectedAgent.description}</p>
          </div>

          <div className="agent-sections">
            {(selectedAgent.provider.organization || selectedAgent.provider.url) && (
              <div className="agent-section">
                <h3>Provider</h3>
                {selectedAgent.provider.organization && (
                  <p><strong>Organization:</strong> {selectedAgent.provider.organization}</p>
                )}
                {selectedAgent.provider.url && (
                  <p><strong>URL:</strong> <a href={selectedAgent.provider.url} target="_blank" rel="noopener noreferrer">{selectedAgent.provider.url}</a></p>
                )}
              </div>
            )}

            {selectedAgent.documentationUrl && (
              <div className="agent-section">
                <h3>Documentation</h3>
                <a href={selectedAgent.documentationUrl} target="_blank" rel="noopener noreferrer">
                  {selectedAgent.documentationUrl}
                </a>
              </div>
            )}

            {selectedAgent.skills.length > 0 && (
              <div className="agent-section">
                <h3>Skills ({selectedAgent.skills.length})</h3>
                {selectedAgent.skills.map((skill) => (
                  <div key={skill.id} className="skill-item">
                    <div className="skill-name">{skill.name}</div>
                    <div className="skill-description">{skill.description}</div>
                    {skill.tags.length > 0 && (
                      <div className="skill-tags">
                        {skill.tags.map((tag) => (
                          <span key={tag} className="skill-tag">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(selectedAgent.capabilities.streaming || selectedAgent.capabilities.pushNotifications || selectedAgent.capabilities.stateTransitionHistory) && (
              <div className="agent-section">
                <h3>Capabilities</h3>
                <div className="capabilities-list">
                  {selectedAgent.capabilities.streaming && <span className="capability">Streaming</span>}
                  {selectedAgent.capabilities.pushNotifications && <span className="capability">Push Notifications</span>}
                  {selectedAgent.capabilities.stateTransitionHistory && <span className="capability">State History</span>}
                </div>
              </div>
            )}

            <div className="agent-section">
              <h3>Test Agent</h3>
              <div className="test-interface">
                <textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Enter a test message..."
                  rows={4}
                />
                <button
                  onClick={handleTestAgent}
                  disabled={!testMessage.trim() || isTesting}
                  className="btn add-button"
                >
                  {isTesting ? 'Sending...' : 'Send Message'}
                </button>
                {testResult && (
                  <div className="test-result">
                    <h4>Response:</h4>
                    <pre>{testResult}</pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  if (id !== activeTabId) return null;

  return (
    <div className={`tab-content ${activeTabId === id ? 'active' : ''}`}>
      <div className="tab-items-container">
        <div className="sidebar">
          <div className="sidebar-header">
            <h2>Agents</h2>
          </div>
          <div className="tab-items-list">
            <div 
              className={`tab-items-item ${tabState.mode === 'about' ? 'selected' : ''}`}
              onClick={() => {
                setTabState({ mode: 'about' });
                setSelectedAgent(null);
              }}
            >
              <span className="info-icon">ℹ️</span>
              <span>Agent Orchestration</span>
            </div>
            {agents.map(agent => (
              <div
                key={agent.agentId}
                className={`tab-items-item ${selectedAgent?.agentId === agent.agentId ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedAgent(agent);
                  setTabState({ mode: 'item', selectedItemId: agent.agentId });
                  setTestMessage('');
                  setTestResult(null);
                }}
              >
                <span className="agent-icon">🤖</span>
                <span>{agent.name}</span>
              </div>
            ))}
            {agents.length === 0 && !isLoading && a2aServer && (
              <div className="no-items-message">
                No agents found
              </div>
            )}
            {!a2aServer && (
              <div className="no-items-message">
                No @tsagent/orchestrator server configured
              </div>
            )}
          </div>
        </div>
        <div className="references-main">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};