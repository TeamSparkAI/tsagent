import React, { useEffect, useState } from 'react';
import log from 'electron-log';
import './ChatSettingsForm.css';
import { SETTINGS_DEFAULT_MAX_CHAT_TURNS, SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS, SETTINGS_DEFAULT_TEMPERATURE, SETTINGS_DEFAULT_TOP_P, SETTINGS_KEY_MAX_CHAT_TURNS, SETTINGS_KEY_MAX_OUTPUT_TOKENS, SETTINGS_KEY_TEMPERATURE, SETTINGS_KEY_TOP_P, SESSION_TOOL_PERMISSION_TOOL, SESSION_TOOL_PERMISSION_ALWAYS, SESSION_TOOL_PERMISSION_NEVER, SessionToolPermission } from 'agent-api';

export interface ChatSettings {
  maxChatTurns: number;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  toolPermission: SessionToolPermission;
}

interface ChatSettingsFormProps {
  settings: ChatSettings;
  onSettingsChange: (newSettings: ChatSettings) => void;
  showTitle?: boolean;
}

export const ChatSettingsForm: React.FC<ChatSettingsFormProps> = ({
  settings,
  onSettingsChange,
  showTitle = true
}) => {
  const [agentSettings, setAgentSettings] = useState<ChatSettings>({
    maxChatTurns: SETTINGS_DEFAULT_MAX_CHAT_TURNS,
    maxOutputTokens: SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: SETTINGS_DEFAULT_TEMPERATURE,
    topP: SETTINGS_DEFAULT_TOP_P,
    toolPermission: SESSION_TOOL_PERMISSION_TOOL as SessionToolPermission
  });

  useEffect(() => {
    const loadAgentSettings = async () => {
      try {
        const maxTurns = await window.api.getSettingsValue(SETTINGS_KEY_MAX_CHAT_TURNS);
        const maxTokens = await window.api.getSettingsValue(SETTINGS_KEY_MAX_OUTPUT_TOKENS);
        const temperature = await window.api.getSettingsValue(SETTINGS_KEY_TEMPERATURE);
        const topP = await window.api.getSettingsValue(SETTINGS_KEY_TOP_P);
        const toolPermission = await window.api.getSettingsValue('toolPermission');

        setAgentSettings({
          maxChatTurns: maxTurns ? parseInt(maxTurns) : SETTINGS_DEFAULT_MAX_CHAT_TURNS,
          maxOutputTokens: maxTokens ? parseInt(maxTokens) : SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS,
          temperature: temperature ? parseFloat(temperature) : SETTINGS_DEFAULT_TEMPERATURE,
          topP: topP ? parseFloat(topP) : SETTINGS_DEFAULT_TOP_P,
          toolPermission: (toolPermission === SESSION_TOOL_PERMISSION_TOOL || toolPermission === SESSION_TOOL_PERMISSION_ALWAYS || toolPermission === SESSION_TOOL_PERMISSION_NEVER) 
            ? toolPermission as SessionToolPermission 
            : SESSION_TOOL_PERMISSION_TOOL as SessionToolPermission
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
      settings.toolPermission === agentSettings.toolPermission
    );
  };

  const handleRestoreDefaults = () => {
    onSettingsChange(agentSettings);
  };

  const handleChange = (key: keyof ChatSettings, value: string | number) => {
    const newSettings = { ...settings };
    if (key === 'toolPermission') {
      if (value === SESSION_TOOL_PERMISSION_TOOL || value === SESSION_TOOL_PERMISSION_ALWAYS || value === SESSION_TOOL_PERMISSION_NEVER) {
        newSettings[key] = value as SessionToolPermission;
      } else {
        newSettings[key] = SESSION_TOOL_PERMISSION_TOOL;
      }
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
            onChange={(e) => handleChange('toolPermission', e.target.value as SessionToolPermission)}
            style={{ width: 'fit-content' }}
          >
            <option value={SESSION_TOOL_PERMISSION_TOOL}>Request permission based on tool setting</option>
            <option value={SESSION_TOOL_PERMISSION_ALWAYS}>Always request permission</option>
            <option value={SESSION_TOOL_PERMISSION_NEVER}>Never request permission</option>
          </select>
        </div>
      </div>
    </div>
  );
}; 