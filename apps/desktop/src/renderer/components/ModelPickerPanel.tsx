import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ProviderId } from '@tsagent/core';
import type { ProviderInfo as LLMProviderInfo, ProviderModel as ILLMModel } from '@tsagent/core';
import log from 'electron-log';

import './ModelPickerPanel.css';
import { ProviderIcon } from './ProviderIcon';

interface ModelPickerPanelProps {
  selectedModel?: ProviderId;
  initialModelId?: string; // Initial model ID to select
  onModelSelect: (provider: ProviderId, modelId: string, model: ILLMModel) => void;
  onClose: () => void;
  id: string;
}

export const ModelPickerPanel: React.FC<ModelPickerPanelProps> = ({ 
  selectedModel,
  initialModelId,
  onModelSelect,
  onClose,
  id
}) => {
  const getProviderInfo = useCallback(async () => {
    // Get all available providers and their info
    const availableProviders = await window.api.getInstalledProviders();
    const providerInfoMap: Record<ProviderId, LLMProviderInfo> = {} as Record<ProviderId, LLMProviderInfo>;
    
    for (const provider of availableProviders) {
      try {
        const info = await window.api.getProviderInfo(provider);
        providerInfoMap[provider] = info;
      } catch (error) {
        log.error(`Failed to get info for provider ${provider}:`, error);
      }
    }
    
    return providerInfoMap;
  }, []);
  
  const getModelsForProvider = useCallback(async (provider: ProviderId) => {
    return await window.api.getModelsForProvider(provider);
  }, []);
  
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | undefined>(selectedModel);
  const [providerInfo, setProviderInfo] = useState<Record<ProviderId, LLMProviderInfo>>({} as Record<ProviderId, LLMProviderInfo>);
  const [models, setModels] = useState<ILLMModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedModelName, setSelectedModelName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  
  // Add a ref to track if the initial load is complete
  const initialLoadComplete = useRef(false);
  // Track the initial model ID to select (from props)
  const initialModelIdRef = useRef<string | undefined>(initialModelId);
  // Ref for the models list ul element
  const modelsListRef = useRef<HTMLUListElement>(null);
  
  // Update ref when initialModelId prop changes
  useEffect(() => {
    initialModelIdRef.current = initialModelId;
  }, [initialModelId]);
  
  // Use a single properly structured useEffect for initial data loading
  useEffect(() => {
    let isMounted = true;
    
    const initialize = async () => {
      try {
        log.info('[ModelPickerPanel] Starting initialization');
        setLoading(true);
        
        // First fetch the provider info and installed providers
        const [info, installedProviders] = await Promise.all([
          getProviderInfo(),
          window.api.getInstalledProviders()
        ]);
        
        log.info('[ModelPickerPanel] Got provider info and installed providers:', { 
          providers: installedProviders,
          info: Object.keys(info)
        });
        
        // Only update state if component is still mounted
        if (isMounted) {
          // Filter provider info to only show installed providers
          const filteredInfo = Object.fromEntries(
            Object.entries(info).filter(([key]) => installedProviders.includes(key as ProviderId))
          ) as Record<ProviderId, LLMProviderInfo>;
          
          setProviderInfo(filteredInfo);
          
          // Determine initial provider and model
          let initialProvider: ProviderId | undefined = selectedModel;
          // Use prop directly - it will be updated when the prop changes
          let initialModelIdToSelect: string | undefined = initialModelId;
          
          // If no provider specified, try to get from chat state (only if id is not "modal")
          if (!initialProvider && id !== 'modal') {
            try {
              const chatState = await window.api.getChatState(id);
              const currentProvider = chatState?.currentModelProvider;
              const currentModelId = chatState?.currentModelId;
              if (currentProvider && currentModelId) {
                initialProvider = currentProvider as unknown as ProviderId;
                if (!initialModelIdToSelect) {
                  initialModelIdToSelect = currentModelId;
                }
              }
            } catch (error) {
              log.warn('Could not get chat state:', error);
            }
          }
          
          // If still no provider, use first available
          if (!initialProvider && installedProviders.length > 0) {
            initialProvider = installedProviders[0] as ProviderId;
          }
          
          if (initialProvider) {
            setSelectedProvider(initialProvider);
            try {
              const availableModels = await getModelsForProvider(initialProvider as ProviderId);
              
              if (isMounted) {
                setModels(availableModels);
                
                // Select the initial model if specified, otherwise first model
                if (initialModelIdToSelect) {
                  const modelToSelect = availableModels.find(m => m.id === initialModelIdToSelect);
                  if (modelToSelect) {
                    setSelectedModelId(modelToSelect.id);
                    setSelectedModelName(modelToSelect.name);
                  } else if (availableModels.length > 0) {
                    setSelectedModelId(availableModels[0].id);
                    setSelectedModelName(availableModels[0].name);
                  }
                } else if (availableModels.length > 0) {
                  setSelectedModelId(availableModels[0].id);
                  setSelectedModelName(availableModels[0].name);
                }
              }
            } catch (error) {
              log.error(`Failed to load models for provider ${initialProvider}:`, error);
              if (isMounted) {
                setModels([]);
              }
            }
          }
        }
      } catch (error) {
        log.error('Failed to load provider information:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    initialize();
    
    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, [getProviderInfo, getModelsForProvider, selectedModel, initialModelId]);
  
  // Update the second useEffect to use the ref instead of comparing selectedProvider and selectedModel
  useEffect(() => {
    // Skip on first render since it's handled by the initialization effect
    if (!initialLoadComplete.current) {
      initialLoadComplete.current = true;
      return;
    }
    
    let isMounted = true;
    
    const loadModels = async () => {
      if (!selectedProvider) return;
      try {
        setLoading(true);
        const availableModels = await getModelsForProvider(selectedProvider);
        
        if (isMounted) {
          setModels(availableModels);
          
          // When provider changes, select first model (don't preserve previous selection)
          if (availableModels.length > 0) {
            setSelectedModelId(availableModels[0].id);
            setSelectedModelName(availableModels[0].name);
          }
        }
      } catch (error) {
        console.error(`Failed to load models for provider ${selectedProvider}:`, error);
        if (isMounted) {
          setModels([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    loadModels();
    
    return () => {
      isMounted = false;
    };
  }, [selectedProvider, getModelsForProvider]); // Include getModelsForProvider as a dependency

  // Add effect to handle provider changes
  useEffect(() => {
    const handleProvidersChanged = async () => {
      log.info('[ModelPickerPanel] handleProvidersChanged');
      try {
        setLoading(true);
        const info = await getProviderInfo();
        const installedProviders = await window.api.getInstalledProviders();
        
        // Filter provider info to only show installed providers
        const filteredInfo = Object.fromEntries(
          Object.entries(info).filter(([key]) => installedProviders.includes(key as ProviderId))
        ) as Record<ProviderId, LLMProviderInfo>;
        
        setProviderInfo(filteredInfo);
        
        // If current provider is no longer installed, switch to first available provider
        if (selectedProvider && !installedProviders.includes(selectedProvider)) {
          const firstAvailable = installedProviders[0] as ProviderId;
          if (firstAvailable) {
            await handleProviderSelect(firstAvailable);
          }
        }
      } catch (error) {
        log.error('Error handling provider changes:', error);
      } finally {
        setLoading(false);
      }
    };

    const listener = window.api.onProvidersChanged(handleProvidersChanged);
    return () => {
      window.api.offProvidersChanged(listener);
    };
  }, [selectedProvider]);

  // Add effect to handle references changes
  useEffect(() => {
    const handleReferencesChanged = async () => {
      log.info('[ModelPickerPanel] handleReferencesChanged');
      try {
        setLoading(true);
        const info = await getProviderInfo();
        const installedProviders = await window.api.getInstalledProviders();
        
        // Filter provider info to only show installed providers
        const filteredInfo = Object.fromEntries(
          Object.entries(info).filter(([key]) => installedProviders.includes(key as ProviderId))
        ) as Record<ProviderId, LLMProviderInfo>;
        
        setProviderInfo(filteredInfo);
        
        // If current provider is no longer installed, switch to first available provider
        if (selectedProvider && !installedProviders.includes(selectedProvider)) {
          const firstAvailable = installedProviders[0] as ProviderId;
          if (firstAvailable) {
            await handleProviderSelect(firstAvailable);
          }
        }
      } catch (error) {
        log.error('Error handling references changes:', error);
      } finally {
        setLoading(false);
      }
    };

    const listener = window.api.onReferencesChanged(handleReferencesChanged);
    return () => {
      window.api.offReferencesChanged(listener);
    };
  }, [selectedProvider]);

  // Handle provider selection
  const handleProviderSelect = (provider: ProviderId) => {
    if (provider !== selectedProvider) {
      setSelectedProvider(provider);
    }
  };

  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProviderDropdownOpen(false);
      }
    };

    if (isProviderDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProviderDropdownOpen]);

  // Handle model selection
  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId);
    const selectedModel = models.find(model => model.id === modelId);
    if (selectedModel) {
      setSelectedModelName(selectedModel.name);
    }
  };

  // Scroll selected model into view after models are loaded and selected
  useEffect(() => {
    if (!selectedModelId || !modelsListRef.current || models.length === 0) {
      return;
    }

    // Wait for DOM to update, then scroll into view
    const scrollToSelected = () => {
      const selectedElement = modelsListRef.current?.querySelector(`li[data-model-id="${selectedModelId}"]`) as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };

    // Use setTimeout to ensure DOM has updated
    const timeoutId = setTimeout(scrollToSelected, 0);
    return () => clearTimeout(timeoutId);
  }, [selectedModelId, models.length]);

  // Apply selected model
  const applyModelSelection = () => {
    if (selectedProvider && selectedModelId) {
      const selectedModel = models.find(m => m.id === selectedModelId);
      if (selectedModel) {
        onModelSelect(selectedProvider, selectedModelId, selectedModel);
        onClose();
      }
    }
  };

  const handleProviderRemove = async (provider: ProviderId) => {
    if (confirm(`Are you sure you want to remove the ${providerInfo[provider].name} provider? This will also remove all associated models.`)) {
      try {
        await window.api.removeProvider(provider);
        log.info(`Provider ${provider} removed successfully`);
      } catch (error) {
        log.error(`Failed to remove provider ${provider}:`, error);
      }
    }
  };

  return (
    <div className="model-picker-panel">
      <div className="model-picker-header">
        <h2>Select Model</h2>
        <button className="btn close-button" onClick={onClose}>×</button>
      </div>
      
      <div className="model-picker-content">
        {/* Provider Dropdown */}
        <div className="provider-selector">
          <label>Provider</label>
          <div className="custom-dropdown" ref={dropdownRef}>
            <div 
              className="dropdown-selected"
              onClick={() => setIsProviderDropdownOpen(!isProviderDropdownOpen)}
            >
              {selectedProvider && providerInfo[selectedProvider] ? (
                <>
                  <ProviderIcon 
                    providerType={selectedProvider}
                    alt={providerInfo[selectedProvider].name}
                    className="dropdown-logo"
                  />
                  <span className="dropdown-text">
                    <span className="dropdown-title">{providerInfo[selectedProvider].name}</span>
                    {providerInfo[selectedProvider].description && (
                      <span className="dropdown-description">
                        {providerInfo[selectedProvider].description}
                      </span>
                    )}
                  </span>
                </>
              ) : (
                <span className="dropdown-text">
                  <span className="dropdown-title">Select a provider</span>
                </span>
              )}
              <span className="dropdown-arrow">{isProviderDropdownOpen ? '▲' : '▼'}</span>
            </div>
            {isProviderDropdownOpen && (
              <div className="dropdown-menu">
                {Object.entries(providerInfo)
                  .sort(([a], [b]) => providerInfo[a as ProviderId].name.localeCompare(providerInfo[b as ProviderId].name))
                  .map(([key, info]) => (
                    <div
                      key={key}
                      className={`dropdown-option ${selectedProvider === key as ProviderId ? 'selected' : ''}`}
                      onClick={() => {
                        handleProviderSelect(key as ProviderId);
                        setIsProviderDropdownOpen(false);
                      }}
                    >
                      <ProviderIcon 
                        providerType={key as ProviderId}
                        alt={info.name}
                        className="dropdown-logo"
                      />
                      <span className="dropdown-text">
                        <span className="dropdown-title">{info.name}</span>
                        {info.description && (
                          <span className="dropdown-description">
                            {info.description}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Models List */}
        {selectedProvider && providerInfo[selectedProvider] && (
          <div className="models-list">
            <h3>Available Models</h3>
            {loading ? (
              <div className="loading">Loading models...</div>
            ) : models.length === 0 ? (
              <div className="no-models">No models available</div>
            ) : (
              <ul ref={modelsListRef}>
                {models.map(model => (
                  <li 
                    key={model.id}
                    data-model-id={model.id}
                    className={selectedModelId === model.id ? 'selected' : ''}
                    onClick={() => handleModelSelect(model.id)}
                  >
                    <div className="model-name">{model.name}</div>
                    {model.id !== model.name && <div className="model-id">{model.id}</div>}
                    {model.description && <div className="model-description">{model.description}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      
      <div className="model-picker-footer">
        <button className="btn cancel-button" onClick={onClose}>Cancel</button>
        <button className="btn apply-button" onClick={applyModelSelection} disabled={!selectedModelId}>Apply</button>
      </div>      
    </div>
  );
}; 