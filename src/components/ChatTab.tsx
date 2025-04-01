import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChatAPI } from '../api/ChatAPI';
import { LLMType } from '../llm/types';
import remarkGfm from 'remark-gfm';
import { TabProps } from '../types/TabProps';
import { RendererChatMessage } from '../types/ChatMessage';
import { ModelReply } from '../types/ModelReply';
import log from 'electron-log';

// Add ChatState interface back
interface ChatState {
  messages: (RendererChatMessage & { modelReply?: ModelReply })[];
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
  const [isInitialized, setIsInitialized] = useState(false);
  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    selectedModel: LLMType.Test
  });
  const [inputValue, setInputValue] = useState('');
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());

  useEffect(() => {
    const initModel = async () => {
      try {
        // First create the chat session with initial welcome message
        await window.api.createChatTab(id);
        // Then initialize the ChatAPI
        chatApiRef.current = new ChatAPI(id);
        // Then get its state
        const state = await window.api.getChatState(id);
        setChatState((prev: ChatState) => ({ 
          ...prev, 
          selectedModel: state.currentModel,
          messages: state.messages.map(msg => ({
            type: msg.role === 'assistant' ? 'ai' : msg.role,
            content: msg.role === 'assistant' ? '' : msg.content,
            modelReply: msg.role === 'assistant' ? msg.modelReply : undefined
          }))
        }));
        setIsInitialized(true);
      } catch (error) {
        log.error('Error initializing chat tab:', error);
      }
    };
    initModel();
  }, [id]);

  // Add cleanup when component unmounts
  useEffect(() => {
    return () => {
      // Clean up the chat session when the tab is closed
      window.api.closeChatTab(id).catch(error => {
        log.error('Error closing chat tab:', error);
      });
    };
  }, [id]);

  // Handle manual scrolling
  const handleScroll = () => {
    if (chatContainerRef.current) {
      const newPosition = chatContainerRef.current.scrollTop;
      log.info(`Manual scroll in tab ${id}, saving position:`, newPosition);
      setScrollPosition(newPosition);
    }
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      if (isFirstRenderRef.current) {
        // On first render, scroll to bottom
        log.info(`First render for tab ${id}, scrolling to bottom`);
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        isFirstRenderRef.current = false;
      } else if (chatState.messages.length > lastMessageCountRef.current) {
        // If new messages, scroll to bottom
        log.info(`New messages in tab ${id}, scrolling to bottom`);
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
        log.info(`Restoring scroll position for tab ${id} to:`, scrollPosition);
        if (scrollPosition > 0) {
          chatContainerRef.current.scrollTop = scrollPosition;
          log.info(`After restore, actual scroll position is:`, chatContainerRef.current.scrollTop);
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

    try {
      const response = await chatApiRef.current!.sendMessage(inputValue);
      setChatState({
        messages: chatApiRef.current!.getMessages(),
        selectedModel: chatApiRef.current!.getCurrentModel()
      });
    } catch (error) {
      log.error('Failed to get response:', error);
    }
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '38px';
    }
  };

  const handleModelChange = async (model: LLMType) => {
    try {
      log.info('Switching to model:', model);
      const success = await chatApiRef.current!.switchModel(model);
      setChatState((prev: ChatState) => ({
        ...prev,
        selectedModel: success ? model : prev.selectedModel,
        messages: chatApiRef.current!.getMessages()
      }));
      log.info('Successfully switched to model:', model);
    } catch (error) {
      // Revert the model selection
      setChatState((prev: ChatState) => ({
        ...prev,
        selectedModel: prev.selectedModel,
        messages: chatApiRef.current!.getMessages()
      }));
      log.error('Error switching model:', error);
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

  const toggleToolCall = (messageIndex: number, turnIndex: number, toolIndex: number) => {
    const key = `${messageIndex}-${turnIndex}-${toolIndex}`;
    setExpandedToolCalls(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
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
        {chatState.messages.map((msg: RendererChatMessage & { modelReply?: ModelReply }, msgIdx: number) => (
          <div 
            key={msgIdx} 
            className={`message ${msg.type}`}
          >
            <div style={{ display: 'inline' }}>
              <strong>{msg.type.toUpperCase()}:</strong>{' '}
              {msg.type === 'ai' ? (
                <>
                  {msg.modelReply && (
                    <div className="llm-reply-turns">
                      {msg.modelReply.turns.map((turn, turnIdx) => (
                        <div key={turnIdx} className="turn">
                          {turn.message && (
                            <div className="turn-message">
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
                                  p: ({children}) => (
                                    <span style={{
                                      whiteSpace: 'pre-wrap',
                                    }}>
                                      {children}
                                    </span>
                                  )
                                }}
                              >
                                {turn.message}
                              </ReactMarkdown>
                            </div>
                          )}
                          {turn.toolCalls && turn.toolCalls.map((toolCall, toolIdx) => {
                            const key = `${msgIdx}-${turnIdx}-${toolIdx}`;
                            const isExpanded = expandedToolCalls.has(key);
                            return (
                              <div key={toolIdx} className="tool-call">
                                <div 
                                  className={`tool-call-header ${isExpanded ? 'expanded' : ''}`}
                                  onClick={() => toggleToolCall(msgIdx, turnIdx, toolIdx)}
                                >
                                  <span className="tool-call-name">Tool Call: {toolCall.serverName}.{toolCall.toolName} ({toolCall.elapsedTimeMs.toFixed(3)}ms)</span>
                                </div>
                                {isExpanded && (
                                  <div className="tool-call-details">
                                    <div>Arguments:</div>
                                    <pre>{JSON.stringify(toolCall.args, null, 2)}</pre>
                                    <div>Result:</div>
                                    <div className="tool-call-output">
                                      {toolCall.output}
                                    </div>
                                    {toolCall.error && (
                                      <div className="tool-call-error">
                                        <strong>Error:</strong> {toolCall.error}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {turn.error && (
                            <div className="turn-error">
                              <strong>Error:</strong> {turn.error}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                msg.content
              )}
            </div>
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