import React, { useEffect, useState } from 'react';
import log from 'electron-log';
import { TabProps } from '../types/TabProps';
import { AboutView } from './AboutView';
import { ChatSettingsForm, ChatSettings } from './ChatSettingsForm';
import './SettingsTab.css';
import { 
  SETTINGS_DEFAULT_MAX_CHAT_TURNS, SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS, SETTINGS_DEFAULT_TEMPERATURE, SETTINGS_DEFAULT_TOP_P, 
  SETTINGS_KEY_MAX_CHAT_TURNS, SETTINGS_KEY_MAX_OUTPUT_TOKENS, SETTINGS_KEY_TEMPERATURE, SETTINGS_KEY_TOP_P, SETTINGS_KEY_SYSTEM_PATH, SETTINGS_KEY_THEME, SESSION_TOOL_PERMISSION_KEY, 
  SESSION_TOOL_PERMISSION_ALWAYS, SESSION_TOOL_PERMISSION_TOOL, SESSION_TOOL_PERMISSION_NEVER,
  SessionToolPermission,
} from 'agent-api';

export const SettingsTab: React.FC<TabProps> = ({ id, activeTabId, name, type }) => {
  const [activeSection, setActiveSection] = useState<string>('about');
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState<string>('');
  const [initialSystemPrompt, setInitialSystemPrompt] = useState<string>('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [toolPermission, setToolPermission] = useState<string>(SESSION_TOOL_PERMISSION_TOOL);
  const [currentChatSettings, setCurrentChatSettings] = useState<ChatSettings>({
    maxChatTurns: SETTINGS_DEFAULT_MAX_CHAT_TURNS,
    maxOutputTokens: SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: SETTINGS_DEFAULT_TEMPERATURE,
    topP: SETTINGS_DEFAULT_TOP_P,
    toolPermission: SESSION_TOOL_PERMISSION_TOOL as SessionToolPermission
  });
  const [initialChatSettings, setInitialChatSettings] = useState<ChatSettings>({
    maxChatTurns: SETTINGS_DEFAULT_MAX_CHAT_TURNS,
    maxOutputTokens: SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: SETTINGS_DEFAULT_TEMPERATURE,
    topP: SETTINGS_DEFAULT_TOP_P,
    toolPermission: SESSION_TOOL_PERMISSION_TOOL as SessionToolPermission
  });
  const [currentSystemPath, setCurrentSystemPath] = useState<string>('');
  const [initialSystemPath, setInitialSystemPath] = useState<string>('');

  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Load theme
        const savedTheme = await window.api.getSettingsValue(SETTINGS_KEY_THEME);
        if (savedTheme) {
          setTheme(savedTheme as 'light' | 'dark');
          document.documentElement.setAttribute('data-theme', savedTheme);
        } else {
          // Check system preference
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          const defaultTheme = prefersDark ? 'dark' : 'light';
          setTheme(defaultTheme);
          document.documentElement.setAttribute('data-theme', defaultTheme);
          await window.api.setSettingsValue(SETTINGS_KEY_THEME, defaultTheme);
        }

        // Load system prompt
        const systemPrompt = await window.api.getSystemPrompt();
        setCurrentSystemPrompt(systemPrompt || '');
        setInitialSystemPrompt(systemPrompt || '');
        
        // Load chat settings
        const maxChatTurns = await window.api.getSettingsValue(SETTINGS_KEY_MAX_CHAT_TURNS);
        const maxOutputTokens = await window.api.getSettingsValue(SETTINGS_KEY_MAX_OUTPUT_TOKENS);
        const temperature = await window.api.getSettingsValue(SETTINGS_KEY_TEMPERATURE);
        const topP = await window.api.getSettingsValue(SETTINGS_KEY_TOP_P);
        const toolPermission = await window.api.getSettingsValue(SESSION_TOOL_PERMISSION_KEY);

        const loadedChatSettings: ChatSettings = {
          maxChatTurns: maxChatTurns ? parseInt(maxChatTurns) : SETTINGS_DEFAULT_MAX_CHAT_TURNS,
          maxOutputTokens: maxOutputTokens ? parseInt(maxOutputTokens) : SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS,
          temperature: temperature ? parseFloat(temperature) : SETTINGS_DEFAULT_TEMPERATURE,
          topP: topP ? parseFloat(topP) : SETTINGS_DEFAULT_TOP_P,
          toolPermission: (toolPermission === SESSION_TOOL_PERMISSION_TOOL || toolPermission === SESSION_TOOL_PERMISSION_ALWAYS || toolPermission === SESSION_TOOL_PERMISSION_NEVER) 
            ? toolPermission as SessionToolPermission 
            : SESSION_TOOL_PERMISSION_TOOL as SessionToolPermission
        };

        setCurrentChatSettings(loadedChatSettings);
        setInitialChatSettings(loadedChatSettings);

        // Load system path
        const systemPath = await window.api.getSettingsValue(SETTINGS_KEY_SYSTEM_PATH);
        setCurrentSystemPath(systemPath || '');
        setInitialSystemPath(systemPath || '');
      } catch (error) {
        log.error('Error loading settings:', error);
      }
    };

    loadSettings();
  }, []);

  const handleThemeToggle = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
            await window.api.setSettingsValue(SETTINGS_KEY_THEME, newTheme);
  };

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
              await window.api.setSettingsValue(SETTINGS_KEY_MAX_CHAT_TURNS, currentChatSettings.maxChatTurns.toString());
        await window.api.setSettingsValue(SETTINGS_KEY_MAX_OUTPUT_TOKENS, currentChatSettings.maxOutputTokens.toString());
        await window.api.setSettingsValue(SETTINGS_KEY_TEMPERATURE, currentChatSettings.temperature.toString());
        await window.api.setSettingsValue(SETTINGS_KEY_TOP_P, currentChatSettings.topP.toString());
      await window.api.setSettingsValue(SESSION_TOOL_PERMISSION_KEY, currentChatSettings.toolPermission);
      setInitialChatSettings(currentChatSettings);
      log.info('Chat settings saved successfully');
    } catch (error) {
      log.error('Error saving chat settings:', error);
    }
  };

  const handleUndoChatSettingsChanges = () => {
    setCurrentChatSettings(initialChatSettings);
  };

  const handleSaveSystemPath = async () => {
    try {
              await window.api.setSettingsValue(SETTINGS_KEY_SYSTEM_PATH, currentSystemPath);
      setInitialSystemPath(currentSystemPath);
      log.info('System path saved successfully');
    } catch (error) {
      log.error('Error saving system path:', error);
    }
  };

  const handleUndoSystemPathChanges = () => {
    setCurrentSystemPath(initialSystemPath);
  };

  const hasSystemPromptChanges = currentSystemPrompt !== initialSystemPrompt;
  const hasChatSettingsChanges = 
    currentChatSettings.maxChatTurns !== initialChatSettings.maxChatTurns ||
    currentChatSettings.maxOutputTokens !== initialChatSettings.maxOutputTokens ||
    currentChatSettings.temperature !== initialChatSettings.temperature ||
    currentChatSettings.topP !== initialChatSettings.topP ||
    currentChatSettings.toolPermission !== initialChatSettings.toolPermission;
  const hasSystemPathChanges = currentSystemPath !== initialSystemPath;

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
                <p>
                  <strong>Tools Settings:</strong> Configure the default PATH environment variable used for tool executions.
                </p>
                <p>
                  <strong>Appearance:</strong> Toggle between light and dark mode to customize the visual theme of the application.
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
      case 'tools-settings':
        return (
          <div className="tools-settings">
            <h2>Tools Settings</h2>
            <p className="setting-description">
              Configure the default PATH environment variable used for tool executions. This will be used when no PATH environment variable is provided in the tool configuration.
            </p>
            <p className="setting-description">
              This value, when specified, should contain the paths to the executables of your tool commands, such as <b>node</b>, <b>npx</b>, <b>python</b>, <b>uv</b>,
              <b>uvx</b>, etc. as well as to any systems tools that they require.
            </p>
            <div className="setting-input">
              <label htmlFor="systemPath">Default PATH:</label>
              <input
                type="text"
                id="systemPath"
                value={currentSystemPath}
                onChange={(e) => setCurrentSystemPath(e.target.value)}
                placeholder="e.g. /usr/local/bin:/usr/bin:/bin"
                className="common-input"
              />
            </div>
            <div className="settings-actions">
              <button 
                className="btn btn-primary"
                onClick={handleSaveSystemPath}
                disabled={!hasSystemPathChanges}
              >
                Save Tools Settings
              </button>
              {hasSystemPathChanges && (
                <button 
                  className="btn btn-secondary"
                  onClick={handleUndoSystemPathChanges}
                >
                  Undo Changes
                </button>
              )}
            </div>
          </div>
        );
      case 'appearance':
        return (
          <div className="appearance-settings">
            <h2>Appearance</h2>
            <p className="setting-description">
              Customize the visual theme of the application to match your preferences.
            </p>
            <div className="theme-toggle">
              <label htmlFor="theme-toggle">Dark Mode</label>
              <button
                id="theme-toggle"
                className={`theme-toggle-button ${theme === 'dark' ? 'active' : ''}`}
                onClick={handleThemeToggle}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              >
                <span className="theme-toggle-slider"></span>
              </button>
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
          >
            <span className="info-icon">ℹ️</span>
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
          <div 
            className={`tab-items-item ${activeSection === 'tools-settings' ? 'selected' : ''}`}
            onClick={() => setActiveSection('tools-settings')}
          >
            <span>Tools Settings</span>
          </div>
          <div 
            className={`tab-items-item ${activeSection === 'appearance' ? 'selected' : ''}`}
            onClick={() => setActiveSection('appearance')}
          >
            <span>Appearance</span>
          </div>
        </div>
      </div>
      <div className="settings-main">
        {renderContent()}
      </div>
    </div>
  );
}; 