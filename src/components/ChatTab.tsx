import React, { useState, useRef, useEffect } from 'react';
import { ChatAPI } from '../api/ChatAPI';
import { LLMType } from '../llm/types';

interface ChatTabProps {
  id: string;
  activeTabId: string | null;
  name: string;
  type: string;
}

interface ChatMessage {
  type: string;
  content: string;
}

interface ChatState {
  messages: ChatMessage[];
  selectedModel: LLMType;
}

export const ChatTab: React.FC<ChatTabProps> = ({ id, activeTabId, name, type }) => {
  const chatApiRef = useRef<ChatAPI | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  if (!chatApiRef.current) {
    chatApiRef.current = new ChatAPI(id);
  }
  const chatApi = chatApiRef.current;

  const [isInitialized, setIsInitialized] = useState(false);
  const [chatState, setChatState] = useState<ChatState>({
    messages: [{ type: 'system', content: 'Welcome to TeamSpark AI Workbench!' }],
    selectedModel: LLMType.Test
  });
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    const initModel = async () => {
      const model = await window.api._getCurrentModel(id);
      setChatState(prev => ({ ...prev, selectedModel: model }));
      setIsInitialized(true);
    };
    initModel();
  }, [id]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatState.messages]);

  if (!isInitialized) return null;
  if (id !== activeTabId) return null;

  const sendMessage = async () => {
    if (!inputValue.trim()) return;

    setChatState(prev => ({
      ...prev,
      messages: [...prev.messages, { type: 'user', content: inputValue }]
    }));

    try {
      const response = await chatApi.sendMessage(inputValue);
      setChatState(prev => ({
        ...prev,
        messages: [...prev.messages, { type: 'ai', content: response }]
      }));
    } catch (error) {
      setChatState(prev => ({
        ...prev,
        messages: [...prev.messages, { type: 'error', content: 'Failed to get response' }]
      }));
    }
    setInputValue('');
  };

  const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelType = e.target.value as LLMType;
    const success = await chatApi.switchModel(modelType);
    if (success) {
      setChatState(prev => ({
        ...prev,
        selectedModel: modelType,
        messages: [...prev.messages, { type: 'system', content: `Switched to ${modelType} model` }]
      }));
    } else {
      setChatState(prev => ({
        ...prev,
        messages: [...prev.messages, { type: 'error', content: 'Failed to switch model' }]
      }));
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // Get clicked element
    const element = e.target as HTMLElement;
    
    // Only handle context menu if we're in the chat container
    if (element.closest('#chat-container')) {
      const selection = window.getSelection();
      const hasSelection = !!selection?.toString().length;
      window.api.showChatMenu(hasSelection, e.clientX, e.clientY);
    }
  };

  return (
    <div className="chat-tab">
      <div id="model-container">
        <label htmlFor="model-select">Model:</label>
        <select
          id="model-select"
          value={chatState.selectedModel}
          onChange={handleModelChange}
          onContextMenu={(e) => e.stopPropagation()}
        >
          <option value={LLMType.Test}>Test LLM</option>
          <option value={LLMType.Gemini}>Gemini</option>
          <option value={LLMType.Claude}>Claude</option>
          <option value={LLMType.OpenAI}>OpenAI</option>
        </select>
      </div>
      
      <div id="chat-container" 
        ref={chatContainerRef}
        onContextMenu={handleContextMenu}
      >
        {chatState.messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`message ${msg.type}`}
          >
            <strong>{msg.type.toUpperCase()}:</strong> {msg.content}
          </div>
        ))}
      </div>
      
      <div className="input-container">
        <input
          type="text"
          id="message-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type your message..."
          onContextMenu={(e) => e.stopPropagation()}
        />
        <button id="send-button" onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
};