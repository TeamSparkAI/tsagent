import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChatAPI } from '../api/ChatAPI';
import { ProviderType } from '@tsagent/core';
import remarkGfm from 'remark-gfm';
import { TabProps } from '../types/TabProps';
import { RendererChatMessage } from '../types/ChatMessage';
import { ModelReply, Turn, ToolCallResult, ToolCallRequest } from '@tsagent/core';
import log from 'electron-log';
import { ModelPickerModal, ModelDetails } from './ModelPickerModal';
import { formatModelString, parseModelString } from '@tsagent/core';
import type { ProviderModel as ILLMModel } from '@tsagent/core';
import { getDefaultSettings } from '@tsagent/core';
import { providerLogos } from '../utils/providerLogos';
import { getAgentModelDetails, setCachedAgentModel } from '../utils/agentModelCache';
import './ChatTab.css';
import { ChatSettingsForm, ChatSettings } from './ChatSettingsForm';
import { ChatState, SessionContextItem, RequestContext } from '@tsagent/core';
import { ToolCallDecision } from '@tsagent/core';
import { ReferencesModal } from './ReferencesModal';
import { RulesModal } from './RulesModal';
import { ToolsModal } from './ToolsModal';
import { RequestContextModal } from './RequestContextModal';
import './Modal.css';

interface ClientChatState {
  messages: (RendererChatMessage & { modelReply?: ModelReply })[];
  selectedModel?: ProviderType;
  selectedModelName?: string;
  currentModelId?: string;
  pendingToolCalls?: ToolCallRequest[];
  contextItems?: SessionContextItem[];  // Session context items for deriving active references, rules, and tools
}

// Handle external links safely
const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault();
  const href = e.currentTarget.href;
  if (href) {
    window.api.openExternal(href);
  }
};


interface ChatTabProps extends TabProps {
  initialMessage?: string;
  readOnly?: boolean;
  initialModel?: {
    provider: ProviderType;
    id: string;
  };
}

export const ChatTab: React.FC<ChatTabProps> = ({ id, activeTabId, name, type, style, initialMessage, readOnly, initialModel }) => {
  const isReadOnly = readOnly === true;
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
  const [availableReferences, setAvailableReferences] = useState<{name: string, description: string, priorityLevel: number}[]>([]);
  const [availableRules, setAvailableRules] = useState<{name: string, description: string, priorityLevel: number}[]>([]);
  const [availableTools, setAvailableTools] = useState<{serverName: string, toolName: string, description: string}[]>([]);
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [showModelPickerModal, setShowModelPickerModal] = useState<boolean>(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [models, setModels] = useState<ILLMModel[]>([]);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showReferencesModal, setShowReferencesModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [showRequestContextModal, setShowRequestContextModal] = useState(false);
  const [selectedRequestContext, setSelectedRequestContext] = useState<RequestContext | undefined>(undefined);
  const [isNewSession, setIsNewSession] = useState(true);
  const [expandedToolServers, setExpandedToolServers] = useState<Set<string>>(new Set());
  const [chatSettings, setChatSettings] = useState<ChatSettings>(() => {
    const defaults = getDefaultSettings();
    return {
      maxChatTurns: defaults.maxChatTurns!,
      maxOutputTokens: defaults.maxOutputTokens!,
      temperature: defaults.temperature!,
      topP: defaults.topP!,
      toolPermission: defaults.toolPermission ?? 'tool',
      contextTopK: defaults.contextTopK!,
      contextTopN: defaults.contextTopN!,
      contextIncludeScore: defaults.contextIncludeScore!
    };
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

          // Check for initial model prop first
          if (initialModel) {
            modelProvider = initialModel.provider;
            modelId = initialModel.id;
          } else {
            // Get installed providers to verify the current model is available
            const installedProviders = await window.api.getInstalledProviders();

            // Attempt to get the model from settings
            const settings = await window.api.getSettings();
            const model = settings?.model;
            if (model) {
              const parsed = parseModelString(model);
              if (parsed && installedProviders.includes(parsed.provider)) {
                modelProvider = parsed.provider;
                modelId = parsed.modelId;
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
            
            // If initial model, try to get actual model name (using cache)
            let modelName: string | undefined = undefined;
            if (modelId && modelProvider && chatApiRef.current) {
              const modelString = formatModelString(modelProvider, modelId);
              const details = await getAgentModelDetails(
                modelString,
                (p) => chatApiRef.current!.getModels(p)
              );
              if (details) {
                modelName = details.modelName;
              } else {
                // If we can't find the model, use the ID as the name
                modelName = modelId;
              }
            }
            
            const newChatState: ClientChatState = {
              messages: state.messages.map((msg: any) => ({
                type: msg.role === 'assistant' ? 'ai' : msg.role,
                content: msg.role === 'assistant' ? '' : msg.content,
                modelReply: msg.role === 'assistant' ? msg.modelReply : undefined,
                requestContext: msg.role === 'assistant' ? msg.requestContext : undefined
              })),
              selectedModel: modelProvider,
              selectedModelName: modelName,
              currentModelId: modelId,
              contextItems: state.contextItems
            };

            setChatState(newChatState);

            // Update the chat settings
            const defaults = getDefaultSettings();
            setChatSettings({
              maxChatTurns: state.maxChatTurns ?? defaults.maxChatTurns!,
              maxOutputTokens: state.maxOutputTokens ?? defaults.maxOutputTokens!,
              temperature: state.temperature ?? defaults.temperature!,
              topP: state.topP ?? defaults.topP!,
              toolPermission: state.toolPermission ?? defaults.toolPermission ?? 'tool',
              contextTopK: state.contextTopK ?? defaults.contextTopK!,
              contextTopN: state.contextTopN ?? defaults.contextTopN!,
              contextIncludeScore: state.contextIncludeScore ?? defaults.contextIncludeScore!
            });
            
            setIsInitialized(true);

            // Only show model picker if no model was specified and not read-only
            setShowModelPickerModal(!modelProvider && !isReadOnly);
          }
        } catch (error) {
          log.error('Error initializing chat tab:', error);
        }
      };
      
      initModel();
      
      // Load available references, rules, and tools for context panel
      const loadAvailableContext = async () => {
        try {
          const refs = await window.api.getReferences();
          const rules = await window.api.getRules();
          const tools = await window.api.getServerConfigs();
          setAvailableReferences(refs.map(ref => ({ name: ref.name, description: ref.description, priorityLevel: ref.priorityLevel })));
          setAvailableRules(rules.map(rule => ({ name: rule.name, description: rule.description, priorityLevel: rule.priorityLevel })));
          
          // Load tools from all MCP servers
          const allTools: {serverName: string, toolName: string, description: string}[] = [];
          for (const server of tools) {
            try {
              const client = await window.api.getMCPClient(server.name);
              if (client && client.serverTools) {
                for (const tool of client.serverTools) {
                  allTools.push({
                    serverName: server.name,
                    toolName: tool.name,
                    description: tool.description || ''
                  });
                }
              }
            } catch (error) {
              log.warn(`Failed to load tools from server ${server.name}:`, error);
            }
          }
          setAvailableTools(allTools);
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

  // Send initial message after initialization
  useEffect(() => {
    if (isInitialized && initialMessage && chatApiRef.current) {
      const sendInitialMessage = async () => {
        try {
          // Set loading state first to show indicator
          setIsLoading(true);
          // Add user message immediately to show it in the UI
          setChatState(prev => ({
            ...prev,
            messages: [
              ...prev.messages,
              {
                type: 'user',
                content: initialMessage
              }
            ]
          }));
          await chatApiRef.current!.sendMessage(initialMessage);
          setChatState(prev => ({
            messages: chatApiRef.current!.getMessages(),
            selectedModel: chatApiRef.current!.getCurrentModel(),
            selectedModelName: chatApiRef.current!.getCurrentModelName(),
            currentModelId: prev.currentModelId
          }));
        } catch (error) {
          log.error('Failed to send initial message:', error);
          // Remove the optimistic message on error
          setChatState(prev => ({
            ...prev,
            messages: prev.messages.filter((msg, idx) => 
              !(msg.type === 'user' && msg.content === initialMessage && idx === prev.messages.length - 1)
            )
          }));
        } finally {
          setIsLoading(false);
        }
      };
      sendInitialMessage();
    }
  }, [isInitialized, initialMessage, id]);

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

  // Reset on agent change
  useEffect(() => {
    log.info('[CHAT TAB] Setting up agent:switched event listener');
    
    const handleAgentSwitched = async (data: { windowId: string, agentPath: string, targetWindowId: string }) => {   
      const currentWindowId = await window.api.getCurrentWindowId();
      log.info(`[CHAT TAB] Received agent:switched, current window ID: ${currentWindowId}, target window ID: ${data.targetWindowId}`);
        
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
    
    const listener = window.api.onAgentSwitched(handleAgentSwitched);
    
    return () => {
      if (listener) {
        log.info('[CHAT TAB] Removed agent:switched listener');
        window.api.offAgentSwitched(listener);
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

  // Scroll to bottom when loading indicator appears
  useEffect(() => {
    if (isLoading && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [isLoading]);

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
      setShowModelPickerModal(true);
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

    const messageToSend = inputValue.trim();
    
    try {
      setIsLoading(true);
      setInputValue('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '38px';
      }
      
      // Add user message immediately to show it in the UI (optimistic update)
      setChatState(prev => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            type: 'user',
            content: messageToSend
          }
        ]
      }));
      
      const response = await chatApiRef.current!.sendMessage(messageToSend);
      
      // Get updated state with contextItems
      const updatedState = await window.api.getChatState(id);
      setChatState(prev => ({
        messages: chatApiRef.current!.getMessages(),
        selectedModel: chatApiRef.current!.getCurrentModel(),
        selectedModelName: chatApiRef.current!.getCurrentModelName(),
        currentModelId: prev.currentModelId,
        contextItems: updatedState?.contextItems  // Update contextItems (activeReferences, activeRules, activeTools will be derived automatically)
      }));
    } catch (error) {
      log.error('Failed to get response:', error);
      // Remove the optimistic message on error
      setChatState(prev => ({
        ...prev,
        messages: prev.messages.filter((msg, idx) => 
          !(msg.type === 'user' && msg.content === messageToSend && idx === prev.messages.length - 1)
        )
      }));
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
              currentModelId: modelId || prev.currentModelId
            };
            return newState;
          });
          
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
          currentModelId: prev.currentModelId
        };
        return newState;
      });
    }
  };

  const handleModelSelect = async (modelString: string | undefined, details?: ModelDetails) => {
    if (!modelString) {
      log.warn('No model selected');
      return;
    }
    
    const parsed = parseModelString(modelString);
    if (parsed) {
      // Use provided model details if available, otherwise fall back to async lookup
      let modelName: string | undefined = details?.modelName;
      
      if (details && modelString) {
        // Cache the details we have from the picker
        setCachedAgentModel(modelString, {
          provider: details.provider,
          modelId: details.modelId,
          modelName: details.modelName
        });
        modelName = details.modelName;
      } else if (!modelName) {
        // Fall back to cache or async lookup
        const cachedDetails = await getAgentModelDetails(
          modelString,
          (p) => window.api.getModelsForProvider(p)
        );
        if (cachedDetails) {
          modelName = cachedDetails.modelName;
        } else {
          try {
            const models = await window.api.getModelsForProvider(parsed.provider);
            const foundModel = models.find(m => m.id === parsed.modelId);
            if (foundModel) {
              modelName = foundModel.name;
            }
          } catch (error) {
            log.error('Error loading model name:', error);
          }
        }
      }
      
      // Update chatState immediately with model details (no async delay)
      if (modelName) {
        setChatState(prev => ({
          ...prev,
          selectedModel: parsed.provider,
          selectedModelName: modelName!,
          currentModelId: parsed.modelId
        }));
      }
      
      await handleModelChange(parsed.provider, parsed.modelId, modelName);
      setShowModelPickerModal(false);
    }
  };

  const handleSaveToDefaults = async () => {
    try {
      // Save current session settings (chatSettings) to agent defaults
      await window.api.updateSettings(chatSettings);
      
      // Save current model to agent defaults
      if (chatState.selectedModel && chatState.currentModelId) {
        const modelString = formatModelString(chatState.selectedModel, chatState.currentModelId);
        await window.api.updateSettings({ model: modelString });
        
        // Cache the model details we already have
        if (chatState.selectedModelName) {
          setCachedAgentModel(modelString, {
            provider: chatState.selectedModel,
            modelId: chatState.currentModelId,
            modelName: chatState.selectedModelName
          });
        }
      }
      
      // Event will be emitted by main process, triggering all ChatSettingsForm components to reload
      log.info('Saved session settings to agent defaults');
    } catch (error) {
      log.error('Error saving settings to defaults:', error);
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

  const toggleToolServer = (serverName: string) => {
    setExpandedToolServers(prev => {
      const next = new Set(prev);
      if (next.has(serverName)) {
        next.delete(serverName);
      } else {
        next.add(serverName);
      }
      return next;
    });
  };

  const toggleContextPanel = () => {
    setShowContextPanel(!showContextPanel);
    setShowStatsPanel(false);
    setShowModelPickerModal(false);
    setShowSettingsPanel(false);
    log.debug(`Context panel ${!showContextPanel ? 'opened' : 'closed'} for chat tab ${id}`);
  };

  const toggleStatsPanel = () => {
    setShowStatsPanel(!showStatsPanel);
    setShowContextPanel(false);
    setShowModelPickerModal(false);
    setShowSettingsPanel(false);
    log.debug(`Stats panel ${!showStatsPanel ? 'opened' : 'closed'} for chat tab ${id}`);
  };

  const toggleModelPickerModal = () => {
    setShowModelPickerModal(!showModelPickerModal);
  };

  const toggleSettingsPanel = () => {
    setShowSettingsPanel(!showSettingsPanel);
    setShowContextPanel(false);
    setShowStatsPanel(false);
    setShowModelPickerModal(false);
    log.debug(`Settings panel ${!showSettingsPanel ? 'opened' : 'closed'} for chat tab ${id}`);
  };


  const handleSettingsChange = async (newSettings: typeof chatSettings) => {
    setChatSettings(newSettings);
    if (chatApiRef.current) {
      await chatApiRef.current.updateSettings(newSettings);
      // Use debug level to avoid log spam when sliders are dragged
      log.debug('Chat settings updated');
    }
  };

  const refreshContextData = async () => {
    if (chatApiRef.current) {
      try {
        // Refresh contextItems from state (activeReferences, activeRules, activeTools will be derived automatically)
        const updatedState = await window.api.getChatState(id);
        setChatState(prev => ({
          ...prev,
          contextItems: updatedState?.contextItems
        }));
      } catch (error) {
        log.error('Error refreshing context data:', error);
      }
    }
  };

  const handleToolCallApproval = async (toolCall: ToolCallRequest, decision: string) => {
    if (!chatApiRef.current || !toolCall.toolCallId) return;

    log.info(`[ChatTab] Handling tool call approval for ${toolCall.serverName}.${toolCall.toolName} with decision: ${decision}`);

    let toolCallDecision: ToolCallDecision;
    if (decision === 'allow-session') {
      toolCallDecision = 'allow-session';
    } else if (decision === 'allow-once') {
      toolCallDecision = 'allow-once';
    } else {
      toolCallDecision = 'deny';
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

        // Get updated chat state to get current contextItems
        const updatedState = await window.api.getChatState(id);

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
                  modelReply: msg.modelReply,
                  requestContext: msg.requestContext
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
            contextItems: updatedState?.contextItems  // Update contextItems (activeReferences, activeRules will be derived automatically)
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
                            total + (turn.results?.filter(r => r.type === 'toolCall').length || 0), 0) || 0}
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
              <div className="context-section-header">
                <h3>Active References {!isReadOnly && (
                  <button className="btn edit-button" onClick={() => setShowReferencesModal(true)}>
                    Manage
                  </button>
                )}</h3>
              </div>
              {(!chatState.contextItems || chatState.contextItems.filter(item => item.type === 'reference').length === 0) && <p>No active references</p>}
              <ul className="context-list">
                {availableReferences
                  .filter(ref => chatState.contextItems?.some(item => item.type === 'reference' && item.name === ref.name))
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
                    </li>
                  ))}
              </ul>
            </div>
          </div>
          
          <div className="context-column">
            <div className="context-section">
              <div className="context-section-header">
                <h3>Active Rules {!isReadOnly && (
                  <button className="btn edit-button" onClick={() => setShowRulesModal(true)}>
                    Manage
                  </button>
                )}</h3>
              </div>
              {(!chatState.contextItems || chatState.contextItems.filter(item => item.type === 'rule').length === 0) && <p>No active rules</p>}
              <ul className="context-list">
                {availableRules
                  .filter(rule => chatState.contextItems?.some(item => item.type === 'rule' && item.name === rule.name))
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
                    </li>
                  ))}
              </ul>
            </div>
          </div>
          
          <div className="context-column">
            <div className="context-section">
              <div className="context-section-header">
                <h3>Active Tools {!isReadOnly && (
                  <button className="btn edit-button" onClick={() => setShowToolsModal(true)}>
                    Manage
                  </button>
                )}</h3>
              </div>
              {(!chatState.contextItems || chatState.contextItems.filter(item => item.type === 'tool').length === 0) && <p>No active tools</p>}
              {(() => {
                const toolsByServer: Record<string, typeof availableTools> = {};
                availableTools.forEach(tool => {
                  if (chatState.contextItems?.some(item => item.type === 'tool' && item.serverName === tool.serverName && item.name === tool.toolName)) {
                    if (!toolsByServer[tool.serverName]) {
                      toolsByServer[tool.serverName] = [];
                    }
                    toolsByServer[tool.serverName].push(tool);
                  }
                });

                return Object.keys(toolsByServer).length > 0 && (
                  <ul className="context-list" style={{ margin: 0, padding: 0 }}>
                    {Object.keys(toolsByServer).sort().map(serverName => {
                      const serverTools = toolsByServer[serverName].sort((a, b) => a.toolName.localeCompare(b.toolName));
                      const allServerTools = availableTools.filter(t => t.serverName === serverName);
                      const isExpanded = expandedToolServers.has(serverName);
                      const counts = {
                        active: serverTools.length,
                        total: allServerTools.length
                      };
                      
                      return (
                        <li key={serverName} style={{ listStyle: 'none', marginBottom: '8px' }}>
                          <div 
                            style={{ 
                              cursor: 'pointer', 
                              padding: '4px 8px', 
                              backgroundColor: 'var(--background-secondary)',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                            onClick={() => toggleToolServer(serverName)}
                          >
                            <span style={{ fontSize: '12px' }}>{isExpanded ? '▼' : '▶'}</span>
                            <span style={{ fontWeight: 'bold' }}>{serverName}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {counts.active === counts.total ? (
                                `(all ${counts.active} tools)`
                              ) : (
                                `(${counts.active} of ${counts.total} tools)`
                              )}
                            </span>
                          </div>
                          {isExpanded && (
                            <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                              {serverTools.map(tool => (
                                <li key={`${tool.serverName}:${tool.toolName}`} className="context-item">
                                  <span className="name" title={tool.description}>{tool.toolName}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      
      {showSettingsPanel && (
        <div id="settings-panel">
          <ChatSettingsForm
            settings={chatSettings}
            onSettingsChange={handleSettingsChange}
            readOnly={isReadOnly}
            currentModel={chatState.selectedModel && chatState.currentModelId 
              ? formatModelString(chatState.selectedModel, chatState.currentModelId)
              : undefined}
            currentModelDetails={chatState.selectedModel && chatState.currentModelId && chatState.selectedModelName
              ? {
                  provider: chatState.selectedModel,
                  modelId: chatState.currentModelId,
                  modelName: chatState.selectedModelName
                }
              : undefined}
            onModelChange={handleModelSelect}
            onSaveToDefaults={handleSaveToDefaults}
          />
        </div>
      )}
      
      {showModelPickerModal && (
        <ModelPickerModal
          currentModel={chatState.selectedModel && chatState.currentModelId 
            ? formatModelString(chatState.selectedModel, chatState.currentModelId)
            : undefined}
          onSelect={handleModelSelect}
          onCancel={() => setShowModelPickerModal(false)}
          isOpen={showModelPickerModal}
        />
      )}
      
      <ReferencesModal
        isOpen={showReferencesModal}
        onClose={() => setShowReferencesModal(false)}
        chatApi={chatApiRef.current}
        tabId={id}
        onContextChange={refreshContextData}
      />
      
      <RulesModal
        isOpen={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        chatApi={chatApiRef.current}
        tabId={id}
        onContextChange={refreshContextData}
      />
      
      <ToolsModal
        isOpen={showToolsModal}
        onClose={() => setShowToolsModal(false)}
        chatApi={chatApiRef.current}
        tabId={id}
        onContextChange={refreshContextData}
      />
      
      <RequestContextModal
        isOpen={showRequestContextModal}
        onClose={() => {
          setShowRequestContextModal(false);
          setSelectedRequestContext(undefined);
        }}
        requestContext={selectedRequestContext}
      />
      
      <div id="chat-container" 
        ref={chatContainerRef}
        onContextMenu={handleContextMenu}
        onScroll={handleScroll}
      >
        {groupedMessages.map((group, groupIdx) => (
          <div key={groupIdx} className={`message ${group.messages[0].type}`}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <strong>{group.messages[0].type.toUpperCase()}:</strong>
              {group.messages[0].type === 'ai' ? (
                <>
                  {group.messages.map((message, messageIndex) => {
                    if (message.type === 'ai' && message.modelReply) {
                      const isLastMessage = messageIndex === group.messages.length - 1;
                      
                      return (
                        <React.Fragment key={messageIndex}>
                          {message.requestContext && (
                            <button
                              onClick={() => {
                                setSelectedRequestContext(message.requestContext);
                                setShowRequestContextModal(true);
                              }}
                              className="btn btn-link"
                              style={{ 
                                fontSize: '16px', 
                                padding: '2px 6px',
                                verticalAlign: 'baseline',
                                lineHeight: '1',
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-secondary)',
                                textDecoration: 'none'
                              }}
                              title="View context used for this response"
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = 'var(--text-primary)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = 'var(--text-secondary)';
                              }}
                            >
                              ℹ️
                            </button>
                          )}
                        </React.Fragment>
                      );
                    }
                    return null;
                  })}
                </>
              ) : null}
            </div>
            <div style={{ display: 'inline' }}>
              {group.messages[0].type === 'ai' ? (
                <>
                  {group.messages.map((message, messageIndex) => {
                    if (message.type === 'ai' && message.modelReply) {
                      const isLastMessage = messageIndex === group.messages.length - 1;
                      
                      return (
                        <div key={messageIndex} className="message-content">
                          {message.modelReply.turns.map((turn, turnIndex) => (
                            <div key={turnIndex}>
                              {/* Display text results */}
                              {turn.results?.map((result, resultIndex) => {
                                if (result.type === 'text') {
                                  return (
                                    <div key={resultIndex} className="markdown-content">
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
                                        {result.text}
                                      </ReactMarkdown>
                                    </div>
                                  );
                                } else if (result.type === 'toolCall') {
                                  // Find the disposition for this tool call in the previous message
                                  const disposition = group.messages
                                    .slice(0, messageIndex)
                                    .reverse()
                                    .find(m => m.type === 'approval')
                                    ?.toolCallApprovals
                                    ?.find(a => a.toolCallId === result.toolCall.toolCallId)
                                    ?.decision;

                                  const key = `${groupIdx}-${messageIndex}-${turnIndex}-${resultIndex}`;
                                  const isExpanded = expandedToolCalls.has(key);

                                  return (
                                    <div key={resultIndex} className="tool-call">
                                      <div 
                                        className={`tool-call-header ${isExpanded ? 'expanded' : ''}`}
                                        onClick={() => toggleToolCall(groupIdx, messageIndex, turnIndex, resultIndex)}
                                      >
                                        <span className="tool-call-name">
                                          {result.toolCall.serverName}.{result.toolCall.toolName}
                                          {result.toolCall.elapsedTimeMs !== undefined && (
                                            <span className="tool-call-elapsed-time">
                                              {' '}({result.toolCall.elapsedTimeMs.toFixed(2)}ms)
                                            </span>
                                          )}
                                          {disposition && (
                                            <span className={`disposition-status ${disposition === 'allow-once' || disposition === 'allow-session' ? 'approved' : 'denied'}`}>
                                              {' - '}
                                              {disposition === 'allow-once' ? 'Approved (once)' :
                                               disposition === 'allow-session' ? 'Approved (session)' :
                                               'Denied'}
                                            </span>
                                          )}
                                        </span>
                                        {!disposition && !result.toolCall.elapsedTimeMs && (
                                          <div className="tool-call-actions">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleToolCallApproval(result.toolCall, 'allow-session');
                                              }}
                                              className="btn btn-primary btn-sm"
                                            >
                                              Allow for this chat
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleToolCallApproval(result.toolCall, 'allow-once');
                                              }}
                                              className="btn btn-primary btn-sm"
                                            >
                                              Allow once
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleToolCallApproval(result.toolCall, 'deny');
                                              }}
                                              className="btn remove-button btn-sm"
                                            >
                                              Deny
                                            </button>
                                          </div>
                                        )}
                                        {disposition && pendingDispositions.has(result.toolCall.toolCallId!) && !isLoading && (
                                          <div className="tool-call-actions">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleUndoDisposition(result.toolCall.toolCallId);
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
                                          {result.toolCall.args && (
                                            <div className="tool-call-section">
                                              <div className="tool-call-section-header">Arguments:</div>
                                              <div className="tool-call-output">
                                                {JSON.stringify(result.toolCall.args, null, 2)}
                                              </div>
                                            </div>
                                          )}
                                          {result.toolCall.output && (
                                            <div className="tool-call-section">
                                              <div className="tool-call-section-header">Output:</div>
                                              <div className="tool-call-output">
                                                {result.toolCall.output}
                                              </div>
                                            </div>
                                          )}
                                          {result.toolCall.error && (
                                            <div className="tool-call-section">
                                              <div className="tool-call-section-header">Error:</div>
                                              <div className="tool-call-error">
                                                {result.toolCall.error}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                                return null;
                              })}
                              
                              {turn.error && (
                                <div className="turn-error">
                                  <div className="error-header">Error:</div>
                                  <div className="error-content">
                                    {turn.error}
                                  </div>
                                </div>
                              )}
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
                                          <span className={`disposition-status ${disposition === 'allow-once' || disposition === 'allow-session' ? 'approved' : 'denied'}`}>
                                            {' - '}
                                            {disposition === 'allow-once' ? 'Approved (once)' :
                                             disposition === 'allow-session' ? 'Approved (session)' :
                                             'Denied'}
                                          </span>
                                        )}
                                      </span>
                                      {!disposition && !isLoading && (
                                        <div className="tool-call-actions">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToolCallApproval(toolCall, 'allow-session');
                                            }}
                                            className="btn btn-primary btn-sm"
                                          >
                                            Allow for this chat
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToolCallApproval(toolCall, 'allow-once');
                                            }}
                                            className="btn btn-primary btn-sm"
                                          >
                                            Allow once
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToolCallApproval(toolCall, 'deny');
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
                                    <strong>Warning:</strong>&nbsp;Malicious MCP Servers or conversation content could potentially trick your agent into attempting harmful actions through your installed tools.
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
        {isLoading && (
          <div className="message system">
            <div style={{ display: 'inline' }}>
              <strong>SYSTEM:</strong> <span className="loading-text">Waiting for response...</span>
            </div>
          </div>
        )}
      </div>
      
      {!isReadOnly && (
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
      )}
    </div>
  );
};