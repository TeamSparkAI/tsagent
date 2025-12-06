import React, { useEffect, useState, useCallback } from 'react';
import log from 'electron-log';
import './ChatSettingsForm.css';
import './SettingsTab.css';
import { SessionToolPermission, getDefaultSettings, ProviderId, parseModelString } from '@tsagent/core';
import { ModelPickerModal, ModelDetails } from './ModelPickerModal';
import { ProviderIcon } from './ProviderIcon';
import { getAgentModelDetails } from '../utils/agentModelCache';

export interface ChatSettings {
  maxChatTurns: number;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  toolPermission: SessionToolPermission;
  contextTopK: number;
  contextTopN: number;
  contextIncludeScore: number;
}

interface ChatSettingsFormProps {
  settings: ChatSettings;
  onSettingsChange: (newSettings: ChatSettings) => void;
  showTitle?: boolean;
  readOnly?: boolean;
  // Model props (optional - only used in session settings)
  currentModel?: string;
  currentModelDetails?: ModelDetails; // Optional model details to avoid fetching all models
  onModelChange?: (model: string | undefined, details?: ModelDetails) => void;
  onSaveToDefaults?: () => Promise<void>;
  // Autonomous props (optional - only used in session settings)
  sessionAutonomous?: boolean;
  agentAutonomous?: boolean;
  onAutonomousChange?: (autonomous: boolean) => Promise<{ success: boolean; error?: string }>;
  tabId?: string;
}

export const ChatSettingsForm: React.FC<ChatSettingsFormProps> = ({
  settings,
  onSettingsChange,
  showTitle = true,
  readOnly = false,
  currentModel,
  currentModelDetails,
  onModelChange,
  onSaveToDefaults,
  sessionAutonomous,
  agentAutonomous,
  onAutonomousChange,
  tabId
}) => {
  const [agentSettings, setAgentSettings] = useState<ChatSettings>(() => {
    const defaults = getDefaultSettings();
    return {
      maxChatTurns: defaults.maxChatTurns!,
      maxOutputTokens: defaults.maxOutputTokens!,
      temperature: defaults.temperature!,
      topP: defaults.topP!,
      toolPermission: defaults.toolPermission ?? 'tool',
      contextTopK: defaults.contextTopK!,
      contextTopN: defaults.contextTopN!,
      contextIncludeScore: defaults.contextIncludeScore!
    };
  });
  const [agentModel, setAgentModel] = useState<string | undefined>();
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelProvider, setModelProvider] = useState<ProviderId | undefined>();
  const [modelProviderName, setModelProviderName] = useState<string | undefined>();
  const [modelId, setModelId] = useState<string | undefined>();
  const [modelName, setModelName] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    if (!modelProvider) {
      setModelProviderName(undefined);
      return;
    }
    window.api.getProviderInfo(modelProvider)
      .then(info => {
        if (!cancelled) {
          setModelProviderName(info.name);
        }
      })
      .catch(error => {
        log.error(`Failed to load provider info for ${modelProvider}:`, error);
        if (!cancelled) {
          setModelProviderName(modelProvider);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [modelProvider]);

  const loadAgentSettings = useCallback(async () => {
    try {
      const agentSettings = await window.api.getSettings();
      const merged = { ...getDefaultSettings(), ...(agentSettings ?? {}) };
      setAgentSettings({
        maxChatTurns: merged.maxChatTurns!,
        maxOutputTokens: merged.maxOutputTokens!,
        temperature: merged.temperature!,
        topP: merged.topP!,
        toolPermission: merged.toolPermission ?? 'tool',
        contextTopK: merged.contextTopK!,
        contextTopN: merged.contextTopN!,
        contextIncludeScore: merged.contextIncludeScore!
      });
      setAgentModel(merged.model);
    } catch (error) {
      log.error('Error loading agent settings:', error);
    }
  }, []);

  useEffect(() => {
    loadAgentSettings();
  }, [loadAgentSettings]);

  // Subscribe to settings-changed event to reload agent settings
  useEffect(() => {
    const listener = window.api.onSettingsChanged(() => {
      log.info(`[ChatSettingsForm] Settings changed event received, reloading agent settings (showTitle=${showTitle})`);
      loadAgentSettings();
    });
    log.info(`[ChatSettingsForm] Subscribed to settings-changed event (showTitle=${showTitle})`);
    return () => {
      window.api.offSettingsChanged(listener);
      log.info(`[ChatSettingsForm] Unsubscribed from settings-changed event (showTitle=${showTitle})`);
    };
  }, [loadAgentSettings, showTitle]);

  // Load model info when currentModel or currentModelDetails changes
  useEffect(() => {
    const loadModelInfo = async () => {
      // If we have model details, use them immediately (no async lookup needed)
      if (currentModelDetails) {
        setModelProvider(currentModelDetails.provider);
        setModelId(currentModelDetails.modelId);
        setModelName(currentModelDetails.modelName);
        return;
      }
      
      // Otherwise, fall back to async lookup (using cache)
      if (currentModel) {
        const parsed = parseModelString(currentModel);
        if (parsed) {
          setModelProvider(parsed.provider);
          setModelId(parsed.modelId);
          // Use cache with async fallback
          const details = await getAgentModelDetails(
            currentModel,
            (p) => window.api.getModelsForProvider(p)
          );
          if (details) {
            setModelName(details.modelName);
          } else {
            setModelName(parsed.modelId);
          }
        }
      } else {
        setModelProvider(undefined);
        setModelId(undefined);
        setModelName(undefined);
      }
    };
    loadModelInfo();
  }, [currentModel, currentModelDetails]);

  const areSettingsDefault = () => {
    const settingsMatch = (
      settings.maxChatTurns === agentSettings.maxChatTurns &&
      settings.maxOutputTokens === agentSettings.maxOutputTokens &&
      settings.temperature === agentSettings.temperature &&
      settings.topP === agentSettings.topP &&
      settings.toolPermission === agentSettings.toolPermission &&
      settings.contextTopK === agentSettings.contextTopK &&
      settings.contextTopN === agentSettings.contextTopN &&
      settings.contextIncludeScore === agentSettings.contextIncludeScore
    );
    
    // If model is provided, compare it too
    if (currentModel !== undefined || agentModel !== undefined) {
      return settingsMatch && currentModel === agentModel;
    }
    
    return settingsMatch;
  };

  const handleRestoreDefaults = () => {
    onSettingsChange(agentSettings);
  };

  const handleChange = (key: keyof ChatSettings, value: string | number) => {
    const newSettings = { ...settings };
    if (key === 'toolPermission') {
      // value is already validated - it comes from a select with fixed options
      newSettings[key] = value as SessionToolPermission;
    } else if (typeof value === 'string') {
      newSettings[key] = parseFloat(value) as any;
    } else {
      newSettings[key] = value as any;
    }
    onSettingsChange(newSettings);
  };

  return (
    <div className="settings-section">
      {showTitle && (
        <>
          <div className="settings-header">
              <h3>
              Chat Settings
              <span className="setting-description">Any changes here will apply only to this chat session, unless saved to defaults.</span>
            </h3>
            <div className="settings-actions">
              {!areSettingsDefault() && (
                <>
                  <button 
                    className="btn-restore-defaults"
                    onClick={handleRestoreDefaults}
                    title="Restore agent default settings"
                    disabled={readOnly}
                  >
                    Restore Agent Defaults
                  </button>
                  {onSaveToDefaults && (
                    <button 
                      className="btn-save-to-defaults"
                      onClick={onSaveToDefaults}
                      title="Save current settings as agent defaults"
                      disabled={readOnly}
                    >
                      Save to Defaults
                    </button>
                  )}
                </>
              )}
              {areSettingsDefault() && (
                <span className="default-indicator" title="Using agent default settings">
                  Using Agent Default Settings
                </span>
              )}
            </div>
          </div>
          <hr className="setting-group-divider" />
        </>
      )}
      {currentModel !== undefined && onModelChange && (
        <>
          <div className="setting-item" style={{ gridColumn: '1 / -1' }}>
            <label>Model</label>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px',
              padding: '8px',
              marginBottom: '20px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '4px',
              border: '1px solid var(--border-color)'
            }}>
              {modelProvider && (
                <ProviderIcon 
                  providerType={modelProvider}
                  alt={modelProvider}
                  style={{
                    width: '24px',
                    height: '24px',
                    objectFit: 'contain',
                    backgroundColor: 'var(--logo-bg)',
                    padding: '4px',
                    borderRadius: '4px'
                  }}
                />
              )}
              <div style={{ flex: 1 }}>
                {modelProvider ? (
                  <>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '14px' }}>
                      {modelProviderName || modelProvider}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                      {modelName || modelId || 'No model selected'}
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No model selected</div>
                )}
              </div>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowModelPicker(true)}
                disabled={readOnly}
                style={{ fontSize: '12px', padding: '4px 8px' }}
              >
                Change Model
              </button>
            </div>
          </div>
        </>
      )}
      {tabId && (
        <>
          <div className="setting-item" style={{ gridColumn: '1 / -1', marginBottom: '20px' }}>
            <label>Session Type</label>
            <div className="agent-mode-selector">
              {(() => {
                const isTestTab: boolean = tabId.startsWith('test-');
                const isDisabled = agentAutonomous || isTestTab || readOnly;
                const effectiveAutonomous = isTestTab ? true : (sessionAutonomous !== undefined ? sessionAutonomous : false);
                return (
                  <>
                    <button
                      className={`mode-button ${!effectiveAutonomous ? 'active' : ''}`}
                      onClick={async () => {
                        if (agentAutonomous || isTestTab) {
                          await window.api.showMessageBox({
                            type: 'error',
                            title: 'Cannot Change Session Type',
                            message: isTestTab
                              ? 'Test sessions are always autonomous and cannot be changed.'
                              : 'This agent is configured as autonomous. All sessions must be autonomous.',
                            buttons: ['OK']
                          });
                          return;
                        }
                        if (!onAutonomousChange) return;
                        const result = await onAutonomousChange(false);
                        if (!result.success) {
                          await window.api.showMessageBox({
                            type: 'error',
                            title: 'Failed to Change Session Type',
                            message: result.error || 'Unknown error',
                            buttons: ['OK']
                          });
                        }
                      }}
                      disabled={isDisabled}
                    >
                      Interactive
                    </button>
                    <button
                      className={`mode-button ${effectiveAutonomous ? 'active' : ''}`}
                      onClick={async () => {
                        if (!onAutonomousChange) return;
                        const result = await onAutonomousChange(true);
                        if (!result.success) {
                          await window.api.showMessageBox({
                            type: 'error',
                            title: 'Failed to Change Session Type',
                            message: result.error || 'Unknown error',
                            buttons: ['OK']
                          });
                        }
                      }}
                      disabled={isDisabled}
                    >
                      Autonomous
                    </button>
                  </>
                );
              })()}
            </div>
            <div className="agent-mode-description">
              {(() => {
                const isTestTab: boolean = tabId.startsWith('test-');
                
                if (isTestTab) {
                  return 'When testing exported tools, agents run autonomously. This allows tools to be executed automatically without user interaction.';
                }
                
                if (agentAutonomous) {
                  return 'This agent is configured as autonomous. All sessions must be autonomous and run without user interaction.';
                }
                
                const effectiveAutonomous = sessionAutonomous !== undefined ? sessionAutonomous : false;
                return effectiveAutonomous
                  ? 'Autonomous session runs without user interaction. Tools requiring approval are filtered out.'
                  : 'Interactive session supports user interaction including clarifying questions and tool use permission requests.';
              })()}
            </div>
          </div>
          <hr className="setting-group-divider" style={{ gridColumn: '1 / -1' }} />
        </>
      )}
      <div className="settings-grid">
        <div className="setting-item">
          <label htmlFor="maxChatTurns">Maximum Chat Turns</label>
          <input
            type="number"
            id="maxChatTurns"
            value={settings.maxChatTurns}
            onChange={(e) => handleChange('maxChatTurns', parseInt(e.target.value))}
            min="1"
            max="100"
            disabled={readOnly}
          />
          <div className="setting-description">
            Maximum number of turns (typically tool calls) allowed in response to a single message before forcing a stop.
          </div>
        </div>

        <div className="setting-item">
          <label htmlFor="maxOutputTokens">Maximum Output Tokens</label>
          <input
            type="number"
            id="maxOutputTokens"
            value={settings.maxOutputTokens}
            onChange={(e) => handleChange('maxOutputTokens', parseInt(e.target.value))}
            min="100"
            max="4000"
            disabled={readOnly}
          />
          <div className="setting-description">
            Maximum number of tokens the AI can generate in a single response.
          </div>
        </div>

        <div className="setting-item">
          <label htmlFor="temperature">Temperature</label>
          <div className="slider-container">
            <input
              type="range"
              id="temperature"
              value={settings.temperature}
              onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
              min="0"
              max="1"
              step="0.05"
              disabled={readOnly}
            />
            <div className="setting-value">{settings.temperature.toFixed(2)}</div>
          </div>
          <div className="setting-description">
            Controls randomness in the AI's responses. Lower values make responses more focused and deterministic.
          </div>
        </div>

        <div className="setting-item">
          <label htmlFor="topP">Top P (Nucleus Sampling)</label>
          <div className="slider-container">
            <input
              type="range"
              id="topP"
              value={settings.topP}
              onChange={(e) => handleChange('topP', parseFloat(e.target.value))}
              min="0"
              max="1"
              step="0.05"
              disabled={readOnly}
            />
            <div className="setting-value">{settings.topP.toFixed(2)}</div>
          </div>
          <div className="setting-description">
            Controls diversity in the AI's responses. Lower values make responses more focused and deterministic.
          </div>
        </div>

        <div className="setting-item">
          <label htmlFor="toolPermission">Tool Usage Permission</label>
          <select
            value={settings.toolPermission}
            onChange={(e) => {
              // e.target.value is guaranteed to be one of the option values
              handleChange('toolPermission', e.target.value as SessionToolPermission);
            }}
            style={{ width: 'fit-content' }}
            disabled={readOnly}
          >
            <option value="tool">Request permission based on tool setting</option>
            <option value="always">Always request permission</option>
            <option value="never">Never request permission</option>
          </select>
        </div>

        <hr className="setting-group-divider" />
        <div className="setting-group-header">
          <span className="setting-group-title">Agent Context Selection</span>
          <div className="setting-group-description">
            Control how context items with "agent" include are selected for each request.
          </div>
        </div>

        <div className="setting-item">
          <label htmlFor="contextTopK">Top K (Chunk Matches)</label>
          <input
            type="number"
            id="contextTopK"
            value={settings.contextTopK}
            onChange={(e) => handleChange('contextTopK', parseInt(e.target.value))}
            min="1"
            max="100"
            disabled={readOnly}
          />
          <div className="setting-description">
            Maximum number of chunk matches to consider when selecting relevant context items.
          </div>
        </div>

        <div className="setting-item">
          <label htmlFor="contextTopN">Top N (Items)</label>
          <input
            type="number"
            id="contextTopN"
            value={settings.contextTopN}
            onChange={(e) => handleChange('contextTopN', parseInt(e.target.value))}
            min="1"
            max="50"
            disabled={readOnly}
          />
          <div className="setting-description">
            Target number of context items to include after grouping by item (may exceed if include score threshold is met).
          </div>
        </div>

        <div className="setting-item">
          <label htmlFor="contextIncludeScore">Include Score Threshold</label>
          <div className="slider-container">
            <input
              type="range"
              id="contextIncludeScore"
              value={settings.contextIncludeScore}
              onChange={(e) => handleChange('contextIncludeScore', parseFloat(e.target.value))}
              min="0"
              max="1"
              step="0.05"
              disabled={readOnly}
            />
            <div className="setting-value">{settings.contextIncludeScore.toFixed(2)}</div>
          </div>
          <div className="setting-description">
            Always include items with relevance score at or above this threshold, even if the number of items exceeds Top N.
          </div>
        </div>
      </div>
      
      {showModelPicker && currentModel !== undefined && onModelChange && (
        <ModelPickerModal
          currentModel={currentModel}
          onSelect={(model, details) => {
            onModelChange(model, details);
            setShowModelPicker(false);
          }}
          onCancel={() => setShowModelPicker(false)}
          isOpen={showModelPicker}
        />
      )}
    </div>
  );
}; 