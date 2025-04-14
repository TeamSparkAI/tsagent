import React, { useState, useEffect, useRef } from 'react';
import { TabProps } from '../types/TabProps';
import log from 'electron-log';

export const PromptTab: React.FC<TabProps> = ({ id, activeTabId, name, type, style }) => {
  const [prompt, setPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [isSaving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';  // Reset height to recalculate
    element.style.height = `${element.scrollHeight}px`;
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    adjustTextareaHeight(e.target);
  };

  // Adjust height when tab becomes active
  useEffect(() => {
    if (id === activeTabId && textareaRef.current) {
      adjustTextareaHeight(textareaRef.current);
    }
  }, [id, activeTabId]);

  useEffect(() => {
    // Load initial prompt
    window.api.getSystemPrompt().then((loadedPrompt: string) => {
      log.info(`[PROMPT TAB] Initial prompt loaded: ${loadedPrompt.substring(0, 50)}...`);
      setPrompt(loadedPrompt);
      setOriginalPrompt(loadedPrompt);
      // Adjust initial height after content is loaded
      if (textareaRef.current) {
        adjustTextareaHeight(textareaRef.current);
      }
    }).catch(error => {
      log.error(`[PROMPT TAB] Error loading initial prompt:`, error);
    });

    // Listen for workspace changes
    const handleWorkspaceSwitched = async (data: { windowId: string, workspacePath: string, targetWindowId: string }) => {   
      const currentWindowId = await window.api.getCurrentWindowId();
      log.info(`[PROMPT TAB] Received workspace:switched, current window ID: ${currentWindowId}, target window ID: ${data.targetWindowId}`);
        
      // Only update the UI if this event is targeted at the current window
      if (currentWindowId === data.targetWindowId) {
        log.info('[PROMPT TAB] Event is targeted at this window, refreshing prompt');
        try {
          const loadedPrompt = await window.api.getSystemPrompt();
          log.info(`[PROMPT TAB] Loaded new system prompt after workspace switch: ${loadedPrompt.substring(0, 50)}...`);
          setPrompt(loadedPrompt);
          setOriginalPrompt(loadedPrompt);
          if (textareaRef.current) {
            adjustTextareaHeight(textareaRef.current);
          }
        } catch (error) {
          log.error(`[PROMPT TAB] Error loading prompt after workspace switch:`, error);
        }
      }
    };

    // Use the API method instead of DOM event listener
    log.info('[PROMPT TAB] Setting up workspace:switched event listener');
    const listener = window.api.onWorkspaceSwitched(handleWorkspaceSwitched);
    log.info('[PROMPT TAB] Workspace:switched event listener set up');

    // Clean up the API event listener
    return () => {
      log.info('[PROMPT TAB] Cleaning up workspace:switched event listener');
      if (listener) {
        window.api.offWorkspaceSwitched(listener);
        log.info('[PROMPT TAB] Successfully removed workspace:switched listener');
      }
    };
  }, []);

  if (id !== activeTabId) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.api.saveSystemPrompt(prompt);
      setOriginalPrompt(prompt);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="prompt-tab">
      <h2>System Prompt</h2>
      <p className="prompt-description">
        This prompt defines the AI assistant's behavior and capabilities across all chat sessions.
      </p>
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={handleTextareaChange}
        placeholder="Enter system prompt..."
      />
      <div className="button-container">
        <button 
          onClick={handleSave}
          disabled={prompt === originalPrompt || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Prompt'}
        </button>
        {prompt !== originalPrompt && (
          <button 
            onClick={() => setPrompt(originalPrompt)}
            className="secondary"
          >
            Undo Changes
          </button>
        )}
      </div>
    </div>
  );
}; 