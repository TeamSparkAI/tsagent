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
  SessionToolPermission, AgentMetadata, AgentSkill,
} from '@tsagent/core';

interface EditSkillModalProps {
  skill?: AgentSkill;
  onSave: (skill: AgentSkill) => void;
  onCancel: () => void;
}

const ArrayInput: React.FC<{
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  label: string;
  onPendingItemChange?: (item: string) => void;
}> = ({ items, onChange, placeholder, label, onPendingItemChange }) => {
  const [newItem, setNewItem] = useState('');

  const addItem = () => {
    if (newItem.trim()) {
      onChange([...items, newItem.trim()]);
      setNewItem('');
      onPendingItemChange?.('');
    }
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewItem(value);
    onPendingItemChange?.(value);
  };

  return (
    <div className="array-input">
      <label>{label}</label>
      <div className="array-input-container">
        <input
          type="text"
          value={newItem}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          className="array-input-field"
        />
        <button 
          type="button" 
          onClick={addItem} 
          className="array-add-button"
          disabled={!newItem.trim()}
          title="Add item"
        >
          +
        </button>
      </div>
      <div className="array-items">
        {items.map((item, index) => (
          <div key={index} className="array-item">
            <span>{item}</span>
            <button type="button" onClick={() => removeItem(index)} className="btn-remove">×</button>
          </div>
        ))}
      </div>
    </div>
  );
};

const EditSkillModal: React.FC<EditSkillModalProps> = ({ skill, onSave, onCancel }) => {
  const [name, setName] = useState(skill?.name || '');
  const [description, setDescription] = useState(skill?.description || '');
  const [tags, setTags] = useState<string[]>(skill?.tags || []);
  const [examples, setExamples] = useState<string[]>(skill?.examples ?? []);
  const [pendingTag, setPendingTag] = useState('');
  const [pendingExample, setPendingExample] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    
    if (!name.trim()) {
      setError('Skill name is required');
      return;
    }
    
    if (!description.trim()) {
      setError('Skill description is required');
      return;
    }

    // Auto-add any pending items from the input fields
    const finalTags = [...tags];
    const finalExamples = [...examples];
    
    // Add pending tag if it exists and isn't already in the list
    if (pendingTag.trim() && !finalTags.includes(pendingTag.trim())) {
      finalTags.push(pendingTag.trim());
    }
    
    // Add pending example if it exists and isn't already in the list
    if (pendingExample.trim() && !finalExamples.includes(pendingExample.trim())) {
      finalExamples.push(pendingExample.trim());
    }

    const skillData: AgentSkill = {
      id: skill?.id || `skill_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      tags: finalTags,
      examples: finalExamples.length > 0 ? finalExamples : undefined
    };

    onSave(skillData);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>{skill ? 'Edit Skill' : 'Add Skill'}</h2>
      
      {error && (
        <div className="error-message" style={{ 
          color: '#dc3545', 
          backgroundColor: '#f8d7da', 
          padding: '8px 12px', 
          borderRadius: '4px', 
          marginBottom: '16px' 
        }}>
          {error}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="skill-name">Name *</label>
        <input
          id="skill-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter skill name"
          className="common-input"
        />
      </div>

      <div className="form-group">
        <label htmlFor="skill-description">Description *</label>
        <textarea
          id="skill-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this skill does"
          rows={3}
          className="common-textarea"
        />
      </div>

      <ArrayInput
        items={tags}
        onChange={setTags}
        placeholder="Enter a tag"
        label="Tags"
        onPendingItemChange={setPendingTag}
      />

      <ArrayInput
        items={examples}
        onChange={setExamples}
        placeholder="Enter an example"
        label="Examples"
        onPendingItemChange={setPendingExample}
      />

      <div className="settings-actions">
        <button className="btn btn-primary" onClick={handleSave}>
          {skill ? 'Update Skill' : 'Add Skill'}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
};

const AgentInfoSection: React.FC = () => {
  const [metadata, setMetadata] = useState<AgentMetadata | null>(null);
  const [originalMetadata, setOriginalMetadata] = useState<AgentMetadata | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [documentationUrl, setDocumentationUrl] = useState('');
  const [providerOrg, setProviderOrg] = useState('');
  const [providerUrl, setProviderUrl] = useState('');
  const [agentMode, setAgentMode] = useState<'interactive' | 'autonomous'>('interactive');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Skills editing state
  const [isEditingSkill, setIsEditingSkill] = useState(false);
  const [editingSkill, setEditingSkill] = useState<AgentSkill | undefined>(undefined);

  useEffect(() => {
    loadAgentMetadata();
  }, []);

  const loadAgentMetadata = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const agentMetadata = await window.api.getAgentMetadata();
      if (agentMetadata) {
        setMetadata(agentMetadata);
        setOriginalMetadata(JSON.parse(JSON.stringify(agentMetadata))); // Deep copy
        setName(agentMetadata.name);
        setDescription(agentMetadata.description || '');
        setVersion(agentMetadata.version || '');
        setIconUrl(agentMetadata.iconUrl || '');
        setDocumentationUrl(agentMetadata.documentationUrl || '');
        setProviderOrg(agentMetadata.provider?.organization || '');
        setProviderUrl(agentMetadata.provider?.url || '');
        // Set initial mode based on skills - if skills exist and is empty array, it's autonomous
        // If skills is null/undefined, it's interactive
        setAgentMode(agentMetadata.skills && Array.isArray(agentMetadata.skills) ? 'autonomous' : 'interactive');
      }
    } catch (err) {
      log.error('Error loading agent metadata:', err);
      setError('Failed to load agent information');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Agent name is required');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const result = await window.api.updateAgentMetadata({
        name: name.trim(),
        description: description.trim() || undefined,
        version: version.trim() || undefined,
        iconUrl: iconUrl.trim() || undefined,
        documentationUrl: documentationUrl.trim() || undefined,
        provider: (providerOrg.trim() || providerUrl.trim()) ? {
          organization: providerOrg.trim(),
          url: providerUrl.trim()
        } : undefined,
        skills: agentMode === 'autonomous' ? (metadata?.skills || []) : undefined
      });

      if (result.success) {
        setSuccess('Agent information updated successfully');
        // Update original metadata to reflect the saved state
        const updatedMetadata: AgentMetadata = {
          ...metadata!,
          name: name.trim(),
          description: description.trim() || undefined,
          version: version.trim() || undefined,
          iconUrl: iconUrl.trim() || undefined,
          documentationUrl: documentationUrl.trim() || undefined,
          provider: (providerOrg.trim() || providerUrl.trim()) ? {
            organization: providerOrg.trim(),
            url: providerUrl.trim()
          } : undefined,
          skills: agentMode === 'autonomous' ? (metadata?.skills || []) : undefined
        };
        setOriginalMetadata(JSON.parse(JSON.stringify(updatedMetadata)));
        setMetadata(updatedMetadata);
      } else {
        setError(result.error || 'Failed to update agent information');
      }
    } catch (err) {
      log.error('Error updating agent metadata:', err);
      setError('Failed to update agent information');
    } finally {
      setIsSaving(false);
    }
  };

  // Helper function to normalize skills for comparison
  const normalizeSkillsForComparison = (skills: AgentSkill[] | undefined): string => {
    if (!skills || skills.length === 0) return '';
    return JSON.stringify(skills.map(skill => ({
      ...skill,
      examples: skill.examples && skill.examples.length > 0 ? skill.examples : undefined
    })));
  };

  const hasChanges = metadata && originalMetadata && (
    name !== originalMetadata.name || 
    (description || '') !== (originalMetadata.description || '') ||
    (version || '') !== (originalMetadata.version || '') ||
    (iconUrl || '') !== (originalMetadata.iconUrl || '') ||
    (documentationUrl || '') !== (originalMetadata.documentationUrl || '') ||
    (providerOrg || '') !== (originalMetadata.provider?.organization || '') ||
    (providerUrl || '') !== (originalMetadata.provider?.url || '') ||
    agentMode !== (originalMetadata.skills && Array.isArray(originalMetadata.skills) ? 'autonomous' : 'interactive') ||
    normalizeSkillsForComparison(metadata.skills) !== normalizeSkillsForComparison(originalMetadata.skills)
  );

  // Skills handling functions
  const handleAddSkill = () => {
    setEditingSkill(undefined);
    setIsEditingSkill(true);
  };

  const handleEditSkill = (skill: AgentSkill) => {
    setEditingSkill(skill);
    setIsEditingSkill(true);
  };

  const handleDeleteSkill = (skillId: string) => {
    if (!metadata?.skills) return;
    
    const updatedSkills = metadata.skills.filter(skill => skill.id !== skillId);
    setMetadata({
      ...metadata,
      skills: updatedSkills.length > 0 ? updatedSkills : []
    });
  };

  const handleSaveSkill = (skill: AgentSkill) => {
    if (!metadata) return;
    
    // Normalize the skill to ensure examples is undefined if empty
    const normalizedSkill: AgentSkill = {
      ...skill,
      examples: skill.examples && skill.examples.length > 0 ? skill.examples : undefined
    };
    
    const currentSkills = metadata.skills || [];
    let updatedSkills: AgentSkill[];
    
    if (editingSkill) {
      // Update existing skill
      updatedSkills = currentSkills.map(s => s.id === skill.id ? normalizedSkill : s);
    } else {
      // Add new skill
      updatedSkills = [...currentSkills, normalizedSkill];
    }
    
    setMetadata({
      ...metadata,
      skills: updatedSkills
    });
    
    setIsEditingSkill(false);
    setEditingSkill(undefined);
  };

  if (isLoading) {
    return (
      <div className="agent-info-settings">
        <h2>Agent Info</h2>
        <div className="loading">Loading agent information...</div>
      </div>
    );
  }

  // Show skills editing modal if editing
  if (isEditingSkill) {
    return (
      <EditSkillModal
        skill={editingSkill}
        onSave={handleSaveSkill}
        onCancel={() => {
          setIsEditingSkill(false);
          setEditingSkill(undefined);
        }}
      />
    );
  }

  return (
    <div className="agent-info-settings">
      <h2>Agent Info</h2>
      <p className="setting-description">
        Describe the agent. This information helps identify your agent and provides context about its purpose.
      </p>

      {error && (
        <div className="error-message" style={{ 
          color: '#dc3545', 
          backgroundColor: '#f8d7da', 
          padding: '8px 12px', 
          borderRadius: '4px', 
          marginBottom: '16px' 
        }}>
          {error}
        </div>
      )}

      {success && (
        <div className="success-message" style={{ 
          color: '#155724', 
          backgroundColor: '#d4edda', 
          padding: '8px 12px', 
          borderRadius: '4px', 
          marginBottom: '16px' 
        }}>
          {success}
        </div>
      )}

      <div className="form-group">
        <div className="name-version-fields">
          <div className="name-field">
            <label htmlFor="agent-name">
              Name *
            </label>
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter agent name"
              className="common-input"
            />
          </div>
          <div className="version-field">
            <label htmlFor="agent-version">
              Version
            </label>
            <input
              id="agent-version"
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="Enter version (optional)"
              className="common-input"
            />
          </div>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="agent-description">
          Description
        </label>
        <textarea
          id="agent-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your agent"
          rows={4}
          className="common-textarea"
        />
      </div>

      <div className="form-group">
        <label>Provider</label>
        <div className="provider-fields">
          <div className="provider-field">
            <label htmlFor="provider-org">Organization</label>
            <input
              id="provider-org"
              type="text"
              value={providerOrg}
              onChange={(e) => setProviderOrg(e.target.value)}
              placeholder="Organization name"
              className="common-input"
            />
          </div>
          <div className="provider-field">
            <label htmlFor="provider-url">URL</label>
            <input
              id="provider-url"
              type="url"
              value={providerUrl}
              onChange={(e) => setProviderUrl(e.target.value)}
              placeholder="https://example.com"
              className="common-input"
            />
          </div>
        </div>
      </div>

      <div className="form-group">
        <label>Resources</label>
        <div className="resource-fields">
          <div className="resource-field">
            <label htmlFor="agent-icon-url">Icon URL</label>
            <input
              id="agent-icon-url"
              type="url"
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder="https://example.com/icon.png"
              className="common-input"
            />
          </div>
          <div className="resource-field">
            <label htmlFor="agent-documentation-url">Documentation URL</label>
            <input
              id="agent-documentation-url"
              type="url"
              value={documentationUrl}
              onChange={(e) => setDocumentationUrl(e.target.value)}
              placeholder="https://example.com/docs"
              className="common-input"
            />
          </div>
        </div>
      </div>

      <hr className="form-separator" />

      <div className="form-group">
        <label>Agent Mode</label>
        <div className="agent-mode-selector">
          <button
            className={`mode-button ${agentMode === 'interactive' ? 'active' : ''}`}
            onClick={() => setAgentMode('interactive')}
          >
            Interactive
          </button>
          <button
            className={`mode-button ${agentMode === 'autonomous' ? 'active' : ''}`}
            onClick={() => setAgentMode('autonomous')}
          >
            Autonomous
          </button>
        </div>
        <div className="agent-mode-description">
          {agentMode === 'interactive' 
            ? 'Interactive chat session with history, supports user interaction (clarifying questions, tool use permission)'
            : 'Autonomous agent without chat session history or user interaction, provides direct answers to calling agent'
          }
        </div>
      </div>

      {/* Skills Section - Only show in autonomous mode */}
      {agentMode === 'autonomous' && (
        <div className="form-group">
          <label>Skills</label>
          <div className="skills-list">
            {metadata?.skills && metadata.skills.length > 0 ? (
              metadata.skills.map(skill => (
                <div key={skill.id} className="skill-item">
                  <div className="skill-info">
                    <div className="skill-name">{skill.name}</div>
                    <div className="skill-description">{skill.description}</div>
                    {skill.tags && skill.tags.length > 0 && (
                      <div className="skill-tags">
                        {skill.tags.map((tag, index) => (
                          <span key={index} className="skill-tag">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="skill-actions">
                    <button 
                      onClick={() => handleEditSkill(skill)} 
                      className="btn btn-secondary"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDeleteSkill(skill.id)} 
                      className="btn btn-danger"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-skills">No skills defined</div>
            )}
            <button onClick={handleAddSkill} className="btn add-button">Add Skill</button>
          </div>
        </div>
      )}

      <div className="settings-actions">
        <button 
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Agent Info'}
        </button>
        {hasChanges && (
          <button 
            className="btn btn-secondary"
            onClick={() => {
              if (originalMetadata) {
                setMetadata(JSON.parse(JSON.stringify(originalMetadata))); // Reset to original
                setName(originalMetadata.name);
                setDescription(originalMetadata.description || '');
                setVersion(originalMetadata.version || '');
                setIconUrl(originalMetadata.iconUrl || '');
                setDocumentationUrl(originalMetadata.documentationUrl || '');
                setProviderOrg(originalMetadata.provider?.organization || '');
                setProviderUrl(originalMetadata.provider?.url || '');
                setAgentMode(originalMetadata.skills && Array.isArray(originalMetadata.skills) ? 'autonomous' : 'interactive');
              }
              setError(null);
              setSuccess(null);
              setIsEditingSkill(false);
              setEditingSkill(undefined);
            }}
            disabled={isSaving}
          >
            Cancel Changes
          </button>
        )}
      </div>
    </div>
  );
};

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
      case 'agent-info':
        return <AgentInfoSection />;
      case 'about':
        return (
          <AboutView
            title="About Settings"
            description={
              <div>
                <p>
                  This tab allows you to configure various settings for your agent.
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
            className={`tab-items-item ${activeSection === 'agent-info' ? 'selected' : ''}`}
            onClick={() => setActiveSection('agent-info')}
          >
            <span>Agent Info</span>
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