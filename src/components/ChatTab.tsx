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

export const ChatTab: React.FC<ChatTabProps> = ({ id, activeTabId }) => {
  const chatApiRef = useRef<ChatAPI | null>(null);
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

  return (
    <div className="chat-tab">
      <div id="model-container">
        <label htmlFor="model-select">Model:</label>
        <select
          id="model-select"
          value={chatState.selectedModel}
          onChange={async (e) => {
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
          }}
        >
          <option value={LLMType.Test}>Test LLM</option>
          <option value={LLMType.Gemini}>Gemini</option>
          <option value={LLMType.Claude}>Claude</option>
          <option value={LLMType.OpenAI}>OpenAI</option>
        </select>
      </div>
      
      <div id="chat-container">
        {chatState.messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.type}`}>
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
        />
        <button id="send-button" onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
};