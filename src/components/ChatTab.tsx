import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChatAPI } from '../api/ChatAPI';
import { LLMType } from '../llm/types';
import remarkGfm from 'remark-gfm';
import { TabProps } from '../types/TabProps';

// Put ChatMessage interface back in this file where it was originally
interface ChatMessage {
  type: string;
  content: string;
}

interface ChatState {
  messages: ChatMessage[];
  selectedModel: LLMType;
}

// Handle external links safely
const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault();
  const href = e.currentTarget.href;
  if (href) {
    window.api.openExternal(href);
  }
};

export const ChatTab: React.FC<TabProps> = ({ id, activeTabId, name, type, style }) => {
  const chatApiRef = useRef<ChatAPI | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageCountRef = useRef<number>(1);  // Start with 1 for welcome message
  const isFirstRenderRef = useRef<boolean>(true);
  const [scrollPosition, setScrollPosition] = useState(0);

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
      setChatState(prev => ({ ...prev, selectedModel: model as LLMType }));
      setIsInitialized(true);
    };
    initModel();
  }, [id]);

  // Handle manual scrolling
  const handleScroll = () => {
    if (chatContainerRef.current) {
      const newPosition = chatContainerRef.current.scrollTop;
      console.log(`Manual scroll in tab ${id}, saving position:`, newPosition);
      setScrollPosition(newPosition);
    }
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      if (isFirstRenderRef.current) {
        // On first render, scroll to bottom
        console.log(`First render for tab ${id}, scrolling to bottom`);
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        isFirstRenderRef.current = false;
      } else if (chatState.messages.length > lastMessageCountRef.current) {
        // If new messages, scroll to bottom
        console.log(`New messages in tab ${id}, scrolling to bottom`);
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
      lastMessageCountRef.current = chatState.messages.length;
    }
  }, [chatState.messages]);

  // Handle scroll position when switching tabs
  useEffect(() => {
    if (chatContainerRef.current) {
      if (id === activeTabId) {
        // When switching to this tab, restore scroll position
        console.log(`Restoring scroll position for tab ${id} to:`, scrollPosition);
        if (scrollPosition > 0) {
          chatContainerRef.current.scrollTop = scrollPosition;
          console.log(`After restore, actual scroll position is:`, chatContainerRef.current.scrollTop);
        }
      }
    }
  }, [activeTabId, scrollPosition]);

  useEffect(() => {
    if (id === activeTabId && textareaRef.current) {
      adjustTextareaHeight(textareaRef.current);
    }
  }, [activeTabId]);

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
    if (textareaRef.current) {
      textareaRef.current.style.height = '38px';
    }
  };

  const handleModelChange = async (model: LLMType) => {
    const success = await chatApi.switchModel(model);
    if (success) {
      setChatState(prev => ({
        ...prev,
        selectedModel: model,
        messages: [...prev.messages, { type: 'system', content: `Switched to ${model} model` }]
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

  const adjustTextareaHeight = (element: HTMLTextAreaElement) => {
    // Get computed styles
    const style = window.getComputedStyle(element);
    const lineHeight = parseFloat(style.lineHeight);
    const paddingTop = parseFloat(style.paddingTop);
    const paddingBottom = parseFloat(style.paddingBottom);
    const borderTop = parseFloat(style.borderTopWidth);
    const borderBottom = parseFloat(style.borderBottomWidth);

    // Reset height to auto to get proper scrollHeight
    element.style.height = 'auto';

    // Calculate exact height needed for content
    const contentHeight = element.scrollHeight - paddingTop - paddingBottom - borderTop - borderBottom;
    const rows = Math.ceil(contentHeight / lineHeight);
    const exactHeight = (rows * lineHeight) + paddingTop + paddingBottom + borderTop + borderBottom;

    element.style.height = `${Math.min(exactHeight, 200)}px`;
    
    // Keep scrolled to bottom when at max height
    if (exactHeight > 200) {
      element.scrollTop = element.scrollHeight;
    }
  };

  return (
    <div className="chat-tab">
      <div id="model-container">
        <label htmlFor="model-select">Model:</label>
        <select
          id="model-select"
          value={chatState.selectedModel}
          onChange={(e) => handleModelChange(e.target.value as LLMType)}
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
        onScroll={handleScroll}
      >
        {chatState.messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`message ${msg.type}`}
          >
            <strong>{msg.type.toUpperCase()}:</strong>{' '}
            {msg.type === 'ai' ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ node, ...props }) => (
                    <a 
                      {...props} 
                      onClick={handleLinkClick}
                      style={{ color: '#007bff', cursor: 'pointer' }}
                    />
                  ),
                  p: ({children}) => <p style={{whiteSpace: 'pre-wrap'}}>{children}</p>
                }}
              >
                {msg.content}
              </ReactMarkdown>
            ) : (
              msg.content
            )}
          </div>
        ))}
      </div>
      
      <div className="input-container">
        <textarea
          ref={textareaRef}
          id="message-input"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            adjustTextareaHeight(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Type your message..."
          onContextMenu={(e) => e.stopPropagation()}
          rows={1}
        />
        <button id="send-button" onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
};