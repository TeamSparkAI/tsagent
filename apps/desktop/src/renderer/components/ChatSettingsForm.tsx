import React, { useEffect, useState } from 'react';
import log from 'electron-log';
import './ChatSettingsForm.css';
import { SessionToolPermission, getDefaultSettings } from '@tsagent/core';

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
}

export const ChatSettingsForm: React.FC<ChatSettingsFormProps> = ({
  settings,
  onSettingsChange,
  showTitle = true,
  readOnly = false
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

  useEffect(() => {
    const loadAgentSettings = async () => {
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
      } catch (error) {
        log.error('Error loading agent settings:', error);
      }
    };

    loadAgentSettings();
  }, []);

  const areSettingsDefault = () => {
    return (
      settings.maxChatTurns === agentSettings.maxChatTurns &&
      settings.maxOutputTokens === agentSettings.maxOutputTokens &&
      settings.temperature === agentSettings.temperature &&
      settings.topP === agentSettings.topP &&
      settings.toolPermission === agentSettings.toolPermission &&
      settings.contextTopK === agentSettings.contextTopK &&
      settings.contextTopN === agentSettings.contextTopN &&
      settings.contextIncludeScore === agentSettings.contextIncludeScore
    );
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
              <span className="setting-description">Any changes here will apply only to this chat session.</span>
            </h3>
            <div className="settings-actions">
              {!areSettingsDefault() && (
                <button 
                  className="btn-restore-defaults"
                  onClick={handleRestoreDefaults}
                  title="Restore agent default settings"
                  disabled={readOnly}
                >
                  Restore Agent Defaults
                </button>
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
    </div>
  );
}; 