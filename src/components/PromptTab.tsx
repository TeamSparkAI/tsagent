import React, { useState, useEffect, useRef } from 'react';
import { TabProps } from '../types/TabProps';

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
      setPrompt(loadedPrompt);
      setOriginalPrompt(loadedPrompt);
      // Adjust initial height after content is loaded
      if (textareaRef.current) {
        adjustTextareaHeight(textareaRef.current);
      }
    });
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
        onContextMenu={(e) => e.stopPropagation()}
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