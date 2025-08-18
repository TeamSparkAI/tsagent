import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChatAPI } from '../api/ChatAPI';
import { ProviderType } from 'agent-api';
import remarkGfm from 'remark-gfm';
import { TabProps } from '../types/TabProps';
import { RendererChatMessage } from '../types/ChatMessage';
import { ModelReply, Turn, ToolCallResult, ToolCallRequest } from 'agent-api';
import log from 'electron-log';
import { ModelPickerPanel } from './ModelPickerPanel';
import type { ProviderModel as ILLMModel } from 'agent-api';
import { SETTINGS_DEFAULT_MAX_CHAT_TURNS, SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS, SETTINGS_KEY_MOST_RECENT_MODEL, SETTINGS_DEFAULT_TEMPERATURE, SETTINGS_DEFAULT_TOP_P, SESSION_TOOL_PERMISSION_TOOL, SESSION_TOOL_PERMISSION_ALWAYS, SESSION_TOOL_PERMISSION_NEVER, SessionToolPermission } from 'agent-api';
import TestLogo from '../assets/frosty.png';
import OllamaLogo from '../assets/ollama.png';
import OpenAILogo from '../assets/openai.png';
import GeminiLogo from '../assets/gemini.png';
import AnthropicLogo from '../assets/anthropic.png';
import BedrockLogo from '../assets/bedrock.png';
import './ChatTab.css';
import { ChatSettingsForm, ChatSettings } from './ChatSettingsForm';
import { ChatState } from 'agent-api';
import { TOOL_CALL_DECISION_ALLOW_SESSION, TOOL_CALL_DECISION_ALLOW_ONCE, TOOL_CALL_DECISION_DENY, ToolCallDecision } from 'agent-api';

interface ClientChatState {
  messages: (RendererChatMessage & { modelReply?: ModelReply })[];
  selectedModel?: ProviderType;
  selectedModelName?: string;
  currentModelId?: string;
  references?: string[];
  rules?: string[];
  pendingToolCalls?: ToolCallRequest[];
}

// Handle external links safely
const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault();
  const href = e.currentTarget.href;
  if (href) {
    window.api.openExternal(href);
  }
};

// Map each provider to its logo
  const providerLogos: Record<ProviderType, any> = {
  [ProviderType.Test]: TestLogo,
  [ProviderType.Ollama]: OllamaLogo,
  [ProviderType.OpenAI]: OpenAILogo,
  [ProviderType.Gemini]: GeminiLogo,
  [ProviderType.Claude]: AnthropicLogo,
  [ProviderType.Bedrock]: BedrockLogo,
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
  const [isPendingDisposition, setIsPendingDisposition] = useState(false);
  const [pendingDispositions, setPendingDispositions] = useState<Map<string, ToolCallDecision>>(new Map());
  const [chatState, setChatState] = useState<ClientChatState>({
    messages: []
  });
  const [inputValue, setInputValue] = useState('');
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());
  const [activeReferences, setActiveReferences] = useState<string[]>([]);
  const [activeRules, setActiveRules] = useState<string[]>([]);
  const [availableReferences, setAvailableReferences] = useState<{name: string, description: string, priorityLevel: number}[]>([]);
  const [availableRules, setAvailableRules] = useState<{name: string, description: string, priorityLevel: number}[]>([]);
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [showModelPickerPanel, setShowModelPickerPanel] = useState<boolean>(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [models, setModels] = useState<ILLMModel[]>([]);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [isNewSession, setIsNewSession] = useState(true);
  const [chatSettings, setChatSettings] = useState<ChatSettings>({
    maxChatTurns: SETTINGS_DEFAULT_MAX_CHAT_TURNS,
    maxOutputTokens: SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: SETTINGS_DEFAULT_TEMPERATURE,
    topP: SETTINGS_DEFAULT_TOP_P,
    toolPermission: SESSION_TOOL_PERMISSION_TOOL as SessionToolPermission
  });

  // Helper to find the disposition for a tool call by looking at the previous message
  const findToolCallDisposition = (toolCallId: string, messageIndex: number): ToolCallDecision | undefined => {
    log.info(`[findToolCallDisposition] Looking for disposition of toolCallId: ${toolCallId} at message index: ${messageIndex}`);
    
    // First check pending dispositions
    const pending = pendingDispositions.get(toolCallId);
    if (pending) {
      log.info(`[findToolCallDisposition] Found pending disposition: ${pending}`);
      return pending;
    }

    // Look at the previous message in the chat history
    const prevMessage = chatState.messages[messageIndex - 1];
    log.info(`[findToolCallDisposition] Previous message:`, prevMessage);
    
    if (prevMessage?.type === 'approval' && prevMessage.toolCallApprovals) {
      log.info(`[findToolCallDisposition] Found approval message with toolCallApprovals:`, prevMessage.toolCallApprovals);
      
      // Find the approval for this tool call
      const approval = prevMessage.toolCallApprovals.find(a => a.toolCallId === toolCallId);
      if (approval) {
        log.info(`[findToolCallDisposition] Found approval for toolCallId ${toolCallId}:`, approval);
        return approval.decision;
      } else {
        log.info(`[findToolCallDisposition] No approval found for toolCallId ${toolCallId} in approvals:`, prevMessage.toolCallApprovals);
      }
    } else {
      log.info(`[findToolCallDisposition] Previous message is not an approval message or has no toolCallApprovals`);
    }
    return undefined;
  };

  // Memoize the disposition lookup for each tool call
  const toolCallDispositions = useMemo(() => {
    const dispositions = new Map<string, ToolCallDecision>();
    
    // For each message with pending tool calls
    chatState.messages.forEach((msg, msgIdx) => {
      if (msg.modelReply?.pendingToolCalls) {
        msg.modelReply.pendingToolCalls.forEach(tc => {
          if (tc.toolCallId) {
            const disposition = findToolCallDisposition(tc.toolCallId, msgIdx);
            if (disposition) {
              dispositions.set(tc.toolCallId, disposition);
            }
          }
        });
      }
    });
    
    return dispositions;
  }, [chatState.messages, pendingDispositions]);

  // Derive pending disposition state from the last message
  const hasPendingDispositions = useMemo(() => {
    const lastMessage = chatState.messages[chatState.messages.length - 1];
    if (!lastMessage?.modelReply?.pendingToolCalls) return false;
    
    // Check if any tool call in the last message doesn't have a disposition
    return lastMessage.modelReply.pendingToolCalls.some(tc => 
      tc.toolCallId && !toolCallDispositions.has(tc.toolCallId)
    );
  }, [chatState.messages, toolCallDispositions]);

  // Update pending disposition mode when it changes
  useEffect(() => {
    setIsPendingDisposition(hasPendingDispositions);
  }, [hasPendingDispositions]);

  useEffect(() => {
    // This happens when the tab is first mounted
    if (!chatApiRef.current) {
      log.info(`Tab ${id} is mounted, initializing chat API`);
            
      // Load the chat state
      const initModel = async () => {
        try {
          let modelProvider: ProviderType | undefined = undefined;
          let modelId: string | undefined = undefined;

          // Get installed providers to verify the current model is available
          const installedProviders = await window.api.getInstalledProviders();

          // Attempt to get the most recent model from settings
          const mostRecentModel = await window.api.getSettingsValue(SETTINGS_KEY_MOST_RECENT_MODEL);
          if (mostRecentModel) {
            const colonIndex = mostRecentModel.indexOf(':');
            if (colonIndex !== -1) {
              const provider = mostRecentModel.substring(0, colonIndex);
              const id = mostRecentModel.substring(colonIndex + 1);

              if (installedProviders.includes(provider as ProviderType)) {
                modelProvider = provider as ProviderType;
                modelId = id;
              }
            }
          }

          await window.api.createChatTab(id, modelProvider, modelId);

          // Then initialize the ChatAPI
          chatApiRef.current = new ChatAPI(id);
          if (chatApiRef.current) {
            const state = await window.api.getChatState(id) as ChatState;
            if (!state) {
              log.error(`[CHAT TAB] No chat state found for tab ${id}`);
              return;
            }
            
            // If initial model, try to get actual model name
            let modelName: string | undefined = undefined;
            if (modelId) {
              try {
                const models = await chatApiRef.current.getModels(modelProvider!);
                const selectedModel = models.find((m: any) => m.id === modelId);
                if (selectedModel) {
                  modelName = selectedModel.name;
                } else {
                  // If we can't find the model, use the ID as the name (without modification)
                  modelName = modelId;
                }
              } catch (error) {
                log.error('Failed to get model information:', error);
                // If we can't get model info, use the ID as the name
                modelName = modelId;
              }
            }
            
            const newChatState: ClientChatState = {
              messages: state.messages.map((msg: any) => ({
                type: msg.role === 'assistant' ? 'ai' : msg.role,
                content: msg.role === 'assistant' ? '' : msg.content,
                modelReply: msg.role === 'assistant' ? msg.modelReply : undefined
              })),
              selectedModel: modelProvider,
              selectedModelName: modelName,
              currentModelId: modelId,
              references: state.references || [],
              rules: state.rules || [],
            };

            // Update the chat state
            setChatState(newChatState);
            
            // Update the context data
            setActiveReferences(state.references || []);
            setActiveRules(state.rules || []);

            // Update the chat settings
            setChatSettings({
              maxChatTurns: state.maxChatTurns ?? SETTINGS_DEFAULT_MAX_CHAT_TURNS,
              maxOutputTokens: state.maxOutputTokens ?? SETTINGS_DEFAULT_MAX_OUTPUT_TOKENS,
              temperature: state.temperature ?? SETTINGS_DEFAULT_TEMPERATURE,
              topP: state.topP ?? SETTINGS_DEFAULT_TOP_P,
              toolPermission: (state.toolPermission === SESSION_TOOL_PERMISSION_TOOL || state.toolPermission === SESSION_TOOL_PERMISSION_ALWAYS || state.toolPermission === SESSION_TOOL_PERMISSION_NEVER)
                ? state.toolPermission as SessionToolPermission
                : SESSION_TOOL_PERMISSION_TOOL as SessionToolPermission
            });
            
            setIsInitialized(true);

            // Only show model picker if no model was specified
            setShowModelPickerPanel(!modelProvider);
          }
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
          setAvailableReferences(refs.map(ref => ({ name: ref.name, description: ref.description, priorityLevel: ref.priorityLevel })));
          setAvailableRules(rules.map(rule => ({ name: rule.name, description: rule.description, priorityLevel: rule.priorityLevel })));
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
      
      // Return cleanup function
      return () => {
        window.api.offReferencesChanged(refsListener);
        window.api.offRulesChanged(rulesListener);
        
        // Clean up the chat API reference
        chatApiRef.current = null;
      };
    }
  }, [id]); // Only depend on id, not activeTabId

  // Clean up the chat session when the component unmounts
  useEffect(() => {
    return () => {
      // Clean up the chat session (if any) when the tab is closed
      (async () => {
        if (id) {
          try {
            const chatState = await window.api.getChatState(id);
            if (chatState) {
              await window.api.closeChatTab(id);
            } else {
              log.info(`[CHAT TAB] No chat state found for tab ${id}, skipping cleanup`);
            }
          } catch (error) {
            log.error('Error closing chat tab:', error);
          }
        }
      })();
    };
  }, [id]);

  // Reset on workspace change
  useEffect(() => {
    log.info('[CHAT TAB] Setting up workspace:switched event listener');
    
    const handleWorkspaceSwitched = async (data: { windowId: string, workspacePath: string, targetWindowId: string }) => {   
      const currentWindowId = await window.api.getCurrentWindowId();
      log.info(`[CHAT TAB] Received workspace:switched, current window ID: ${currentWindowId}, target window ID: ${data.targetWindowId}`);
        
      // Only update the UI if this event is targeted at the current window
      if (currentWindowId === data.targetWindowId) {
        // Reset state
        setIsInitialized(false);
        setChatState({
          messages: []
        });
        chatApiRef.current = null;
        isFirstRenderRef.current = true;
        lastMessageCountRef.current = 0;
        setScrollPosition(0);
      }
    };
    
    const listener = window.api.onWorkspaceSwitched(handleWorkspaceSwitched);
    
    return () => {
      if (listener) {
        log.info('[CHAT TAB] Removed workspace:switched listener');
        window.api.offWorkspaceSwitched(listener);
      }
    };
  }, [id]);

  // Handle manual scrolling
  const handleScroll = () => {
    if (chatContainerRef.current) {
      const newPosition = chatContainerRef.current.scrollTop;
      // log.info(`Manual scroll in tab ${id}, saving position:`, newPosition);
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
        // log.info(`Restoring scroll position for tab ${id} to:`, scrollPosition);
        if (scrollPosition > 0) {
          chatContainerRef.current.scrollTop = scrollPosition;
          // log.info(`After restore, actual scroll position is:`, chatContainerRef.current.scrollTop);
        }
      }
    }
  }, [activeTabId, scrollPosition]);

  useEffect(() => {
    if (id === activeTabId && textareaRef.current) {
      adjustTextareaHeight(textareaRef.current);
    }
  }, [activeTabId]);

  // Add effect to handle provider changes
  useEffect(() => {
    const handleProvidersChanged = async () => {
      log.info('[ChatTab] handleProvidersChanged');
      try {
        const installedProviders = await window.api.getInstalledProviders();
        
        // If current provider is no longer installed, clear the model selection
        if (chatState.selectedModel && !installedProviders.includes(chatState.selectedModel)) {          
          // Clear the model in the chat session
          if (chatApiRef.current) {
            log.info('[ChatTab] Clearing model');
            const success = await chatApiRef.current.clearModel();
            if (success) {
              // Get updated messages that include the system message about model change
              const updatedMessages = chatApiRef.current.getMessages();
              
              setChatState(prev => ({
                ...prev,
                selectedModel: undefined,
                selectedModelName: undefined,
                currentModelId: undefined,
                messages: updatedMessages // Update messages to include system message
              }));
              log.info('[ChatTab] Model cleared');
            }
          }
        }
      } catch (error) {
        log.error('Error handling provider changes:', error);
      }
    };

    const listener = window.api.onProvidersChanged(handleProvidersChanged);
    return () => {
      window.api.offProvidersChanged(listener);
    };
  }, [chatState.selectedModel]);

  // Add effect to show model picker when no model is selected
  useEffect(() => {
    if (!chatState.selectedModel) {
      setShowModelPickerPanel(true);
      setShowStatsPanel(false);
      setShowContextPanel(false);
    }
  }, [chatState.selectedModel]);

  // Update textarea disabled state when loading or pending disposition changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.disabled = isLoading || isPendingDisposition;
    }
  }, [isLoading, isPendingDisposition]);

  // Group related messages into a single response
  const groupedMessages = useMemo(() => {
    type MessageGroup = {
      messages: (RendererChatMessage & { modelReply?: ModelReply })[];
    };

    const groups: MessageGroup[] = [];
    let currentGroup: MessageGroup | null = null;

    chatState.messages.forEach((msg, idx) => {
      const prevMsg = idx > 0 ? chatState.messages[idx - 1] : null;

      if (msg.type === 'ai') {
        // If previous message was an approval, continue current group
        if (prevMsg?.type === 'approval' && currentGroup) {
          currentGroup.messages.push(msg);
        } else {
          // Start new group
          if (currentGroup) {
            groups.push(currentGroup);
          }
          currentGroup = {
            messages: [msg]
          };
        }
      } else if (msg.type === 'approval') {
        // Add approval message to current group
        if (currentGroup) {
          currentGroup.messages.push(msg);
        }
      } else {
        // Non-AI, non-approval message
        if (currentGroup) {
          groups.push(currentGroup);
          currentGroup = null;
        }
        groups.push({
          messages: [msg]
        });
      }
    });

    if (currentGroup) {
      groups.push(currentGroup);
    }

    log.info(`[ChatTab] Grouped messages:`, JSON.stringify(groups, null, 2));

    return groups;
  }, [chatState.messages]);

  if (!isInitialized) return null;

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    try {
      setIsLoading(true);
      setInputValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '38px';
      }
      
      const response = await chatApiRef.current!.sendMessage(inputValue);
      setChatState(prev => ({
        messages: chatApiRef.current!.getMessages(),
        selectedModel: chatApiRef.current!.getCurrentModel(),
        selectedModelName: chatApiRef.current!.getCurrentModelName(),
        currentModelId: prev.currentModelId,
        references: prev.references,
        rules: prev.rules
      }));
      
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
          textareaRef.current.focus();
        }
      }, 0);
    }
  };

  const handleModelChange = async (model: ProviderType, modelId: string, modelName?: string) => {
    try {
      if (chatApiRef.current) {
        const success = await chatApiRef.current.switchModel(model, modelId);
        
        if (success) {
          // Get updated messages that include the system message about model change
          const updatedMessages = chatApiRef.current.getMessages();
          
          setChatState(prev => {
            const newState: ClientChatState = {
              messages: updatedMessages,
              selectedModel: model,
              selectedModelName: modelName || prev.selectedModelName,
              currentModelId: modelId || prev.currentModelId,
              references: prev.references,
              rules: prev.rules
            };
            return newState;
          });
          
          // Save the most recent model selection to workspace settings
          const modelValue = modelId ? `${model}:${modelId}` : model;
          await window.api.setSettingsValue(SETTINGS_KEY_MOST_RECENT_MODEL, modelValue);
          
          log.info(`Changed model to ${model} (${modelName || modelId || 'default'})`);
        } else {
          log.error(`Failed to change model to ${model}`);
        }
      }
    } catch (error) {
      log.error('Error changing model:', error);
      setChatState(prev => {
        const newState: ClientChatState = {
          messages: prev.messages,
          selectedModel: prev.selectedModel,
          selectedModelName: prev.selectedModelName,
          currentModelId: prev.currentModelId,
          references: prev.references,
          rules: prev.rules,
        };
        return newState;
      });
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    log.info(`[CHAT TAB] Handling context menu for tab ${id}`);
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

  const toggleToolCall = (groupIdx: number, msgIdx: number, turnIdx: number, toolIdx: number) => {
    const key = `${groupIdx}-${msgIdx}-${turnIdx}-${toolIdx}`;
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
    setShowContextPanel(!showContextPanel);
    setShowStatsPanel(false);
    setShowModelPickerPanel(false);
    setShowSettingsPanel(false);
    log.debug(`Context panel ${!showContextPanel ? 'opened' : 'closed'} for chat tab ${id}`);
  };

  const toggleStatsPanel = () => {
    setShowStatsPanel(!showStatsPanel);
    setShowContextPanel(false);
    setShowModelPickerPanel(false);
    setShowSettingsPanel(false);
    log.debug(`Stats panel ${!showStatsPanel ? 'opened' : 'closed'} for chat tab ${id}`);
  };

  const toggleModelPickerPanel = () => {
    setShowModelPickerPanel(!showModelPickerPanel);
    setShowContextPanel(false);
    setShowStatsPanel(false);
    setShowSettingsPanel(false);
    log.debug(`Model picker panel ${!showModelPickerPanel ? 'opened' : 'closed'} for chat tab ${id}`);
  };

  const toggleSettingsPanel = () => {
    setShowSettingsPanel(!showSettingsPanel);
    setShowContextPanel(false);
    setShowStatsPanel(false);
    setShowModelPickerPanel(false);
    log.debug(`Settings panel ${!showSettingsPanel ? 'opened' : 'closed'} for chat tab ${id}`);
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

  const handleSettingsChange = async (newSettings: typeof chatSettings) => {
    setChatSettings(newSettings);
    if (chatApiRef.current) {
      await chatApiRef.current.updateSettings(newSettings);
      log.info('Chat settings updated');
    }
  };

  const handleToolCallApproval = async (toolCall: ToolCallRequest, decision: string) => {
    if (!chatApiRef.current || !toolCall.toolCallId) return;

    log.info(`[ChatTab] Handling tool call approval for ${toolCall.serverName}.${toolCall.toolName} with decision: ${decision}`);

    let toolCallDecision: ToolCallDecision;
    if (decision === 'allow-session') {
      toolCallDecision = TOOL_CALL_DECISION_ALLOW_SESSION;
    } else if (decision === 'allow-once') {
      toolCallDecision = TOOL_CALL_DECISION_ALLOW_ONCE;
    } else {
      toolCallDecision = TOOL_CALL_DECISION_DENY;
    }

    // Add the new disposition to pending dispositions
    setPendingDispositions(prev => {
      const next = new Map(prev);
      next.set(toolCall.toolCallId!, toolCallDecision);
      return next;
    });

    // Find the message containing this tool call
    const messageWithToolCall = chatState.messages.find(msg => 
      msg.modelReply?.pendingToolCalls?.some(tc => tc.toolCallId === toolCall.toolCallId)
    );

    if (!messageWithToolCall?.modelReply?.pendingToolCalls) {
      log.error('[ChatTab] Could not find message containing tool call');
      return;
    }

    // Get current dispositions for this message
    const currentDispositions = new Map<string, { toolCall: ToolCallRequest, decision: ToolCallDecision }>();
    
    // Add existing dispositions from message history and pending dispositions
    messageWithToolCall.modelReply.pendingToolCalls.forEach(tc => {
      if (tc.toolCallId) {
        const disposition = toolCallDispositions.get(tc.toolCallId);
        if (disposition) {
          currentDispositions.set(tc.toolCallId, { toolCall: tc, decision: disposition });
        }
      }
    });

    // Add the new disposition
    currentDispositions.set(toolCall.toolCallId, { toolCall, decision: toolCallDecision });

    // Check if all tool calls in this message have been dispositioned
    const allToolCallsInMessage = messageWithToolCall.modelReply.pendingToolCalls;
    const allDispositioned = allToolCallsInMessage.every(tc => 
      tc.toolCallId && currentDispositions.has(tc.toolCallId)
    );

    log.info(`[ChatTab] All tool calls in message dispositioned: ${allDispositioned}`);
    log.info(`[ChatTab] Current dispositions:`, Array.from(currentDispositions.entries()));
    log.info(`[ChatTab] Tool calls in message:`, allToolCallsInMessage);
    log.info(`[ChatTab] Tool calls in message length: ${allToolCallsInMessage.length}`);
    log.info(`[ChatTab] Dispositions needed: ${allToolCallsInMessage.length}`);
    log.info(`[ChatTab] Dispositions we have: ${currentDispositions.size}`);
    log.info(`[ChatTab] New disposition:`, { toolCallId: toolCall.toolCallId, decision: toolCallDecision });
    log.info(`[ChatTab] All dispositions check:`, allToolCallsInMessage.map(tc => ({
      toolCallId: tc.toolCallId,
      hasDisposition: tc.toolCallId ? currentDispositions.has(tc.toolCallId) : false
    })));

    if (allDispositioned) {
      try {
        // Create approval message with all dispositions for this message
        const approvalMessage = {
          role: 'approval' as const,
          toolCallApprovals: allToolCallsInMessage
            .filter(tc => tc.toolCallId && currentDispositions.has(tc.toolCallId))
            .map(tc => {
              const disposition = currentDispositions.get(tc.toolCallId!)!;
              return {
                toolCallId: tc.toolCallId!,
                decision: disposition.decision,
                serverName: tc.serverName,
                toolName: tc.toolName,
                args: tc.args
              };
            }),
          content: '' // Add empty content to satisfy ChatMessage type
        };

        log.info(`[ChatTab] Sending approval message:`, approvalMessage);

        // Set loading state only when we're actually sending the message
        setIsLoading(true);

        // Send approval message and get response
        const response = await chatApiRef.current.sendMessage(approvalMessage);

        log.info(`[ChatTab] Received response from chat session:`, response);

        // Update chat state with the full response
        setChatState(prevState => {
          const newMessages = [...prevState.messages];
          
          // Add all messages from the response, including the approval message
          if (response.updates) {
            newMessages.push(...response.updates.map(msg => {
              if (msg.role === 'assistant') {
                return {
                  type: 'ai' as const,
                  content: '',
                  modelReply: msg.modelReply
                };
              } else if (msg.role === 'approval') {
                return {
                  type: 'approval' as const,
                  content: '',
                  toolCallApprovals: msg.toolCallApprovals
                };
              } else if (msg.role === 'user' || msg.role === 'system' || msg.role === 'error') {
                return {
                  type: msg.role,
                  content: msg.content
                };
              }
              return null;
            }).filter(Boolean) as (RendererChatMessage & { modelReply?: ModelReply })[]);
          }

          return {
            ...prevState,
            messages: newMessages,
            references: response.references || prevState.references,
            rules: response.rules || prevState.rules
          };
        });

        // Clear pending dispositions after successful send
        setPendingDispositions(new Map());
      } catch (error) {
        log.error('[ChatTab] Error handling tool call approval:', error);
        // Add error message to chat
        setChatState(prevState => ({
          ...prevState,
          messages: [
            ...prevState.messages,
            {
              type: 'error' as const,
              content: `Error processing tool approval: ${error}`
            }
          ]
        }));
        // Clear pending dispositions on error
        setPendingDispositions(new Map());
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleUndoDisposition = (toolCallId: string | undefined) => {
    if (!toolCallId) return;
    setPendingDispositions(prev => {
      const next = new Map(prev);
      next.delete(toolCallId);
      return next;
    });
  };

  return (
    <div className="chat-tab">
      <div id="model-container">
        <button 
          id="model-button" 
          onClick={toggleModelPickerPanel}
          className={`btn btn-subtab ${showModelPickerPanel ? 'active' : ''}`}
        >
          <span>Model</span>
        </button>
        
        <div id="model-display">
          {chatState.selectedModel ? (
            <>
              {chatState.selectedModel in providerLogos && (
                <img 
                  src={providerLogos[chatState.selectedModel]} 
                  alt={chatState.selectedModel} 
                  className="model-logo"
                />
              )}
              <div className="model-info">
                <span id="model-provider">
                  {(() => {
                    switch (chatState.selectedModel) {
                      case ProviderType.Test: return 'Test LLM';
                      case ProviderType.Gemini: return 'Gemini';
                      case ProviderType.Claude: return 'Claude';
                      case ProviderType.OpenAI: return 'OpenAI';
                      case ProviderType.Ollama: return 'Ollama';
                      case ProviderType.Bedrock: return 'Bedrock';
                      default: return chatState.selectedModel;
                    }
                  })()}
                </span>
                <span id="model-name">
                  {chatState.selectedModelName}
                  {chatState.currentModelId && chatState.currentModelId !== chatState.selectedModelName && 
                    <span className="chat-model-id">({chatState.currentModelId})</span>
                  }
                </span>
              </div>
            </>
          ) : (
            <div className="model-info">
              <span id="model-provider">No Model Selected</span>
            </div>
          )}
        </div>
        
        <button 
          id="settings-button" 
          className={`btn btn-subtab ${showSettingsPanel ? 'active' : ''}`}
          onClick={toggleSettingsPanel}
        >
          Settings
        </button>
        
        <button 
          id="stats-button" 
          className={`btn btn-subtab ${showStatsPanel ? 'active' : ''}`}
          onClick={toggleStatsPanel}
        >
          Stats
        </button>
        
        <button 
          id="context-button" 
          className={`btn btn-subtab ${showContextPanel ? 'active' : ''}`}
          onClick={toggleContextPanel}
        >
          Context
        </button>
      </div>
      
      {showModelPickerPanel && (
        <div id="model-picker-container">
          <ModelPickerPanel
            selectedModel={chatState.selectedModel}
            onModelSelect={handleModelChange}
            onClose={() => setShowModelPickerPanel(false)}
            id={id}
          />
        </div>
      )}
      
      {showStatsPanel && (
        <div id="stats-panel">
          <div className="stats-section">
            <h3>Session Totals</h3>
            <div className="stats-item">
              <span className="stats-label">User Messages:</span>
              <span className="stats-value">
                {chatState.messages.filter(msg => msg.type === 'user').length}
              </span>
            </div>
            <div className="stats-item">
              <span className="stats-label">AI Responses (Turns):</span>
              <span className="stats-value">
                {chatState.messages
                  .filter(msg => msg.type === 'ai' && msg.modelReply)
                  .reduce((total: number, msg: RendererChatMessage & { modelReply?: ModelReply }) => total + (msg.modelReply?.turns.length || 0), 0)}
              </span>
            </div>
            <div className="stats-item">
              <span className="stats-label">Total Input Tokens:</span>
              <span className="stats-value">
                {chatState.messages
                  .filter(msg => msg.type === 'ai' && msg.modelReply)
                  .reduce((total: number, msg: RendererChatMessage & { modelReply?: ModelReply }) => total + 
                    (msg.modelReply?.turns.reduce((turnTotal: number, turn: Turn) => 
                      turnTotal + (turn.inputTokens || 0), 0) || 0), 0)
                  .toLocaleString()}
              </span>
            </div>
            <div className="stats-item">
              <span className="stats-label">Total Output Tokens:</span>
              <span className="stats-value">
                {chatState.messages
                  .filter(msg => msg.type === 'ai' && msg.modelReply)
                  .reduce((total: number, msg: RendererChatMessage & { modelReply?: ModelReply }) => total + 
                    (msg.modelReply?.turns.reduce((turnTotal: number, turn: Turn) => 
                      turnTotal + (turn.outputTokens || 0), 0) || 0), 0)
                  .toLocaleString()}
              </span>
            </div>
          </div>
          
          <div className="stats-section">
            <h3>Last Message</h3>
            {chatState.messages.filter(msg => msg.type === 'ai' && msg.modelReply).length > 0 && (
              <>
                {(() => {
                  const lastMessage = [...chatState.messages]
                    .filter(msg => msg.type === 'ai' && msg.modelReply)
                    .sort((a, b) => (b.modelReply?.timestamp || 0) - (a.modelReply?.timestamp || 0))[0];
                  
                  return (
                    <>
                      <div className="stats-item">
                        <span className="stats-label">AI Response Turns:</span>
                        <span className="stats-value">
                          {lastMessage.modelReply?.turns.length || 0}
                        </span>
                      </div>
                      <div className="stats-item">
                        <span className="stats-label">Tool Calls:</span>
                        <span className="stats-value">
                          {lastMessage.modelReply?.turns.reduce((total: number, turn: Turn) => 
                            total + (turn.toolCalls?.length || 0), 0) || 0}
                        </span>
                      </div>
                      <div className="stats-item">
                        <span className="stats-label">Input Tokens:</span>
                        <span className="stats-value">
                          {(lastMessage.modelReply?.turns.reduce((total: number, turn: Turn) => 
                            total + (turn.inputTokens || 0), 0) || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="stats-item">
                        <span className="stats-label">Output Tokens:</span>
                        <span className="stats-value">
                          {(lastMessage.modelReply?.turns.reduce((total: number, turn: Turn) => 
                            total + (turn.outputTokens || 0), 0) || 0).toLocaleString()}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
            {chatState.messages.filter(msg => msg.type === 'ai' && msg.modelReply).length === 0 && (
              <p>No AI responses yet</p>
            )}
          </div>
        </div>
      )}
      
      {showContextPanel && (
        <div id="context-panel">
          <div className="context-column">
            <div className="context-section">
              <h3>Active References</h3>
              {activeReferences.length === 0 && <p>No active references</p>}
              <ul className="context-list">
                {availableReferences
                  .filter(ref => activeReferences.includes(ref.name))
                  .sort((a, b) => {
                    if (a.priorityLevel !== b.priorityLevel) {
                      return a.priorityLevel - b.priorityLevel;
                    }
                    return a.name.localeCompare(b.name);
                  })
                  .map(ref => (
                    <li key={ref.name} className="context-item">
                      <span className="priority">{ref.priorityLevel.toString().padStart(3, '0')}</span>
                      <span className="name" title={ref.description}>{ref.name}</span>
                      <div className="actions">
                        <button className="btn remove-button" onClick={() => removeReference(ref.name)}>Remove</button>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
            
            <div className="context-section">
              <h3>Available References</h3>
              {availableReferences.filter(ref => !activeReferences.includes(ref.name)).length === 0 && <p>No references available</p>}
              <ul className="context-list">
                {availableReferences
                  .filter(ref => !activeReferences.includes(ref.name))
                  .sort((a, b) => {
                    if (a.priorityLevel !== b.priorityLevel) {
                      return a.priorityLevel - b.priorityLevel;
                    }
                    return a.name.localeCompare(b.name);
                  })
                  .map(ref => (
                    <li key={ref.name} className="context-item">
                      <span className="priority">{ref.priorityLevel.toString().padStart(3, '0')}</span>
                      <span className="name" title={ref.description}>{ref.name}</span>
                      <div className="actions">
                        <button className="btn add-button" onClick={() => addReference(ref.name)}>Add</button>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
          
          <div className="context-column">
            <div className="context-section">
              <h3>Active Rules</h3>
              {activeRules.length === 0 && <p>No active rules</p>}
              <ul className="context-list">
                {availableRules
                  .filter(rule => activeRules.includes(rule.name))
                  .sort((a, b) => {
                    if (a.priorityLevel !== b.priorityLevel) {
                      return a.priorityLevel - b.priorityLevel;
                    }
                    return a.name.localeCompare(b.name);
                  })
                  .map(rule => (
                    <li key={rule.name} className="context-item">
                      <span className="priority">{rule.priorityLevel.toString().padStart(3, '0')}</span>
                      <span className="name" title={rule.description}>{rule.name}</span>
                      <div className="actions">
                        <button className="btn remove-button" onClick={() => removeRule(rule.name)}>Remove</button>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
            
            <div className="context-section">
              <h3>Available Rules</h3>
              {availableRules.filter(rule => !activeRules.includes(rule.name)).length === 0 && <p>No rules available</p>}
              <ul className="context-list">
                {availableRules
                  .filter(rule => !activeRules.includes(rule.name))
                  .sort((a, b) => {
                    if (a.priorityLevel !== b.priorityLevel) {
                      return a.priorityLevel - b.priorityLevel;
                    }
                    return a.name.localeCompare(b.name);
                  })
                  .map(rule => (
                    <li key={rule.name} className="context-item">
                      <span className="priority">{rule.priorityLevel.toString().padStart(3, '0')}</span>
                      <span className="name" title={rule.description}>{rule.name}</span>
                      <div className="actions">
                        <button className="btn add-button" onClick={() => addRule(rule.name)}>Add</button>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      
      {showSettingsPanel && (
        <div id="settings-panel">
          <ChatSettingsForm
            settings={chatSettings}
            onSettingsChange={handleSettingsChange}
          />
        </div>
      )}
      
      <div id="chat-container" 
        ref={chatContainerRef}
        onContextMenu={handleContextMenu}
        onScroll={handleScroll}
      >
        {groupedMessages.map((group, groupIdx) => (
          <div key={groupIdx} className={`message ${group.messages[0].type}`}>
            <div style={{ display: 'inline' }}>
              <strong>{group.messages[0].type.toUpperCase()}:</strong>{' '}
              {group.messages[0].type === 'ai' ? (
                <>
                  {group.messages.map((message, messageIndex) => {
                    if (message.type === 'ai' && message.modelReply) {
                      const isLastMessage = messageIndex === group.messages.length - 1;
                      
                      return (
                        <div key={messageIndex} className="message-content">
                          {message.modelReply.turns.map((turn, turnIndex) => (
                            <div key={turnIndex}>
                              {turn.message && (
                                <div className="markdown-content">
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
                              
                              {turn.error && (
                                <div className="turn-error">
                                  <div className="error-header">Error:</div>
                                  <div className="error-content">
                                    {turn.error}
                                  </div>
                                </div>
                              )}
                              
                              {/* Show completed tool calls with their dispositions */}
                              {turn.toolCalls?.map((toolCall, toolIndex) => {
                                // Find the disposition for this tool call in the previous message
                                const disposition = group.messages
                                  .slice(0, messageIndex)
                                  .reverse()
                                  .find(m => m.type === 'approval')
                                  ?.toolCallApprovals
                                  ?.find(a => a.toolCallId === toolCall.toolCallId)
                                  ?.decision;

                                const key = `${groupIdx}-${messageIndex}-${turnIndex}-${toolIndex}`;
                                const isExpanded = expandedToolCalls.has(key);

                                return (
                                  <div key={toolIndex} className="tool-call">
                                    <div 
                                      className={`tool-call-header ${isExpanded ? 'expanded' : ''}`}
                                      onClick={() => toggleToolCall(groupIdx, messageIndex, turnIndex, toolIndex)}
                                    >
                                      <span className="tool-call-name">
                                        {toolCall.serverName}.{toolCall.toolName}
                                        {toolCall.elapsedTimeMs !== undefined && (
                                          <span className="tool-call-elapsed-time">
                                            {' '}({toolCall.elapsedTimeMs.toFixed(2)}ms)
                                          </span>
                                        )}
                                        {disposition && (
                                          <span className={`disposition-status ${disposition === TOOL_CALL_DECISION_ALLOW_ONCE || disposition === TOOL_CALL_DECISION_ALLOW_SESSION ? 'approved' : 'denied'}`}>
                                            {' - '}
                                            {disposition === TOOL_CALL_DECISION_ALLOW_ONCE ? 'Approved (once)' :
                                             disposition === TOOL_CALL_DECISION_ALLOW_SESSION ? 'Approved (session)' :
                                             'Denied'}
                                          </span>
                                        )}
                                      </span>
                                      {!disposition && !toolCall.elapsedTimeMs && (
                                        <div className="tool-call-actions">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToolCallApproval(toolCall, TOOL_CALL_DECISION_ALLOW_SESSION);
                                            }}
                                            className="btn btn-primary btn-sm"
                                          >
                                            Allow for this chat
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToolCallApproval(toolCall, TOOL_CALL_DECISION_ALLOW_ONCE);
                                            }}
                                            className="btn btn-primary btn-sm"
                                          >
                                            Allow once
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToolCallApproval(toolCall, TOOL_CALL_DECISION_DENY);
                                            }}
                                            className="btn remove-button btn-sm"
                                          >
                                            Deny
                                          </button>
                                        </div>
                                      )}
                                      {disposition && pendingDispositions.has(toolCall.toolCallId!) && !isLoading && (
                                        <div className="tool-call-actions">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleUndoDisposition(toolCall.toolCallId);
                                            }}
                                            className="btn btn-secondary btn-sm"
                                          >
                                            Undo
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    {isExpanded && (
                                      <div className="tool-call-details">
                                        {toolCall.args && (
                                          <div className="tool-call-section">
                                            <div className="tool-call-section-header">Arguments:</div>
                                            <div className="tool-call-output">
                                              {JSON.stringify(toolCall.args, null, 2)}
                                            </div>
                                          </div>
                                        )}
                                        {toolCall.output && (
                                          <div className="tool-call-section">
                                            <div className="tool-call-section-header">Output:</div>
                                            <div className="tool-call-output">
                                              {toolCall.output}
                                            </div>
                                          </div>
                                        )}
                                        {toolCall.error && (
                                          <div className="tool-call-section">
                                            <div className="tool-call-section-header">Error:</div>
                                            <div className="tool-call-error">
                                              {toolCall.error}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ))}

                          {/* Show pending tool calls at the end */}
                          {isLastMessage && message.modelReply.pendingToolCalls && message.modelReply.pendingToolCalls.length > 0 && (
                            <div className="tool-calls-section">
                              {!isLoading && (
                                <div className="section-title">
                                  Tool Calls Requiring Approval
                                </div>
                              )}
                              {message.modelReply.pendingToolCalls.map((toolCall, index) => {
                                if (!toolCall.toolCallId) return null;
                                const disposition = toolCallDispositions.get(toolCall.toolCallId);
                                const isPending = hasPendingDispositions;
                                const key = `${groupIdx}-${messageIndex}-0-${index}`;  // Use 0 as turnIndex for pending calls
                                const isExpanded = expandedToolCalls.has(key);
                                
                                return (
                                  <div key={index} className="tool-call">
                                    <div 
                                      className={`tool-call-header ${isExpanded ? 'expanded' : ''}`}
                                      onClick={() => toggleToolCall(groupIdx, messageIndex, 0, index)}
                                    >
                                      <span className="tool-call-name">
                                        {toolCall.serverName}.{toolCall.toolName}
                                        {isLoading && (
                                          <span className="pending-status">
                                            {' '}(pending)
                                          </span>
                                        )}
                                        {disposition && (
                                          <span className={`disposition-status ${disposition === TOOL_CALL_DECISION_ALLOW_ONCE || disposition === TOOL_CALL_DECISION_ALLOW_SESSION ? 'approved' : 'denied'}`}>
                                            {' - '}
                                            {disposition === TOOL_CALL_DECISION_ALLOW_ONCE ? 'Approved (once)' :
                                             disposition === TOOL_CALL_DECISION_ALLOW_SESSION ? 'Approved (session)' :
                                             'Denied'}
                                          </span>
                                        )}
                                      </span>
                                      {!disposition && !isLoading && (
                                        <div className="tool-call-actions">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToolCallApproval(toolCall, TOOL_CALL_DECISION_ALLOW_SESSION);
                                            }}
                                            className="btn btn-primary btn-sm"
                                          >
                                            Allow for this chat
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToolCallApproval(toolCall, TOOL_CALL_DECISION_ALLOW_ONCE);
                                            }}
                                            className="btn btn-primary btn-sm"
                                          >
                                            Allow once
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToolCallApproval(toolCall, TOOL_CALL_DECISION_DENY);
                                            }}
                                            className="btn remove-button btn-sm"
                                          >
                                            Deny
                                          </button>
                                        </div>
                                      )}
                                      {disposition && pendingDispositions.has(toolCall.toolCallId!) && !isLoading && (
                                        <div className="tool-call-actions">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleUndoDisposition(toolCall.toolCallId);
                                            }}
                                            className="btn btn-secondary btn-sm"
                                          >
                                            Undo
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    {isExpanded && (
                                      <div className="tool-call-details">
                                        {toolCall.args && (
                                          <div className="tool-call-section">
                                            <div className="tool-call-section-header">Arguments:</div>
                                            <div className="tool-call-output">
                                              {JSON.stringify(toolCall.args, null, 2)}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {!isLoading && (
                                <>
                                  <div className="warning-message">
                                    <strong>Warning:</strong>&nbsp;Malicious MCP Servers or conversation content could potentially trick TeamSpark AI Workbench into attempting harmful actions through your installed tools.
                                  </div>
                                  <div className="warning-text">
                                    <strong>Review each action carefully before approving</strong>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })}
                </>
              ) : (
                <span>{group.messages[0].content}</span>
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
          placeholder={isLoading || isPendingDisposition ? "" : 
            chatState.selectedModel ? "Type your message..." : "Select a model to start chatting"}
          rows={1}
          disabled={isLoading || !chatState.selectedModel || isPendingDisposition}
        />
        <button 
          id="send-button" 
          className="btn btn-primary"
          onClick={sendMessage}
          disabled={isLoading || !inputValue.trim() || isPendingDisposition}
        >
          Send
        </button>
      </div>
    </div>
  );
};