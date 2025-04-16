import React, { useEffect, useState } from 'react';
import log from 'electron-log';
import './ChatSettingsForm.css';
import { MAX_CHAT_TURNS_DEFAULT, MAX_OUTPUT_TOKENS_DEFAULT, TEMPERATURE_DEFAULT, TOP_P_DEFAULT, MAX_CHAT_TURNS_KEY, MAX_OUTPUT_TOKENS_KEY, TEMPERATURE_KEY, TOP_P_KEY } from '../../shared/workspace';

export interface ChatSettings {
  maxChatTurns: number;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
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
  const [workspaceSettings, setWorkspaceSettings] = useState<ChatSettings>({
    maxChatTurns: MAX_CHAT_TURNS_DEFAULT,
    maxOutputTokens: MAX_OUTPUT_TOKENS_DEFAULT,
    temperature: TEMPERATURE_DEFAULT,
    topP: TOP_P_DEFAULT
  });

  useEffect(() => {
    const loadWorkspaceSettings = async () => {
      try {
        const maxTurns = await window.api.getSettingsValue(MAX_CHAT_TURNS_KEY);
        const maxTokens = await window.api.getSettingsValue(MAX_OUTPUT_TOKENS_KEY);
        const temperature = await window.api.getSettingsValue(TEMPERATURE_KEY);
        const topP = await window.api.getSettingsValue(TOP_P_KEY);

        setWorkspaceSettings({
          maxChatTurns: maxTurns ? parseInt(maxTurns) : MAX_CHAT_TURNS_DEFAULT,
          maxOutputTokens: maxTokens ? parseInt(maxTokens) : MAX_OUTPUT_TOKENS_DEFAULT,
          temperature: temperature ? parseFloat(temperature) : TEMPERATURE_DEFAULT,
          topP: topP ? parseFloat(topP) : TOP_P_DEFAULT
        });
      } catch (error) {
        log.error('Error loading workspace settings:', error);
      }
    };

    loadWorkspaceSettings();
  }, []);

  const areSettingsDefault = () => {
    return (
      settings.maxChatTurns === workspaceSettings.maxChatTurns &&
      settings.maxOutputTokens === workspaceSettings.maxOutputTokens &&
      settings.temperature === workspaceSettings.temperature &&
      settings.topP === workspaceSettings.topP
    );
  };

  const handleRestoreDefaults = () => {
    onSettingsChange(workspaceSettings);
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
                title="Restore workspace default settings"
              >
                Restore Workspace Defaults
              </button>
            )}
            {areSettingsDefault() && (
              <span className="default-indicator" title="Using workspace default settings">
                Using Workspace Default Settings
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
            onChange={(e) => onSettingsChange({ ...settings, maxChatTurns: parseInt(e.target.value) })}
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
            onChange={(e) => onSettingsChange({ ...settings, maxOutputTokens: parseInt(e.target.value) })}
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
              onChange={(e) => onSettingsChange({ ...settings, temperature: parseFloat(e.target.value) })}
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
              onChange={(e) => onSettingsChange({ ...settings, topP: parseFloat(e.target.value) })}
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
      </div>
    </div>
  );
}; 