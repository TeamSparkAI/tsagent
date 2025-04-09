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
  const [isLoading, setIsLoading] = useState(false);
  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    selectedModel: LLMType.Test
  });
  const [inputValue, setInputValue] = useState('');
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());
  const [activeReferences, setActiveReferences] = useState<string[]>([]);
  const [activeRules, setActiveRules] = useState<string[]>([]);
  const [availableReferences, setAvailableReferences] = useState<{name: string, description: string}[]>([]);
  const [availableRules, setAvailableRules] = useState<{name: string, description: string}[]>([]);
  const [showContextPanel, setShowContextPanel] = useState(false);

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
        
        // Load context data
        if (chatApiRef.current) {
          const refs = await chatApiRef.current.getActiveReferences();
          const rules = await chatApiRef.current.getActiveRules();
          setActiveReferences(refs);
          setActiveRules(rules);
        }
        
        setIsInitialized(true);
      } catch (error) {
        log.error('Error initializing chat tab:', error);
      }
    };
    initModel();

    // Load available references and rules for context panel
    const loadAvailableContext = async () => {
      try {
        const refs = await window.api.getReferences();
        const rules = await window.api.getRules();
        setAvailableReferences(refs.map(ref => ({ name: ref.name, description: ref.description })));
        setAvailableRules(rules.map(rule => ({ name: rule.name, description: rule.description })));
      } catch (error) {
        log.error('Error loading available context:', error);
      }
    };
    loadAvailableContext();

    // Listen for reference and rule changes
    const refsListener = window.api.onReferencesChanged(() => {
      loadAvailableContext();
    });
    const rulesListener = window.api.onRulesChanged(() => {
      loadAvailableContext();
    });
    
    return () => {
      window.api.offReferencesChanged(refsListener);
      window.api.offRulesChanged(rulesListener);
      
      // Clean up the chat session when the tab is closed
      window.api.closeChatTab(id).catch(error => {
        log.error('Error closing chat tab:', error);
      });
    };
  }, [id]);

  // Reset on workspace change
  useEffect(() => {
    log.info('[CHAT TAB] Setting up workspace:switched event listener');
    
    const handleWorkspaceSwitched = () => {
      log.info(`[CHAT TAB] Workspace switched, resetting tab ${id}`);
      // Reset state
      setIsInitialized(false);
      setChatState({
        selectedModel: LLMType.Test,
        messages: []
      });
      chatApiRef.current = null;
      isFirstRenderRef.current = true;
      lastMessageCountRef.current = 0;
      setScrollPosition(0);
    };
    
    const listener = window.api.onWorkspaceSwitched(handleWorkspaceSwitched);
    
    return () => {
      if (listener) {
        window.api.offWorkspaceSwitched(listener);
        log.info('[CHAT TAB] Removed workspace:switched listener');
      }
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
    if (!inputValue.trim() || isLoading) return;

    try {
      setIsLoading(true);
      setInputValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '38px';
      }
      
      const response = await chatApiRef.current!.sendMessage(inputValue);
      setChatState({
        messages: chatApiRef.current!.getMessages(),
        selectedModel: chatApiRef.current!.getCurrentModel()
      });
      
      // Refresh the context to show any changes made during message processing
      if (chatApiRef.current) {
        const refs = await chatApiRef.current.getActiveReferences();
        const rules = await chatApiRef.current.getActiveRules();
        setActiveReferences(refs);
        setActiveRules(rules);
      }
    } catch (error) {
      log.error('Failed to get response:', error);
    } finally {
      setIsLoading(false);
      
      // Use setTimeout to ensure the DOM has been updated before focusing
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.disabled = false;  // Explicitly enable the textarea
          textareaRef.current.focus();
        }
      }, 0);
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

  const toggleContextPanel = () => {
    setShowContextPanel(prev => !prev);
  };

  const addReference = async (referenceName: string) => {
    if (chatApiRef.current) {
      const success = await chatApiRef.current.addReference(referenceName);
      if (success) {
        const refs = await chatApiRef.current.getActiveReferences();
        setActiveReferences(refs);
      }
    }
  };

  const removeReference = async (referenceName: string) => {
    if (chatApiRef.current) {
      const success = await chatApiRef.current.removeReference(referenceName);
      if (success) {
        const refs = await chatApiRef.current.getActiveReferences();
        setActiveReferences(refs);
      }
    }
  };

  const addRule = async (ruleName: string) => {
    if (chatApiRef.current) {
      const success = await chatApiRef.current.addRule(ruleName);
      if (success) {
        const rules = await chatApiRef.current.getActiveRules();
        setActiveRules(rules);
      }
    }
  };

  const removeRule = async (ruleName: string) => {
    if (chatApiRef.current) {
      const success = await chatApiRef.current.removeRule(ruleName);
      if (success) {
        const rules = await chatApiRef.current.getActiveRules();
        setActiveRules(rules);
      }
    }
  };

  return (
    <div className="chat-tab">
      <style>
        {`
          #context-button {
            margin-left: 10px;
            padding: 5px 10px;
            background-color: #f0f0f0;
            border: 1px solid #ccc;
            border-radius: 4px;
            cursor: pointer;
          }
          
          #context-button.active {
            background-color: #e0e0e0;
            border-color: #999;
          }
          
          #context-panel {
            margin: 5px 0;
            padding: 10px;
            background-color: #f9f9f9;
            border: 1px solid #ccc;
            border-radius: 4px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-gap: 10px;
            max-height: 300px;
            overflow-y: auto;
          }
          
          .context-section {
            padding: 5px;
          }
          
          .context-section h3 {
            margin-top: 0;
            margin-bottom: 8px;
            font-size: 14px;
            color: #333;
          }
          
          .context-list {
            list-style: none;
            padding: 0;
            margin: 0;
            max-height: 200px;
            overflow-y: auto;
          }
          
          .context-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 5px 0;
            border-bottom: 1px solid #eee;
          }
          
          .context-item span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          
          .add-button, .remove-button {
            cursor: pointer;
            padding: 2px 6px;
            border: none;
            border-radius: 3px;
            margin-left: 5px;
            font-size: 12px;
          }
          
          .add-button {
            background-color: #e8f4f8;
            color: #2c7be5;
          }
          
          .remove-button {
            background-color: #feeeee;
            color: #e63757;
          }
          
          .input-container {
            position: relative;
            display: flex;
            margin-top: 10px;
          }
          
          .loading-indicator {
            position: absolute;
            top: -20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 3px 10px;
            border-radius: 10px;
            font-size: 12px;
            animation: pulse 1.5s infinite;
          }
          
          @keyframes pulse {
            0% { opacity: 0.7; }
            50% { opacity: 1; }
            100% { opacity: 0.7; }
          }
          
          #send-button {
            opacity: 1;
            transition: opacity 0.2s;
          }
          
          #send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        `}
      </style>
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
          <option value={LLMType.Ollama}>Ollama</option>
        </select>
        <button 
          id="context-button" 
          onClick={toggleContextPanel} 
          className={showContextPanel ? 'active' : ''}
        >
          Context
        </button>
      </div>
      
      {showContextPanel && (
        <div id="context-panel">
          <div className="context-section">
            <h3>Active References</h3>
            {activeReferences.length === 0 && <p>No active references</p>}
            <ul className="context-list">
              {activeReferences.map(ref => (
                <li key={ref} className="context-item">
                  <span>{ref}</span>
                  <button className="remove-button" onClick={() => removeReference(ref)}>Remove</button>
                </li>
              ))}
            </ul>
          </div>
          
          <div className="context-section">
            <h3>Active Rules</h3>
            {activeRules.length === 0 && <p>No active rules</p>}
            <ul className="context-list">
              {activeRules.map(rule => (
                <li key={rule} className="context-item">
                  <span>{rule}</span>
                  <button className="remove-button" onClick={() => removeRule(rule)}>Remove</button>
                </li>
              ))}
            </ul>
          </div>
          
          <div className="context-section">
            <h3>Available References</h3>
            {availableReferences.filter(ref => !activeReferences.includes(ref.name)).length === 0 && <p>No references available</p>}
            <ul className="context-list">
              {availableReferences.filter(ref => !activeReferences.includes(ref.name)).map(ref => (
                <li key={ref.name} className="context-item">
                  <span title={ref.description}>{ref.name}</span>
                  <button className="add-button" onClick={() => addReference(ref.name)}>Add</button>
                </li>
              ))}
            </ul>
          </div>
          
          <div className="context-section">
            <h3>Available Rules</h3>
            {availableRules.filter(rule => !activeRules.includes(rule.name)).length === 0 && <p>No rules available</p>}
            <ul className="context-list">
              {availableRules.filter(rule => !activeRules.includes(rule.name)).map(rule => (
                <li key={rule.name} className="context-item">
                  <span title={rule.description}>{rule.name}</span>
                  <button className="add-button" onClick={() => addRule(rule.name)}>Add</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      
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
        {isLoading && <div className="loading-indicator">Waiting for response...</div>}
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
          disabled={isLoading}
        />
        <button id="send-button" onClick={sendMessage} disabled={isLoading || !inputValue.trim()}>
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};