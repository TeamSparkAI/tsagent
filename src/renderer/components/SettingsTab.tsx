import React, { useEffect, useState } from 'react';
import log from 'electron-log';
import { TabProps } from '../types/TabProps';
import { AboutView } from './AboutView';
import './SettingsTab.css';

export const SettingsTab: React.FC<TabProps> = ({ id, activeTabId, name, type }) => {
  const [activeSection, setActiveSection] = useState<string>('about');
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState<string>('');
  const [initialSystemPrompt, setInitialSystemPrompt] = useState<string>('');
  const [currentChatSettings, setCurrentChatSettings] = useState({
    maxChatTurns: 10,
    maxOutputTokens: 1000,
    temperature: 0.7,
    topP: 0.9
  });
  const [initialChatSettings, setInitialChatSettings] = useState({
    maxChatTurns: 10,
    maxOutputTokens: 1000,
    temperature: 0.7,
    topP: 0.9
  });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Load system prompt
        const systemPrompt = await window.api.getSystemPrompt();
        setCurrentSystemPrompt(systemPrompt || '');
        setInitialSystemPrompt(systemPrompt || '');
        
        // Load chat settings
        const maxChatTurns = await window.api.getSettingsValue('maxChatTurns');
        const maxOutputTokens = await window.api.getSettingsValue('maxOutputTokens');
        const temperature = await window.api.getSettingsValue('temperature');
        const topP = await window.api.getSettingsValue('topP');

        const loadedChatSettings = {
          maxChatTurns: maxChatTurns ? parseInt(maxChatTurns) : 10,
          maxOutputTokens: maxOutputTokens ? parseInt(maxOutputTokens) : 1000,
          temperature: temperature ? parseFloat(temperature) : 0.7,
          topP: topP ? parseFloat(topP) : 0.9
        };

        setCurrentChatSettings(loadedChatSettings);
        setInitialChatSettings(loadedChatSettings);
      } catch (error) {
        log.error('Error loading settings:', error);
      }
    };

    loadSettings();
  }, []);

  const handleSaveSystemPrompt = async () => {
    try {
      await window.api.saveSystemPrompt(currentSystemPrompt);
      setInitialSystemPrompt(currentSystemPrompt);
      log.info('System prompt saved successfully');
    } catch (error) {
      log.error('Error saving system prompt:', error);
    }
  };

  const handleSaveChatSettings = async () => {
    try {
      await window.api.setSettingsValue('maxChatTurns', currentChatSettings.maxChatTurns.toString());
      await window.api.setSettingsValue('maxOutputTokens', currentChatSettings.maxOutputTokens.toString());
      await window.api.setSettingsValue('temperature', currentChatSettings.temperature.toString());
      await window.api.setSettingsValue('topP', currentChatSettings.topP.toString());
      setInitialChatSettings(currentChatSettings);
      log.info('Chat settings saved successfully');
    } catch (error) {
      log.error('Error saving chat settings:', error);
    }
  };

  const hasSystemPromptChanges = currentSystemPrompt !== initialSystemPrompt;
  const hasChatSettingsChanges = 
    currentChatSettings.maxChatTurns !== initialChatSettings.maxChatTurns ||
    currentChatSettings.maxOutputTokens !== initialChatSettings.maxOutputTokens ||
    currentChatSettings.temperature !== initialChatSettings.temperature ||
    currentChatSettings.topP !== initialChatSettings.topP;

  // Debug logging
  useEffect(() => {
    log.info('System Prompt Changes:', {
      current: currentSystemPrompt,
      initial: initialSystemPrompt,
      hasChanges: hasSystemPromptChanges
    });
    log.info('Chat Settings Changes:', {
      current: currentChatSettings,
      initial: initialChatSettings,
      hasChanges: hasChatSettingsChanges
    });
  }, [currentSystemPrompt, initialSystemPrompt, currentChatSettings, initialChatSettings]);

  const renderContent = () => {
    switch (activeSection) {
      case 'about':
        return (
          <AboutView
            title="About Settings"
            description={
              <div>
                <p>
                  This tab allows you to configure various settings for your workspace.
                  Use the menu on the left to navigate between different settings sections.
                </p>
                <p>
                  <strong>System Prompt:</strong> Configure the default system prompt that will be used for all chat sessions.
                </p>
                <p>
                  <strong>Chat Settings:</strong> Adjust parameters like maximum chat turns, output tokens, temperature, and top-p values.
                </p>
              </div>
            }
          />
        );
      case 'system-prompt':
        return (
          <div className="system-prompt-settings">
            <h2>System Prompt</h2>
            <p>
              The system prompt is used to set the initial context and behavior for the AI assistant.
              This prompt will be used for all chat sessions (existing and new).
            </p>
            <textarea
              value={currentSystemPrompt}
              onChange={(e) => setCurrentSystemPrompt(e.target.value)}
              rows={10}
            />
            <button 
              onClick={handleSaveSystemPrompt}
              disabled={!hasSystemPromptChanges}
            >
              Save System Prompt
            </button>
          </div>
        );
      case 'chat-settings':
        return (
          <div className="chat-settings">
            <h2>Chat Settings</h2>
            <p className="setting-description">
              Chat Settings will apply to all new chat sessions, and may be overridden on any individual chat session.
            </p>
            <div className="settings-grid">
              <div className="setting-item">
                <label htmlFor="maxChatTurns">Maximum Chat Turns</label>
                <input
                  type="number"
                  id="maxChatTurns"
                  value={currentChatSettings.maxChatTurns}
                  onChange={(e) => setCurrentChatSettings({ ...currentChatSettings, maxChatTurns: parseInt(e.target.value) })}
                  min="1"
                  max="100"
                />
                <div className="setting-description">
                  Maximum number of turns (typically tool calls) in a chat session before forcing a stop.
                </div>
              </div>

              <div className="setting-item">
                <label htmlFor="maxOutputTokens">Maximum Output Tokens</label>
                <input
                  type="number"
                  id="maxOutputTokens"
                  value={currentChatSettings.maxOutputTokens}
                  onChange={(e) => setCurrentChatSettings({ ...currentChatSettings, maxOutputTokens: parseInt(e.target.value) })}
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
                    value={currentChatSettings.temperature}
                    onChange={(e) => setCurrentChatSettings({ ...currentChatSettings, temperature: parseFloat(e.target.value) })}
                    min="0"
                    max="1"
                    step="0.05"
                  />
                  <div className="setting-value">{currentChatSettings.temperature.toFixed(2)}</div>
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
                    value={currentChatSettings.topP}
                    onChange={(e) => setCurrentChatSettings({ ...currentChatSettings, topP: parseFloat(e.target.value) })}
                    min="0"
                    max="1"
                    step="0.05"
                  />
                  <div className="setting-value">{currentChatSettings.topP.toFixed(2)}</div>
                </div>
                <div className="setting-description">
                  Controls diversity in the AI's responses. Lower values make responses more focused and deterministic.
                </div>
              </div>

              <button 
                onClick={handleSaveChatSettings}
                disabled={!hasChatSettingsChanges}
              >
                Save Chat Settings
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="settings-container">
      <div className="settings-sidebar">
        <div className="sidebar-header">
          <h3>Settings</h3>
        </div>
        <div className="settings-list">
          <div 
            className={`settings-item ${activeSection === 'about' ? 'selected' : ''}`}
            onClick={() => setActiveSection('about')}
          >
            <span>ℹ️</span>
            <span>About Settings</span>
          </div>
          <div 
            className={`settings-item ${activeSection === 'system-prompt' ? 'selected' : ''}`}
            onClick={() => setActiveSection('system-prompt')}
          >
            <span>System Prompt</span>
          </div>
          <div 
            className={`settings-item ${activeSection === 'chat-settings' ? 'selected' : ''}`}
            onClick={() => setActiveSection('chat-settings')}
          >
            <span>Chat Settings</span>
          </div>
        </div>
      </div>
      <div className="settings-main">
        {renderContent()}
      </div>
    </div>
  );
}; 