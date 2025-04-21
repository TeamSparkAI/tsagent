import React, { useEffect, useState } from 'react';
import log from 'electron-log';
import { TabProps } from '../types/TabProps';
import { AboutView } from './AboutView';
import { ChatSettingsForm, ChatSettings } from './ChatSettingsForm';
import './SettingsTab.css';
import { MAX_CHAT_TURNS_DEFAULT, MAX_OUTPUT_TOKENS_DEFAULT, TEMPERATURE_DEFAULT, TOP_P_DEFAULT, MAX_CHAT_TURNS_KEY, MAX_OUTPUT_TOKENS_KEY, TEMPERATURE_KEY, TOP_P_KEY } from '../../shared/workspace';

export const SettingsTab: React.FC<TabProps> = ({ id, activeTabId, name, type }) => {
  const [activeSection, setActiveSection] = useState<string>('about');
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState<string>('');
  const [initialSystemPrompt, setInitialSystemPrompt] = useState<string>('');
  const [currentChatSettings, setCurrentChatSettings] = useState<ChatSettings>({
    maxChatTurns: MAX_CHAT_TURNS_DEFAULT,
    maxOutputTokens: MAX_OUTPUT_TOKENS_DEFAULT,
    temperature: TEMPERATURE_DEFAULT,
    topP: TOP_P_DEFAULT
  });
  const [initialChatSettings, setInitialChatSettings] = useState<ChatSettings>({
    maxChatTurns: MAX_CHAT_TURNS_DEFAULT,
    maxOutputTokens: MAX_OUTPUT_TOKENS_DEFAULT,
    temperature: TEMPERATURE_DEFAULT,
    topP: TOP_P_DEFAULT
  });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Load system prompt
        const systemPrompt = await window.api.getSystemPrompt();
        setCurrentSystemPrompt(systemPrompt || '');
        setInitialSystemPrompt(systemPrompt || '');
        
        // Load chat settings
        const maxChatTurns = await window.api.getSettingsValue(MAX_CHAT_TURNS_KEY);
        const maxOutputTokens = await window.api.getSettingsValue(MAX_OUTPUT_TOKENS_KEY);
        const temperature = await window.api.getSettingsValue(TEMPERATURE_KEY);
        const topP = await window.api.getSettingsValue(TOP_P_KEY);

        const loadedChatSettings: ChatSettings = {
          maxChatTurns: maxChatTurns ? parseInt(maxChatTurns) : MAX_CHAT_TURNS_DEFAULT,
          maxOutputTokens: maxOutputTokens ? parseInt(maxOutputTokens) : MAX_OUTPUT_TOKENS_DEFAULT,
          temperature: temperature ? parseFloat(temperature) : TEMPERATURE_DEFAULT,
          topP: topP ? parseFloat(topP) : TOP_P_DEFAULT
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

  const handleUndoSystemPromptChanges = () => {
    setCurrentSystemPrompt(initialSystemPrompt);
  };

  const handleSaveChatSettings = async () => {
    try {
      await window.api.setSettingsValue(MAX_CHAT_TURNS_KEY, currentChatSettings.maxChatTurns.toString());
      await window.api.setSettingsValue(MAX_OUTPUT_TOKENS_KEY, currentChatSettings.maxOutputTokens.toString());
      await window.api.setSettingsValue(TEMPERATURE_KEY, currentChatSettings.temperature.toString());
      await window.api.setSettingsValue(TOP_P_KEY, currentChatSettings.topP.toString());
      setInitialChatSettings(currentChatSettings);
      log.info('Chat settings saved successfully');
    } catch (error) {
      log.error('Error saving chat settings:', error);
    }
  };

  const handleUndoChatSettingsChanges = () => {
    setCurrentChatSettings(initialChatSettings);
  };

  const hasSystemPromptChanges = currentSystemPrompt !== initialSystemPrompt;
  const hasChatSettingsChanges = 
    currentChatSettings.maxChatTurns !== initialChatSettings.maxChatTurns ||
    currentChatSettings.maxOutputTokens !== initialChatSettings.maxOutputTokens ||
    currentChatSettings.temperature !== initialChatSettings.temperature ||
    currentChatSettings.topP !== initialChatSettings.topP;

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
              className="common-textarea"
              value={currentSystemPrompt}
              onChange={(e) => setCurrentSystemPrompt(e.target.value)}
              rows={10}
            />
            <div className="settings-actions">
              <button 
                className="btn btn-primary"
                onClick={handleSaveSystemPrompt}
                disabled={!hasSystemPromptChanges}
              >
                Save System Prompt
              </button>
              {hasSystemPromptChanges && (
                <button 
                  className="btn btn-secondary"
                  onClick={handleUndoSystemPromptChanges}
                >
                  Undo Changes
                </button>
              )}
            </div>
          </div>
        );
      case 'chat-settings':
        return (
          <div className="chat-settings">
            <h2>Chat Settings</h2>
            <p className="setting-description">
              Chat Settings will apply to all new chat sessions, and may be overridden on any individual chat session.
            </p>
            <ChatSettingsForm
              settings={currentChatSettings}
              onSettingsChange={setCurrentChatSettings}
              showTitle={false}
            />
            <div style={{ marginTop: '20px' }}>
              <div className="settings-actions">
                <button 
                  className="btn btn-primary"
                  onClick={handleSaveChatSettings}
                  disabled={!hasChatSettingsChanges}
                >
                  Save Chat Settings
                </button>
                {hasChatSettingsChanges && (
                  <button 
                    className="btn btn-secondary"
                    onClick={handleUndoChatSettingsChanges}
                  >
                    Undo Changes
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="tab-items-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Settings</h2>
        </div>
        <div className="tab-items-list">
          <div 
            className={`tab-items-item ${activeSection === 'about' ? 'selected' : ''}`}
            onClick={() => setActiveSection('about')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>ℹ️</span>
            <span>About Settings</span>
          </div>
          <div 
            className={`tab-items-item ${activeSection === 'system-prompt' ? 'selected' : ''}`}
            onClick={() => setActiveSection('system-prompt')}
          >
            <span>System Prompt</span>
          </div>
          <div 
            className={`tab-items-item ${activeSection === 'chat-settings' ? 'selected' : ''}`}
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