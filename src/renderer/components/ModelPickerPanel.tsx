import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LLMType, LLMProviderInfo, ILLMModel } from '../../shared/llm';
import log from 'electron-log';

// Import provider logos
import TestLogo from '../assets/frosty.png';
import OllamaLogo from '../assets/ollama.png';
import OpenAILogo from '../assets/openai.png';
import GeminiLogo from '../assets/gemini.png';
import AnthropicLogo from '../assets/anthropic.png';
import BedrockLogo from '../assets/bedrock.png';

import './ModelPickerPanel.css';

// Map each provider to its logo
const providerLogos: Record<LLMType, any> = {
  [LLMType.Test]: TestLogo,
  [LLMType.Ollama]: OllamaLogo,
  [LLMType.OpenAI]: OpenAILogo,
  [LLMType.Gemini]: GeminiLogo,
  [LLMType.Claude]: AnthropicLogo,
  [LLMType.Bedrock]: BedrockLogo,
};

interface ModelPickerPanelProps {
  selectedModel?: LLMType;
  onModelSelect: (model: LLMType, modelId: string, modelName: string) => void;
  onClose: () => void;
}

export const ModelPickerPanel: React.FC<ModelPickerPanelProps> = ({ 
  selectedModel = LLMType.Test,
  onModelSelect,
  onClose
}) => {
  const getProviderInfo = useCallback(async () => {
    return await window.api.getProviderInfo();
  }, []);
  
  const getModelsForProvider = useCallback(async (provider: LLMType) => {
    return await window.api.getModelsForProvider(provider);
  }, []);
  
  const [selectedProvider, setSelectedProvider] = useState<LLMType>(selectedModel);
  const [providerInfo, setProviderInfo] = useState<Record<LLMType, LLMProviderInfo>>({} as Record<LLMType, LLMProviderInfo>);
  const [models, setModels] = useState<ILLMModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedModelName, setSelectedModelName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  
  // Add a ref to track if the initial load is complete
  const initialLoadComplete = useRef(false);
  
  // Use a single properly structured useEffect for initial data loading
  useEffect(() => {
    let isMounted = true;
    
    const initialize = async () => {
      try {
        setLoading(true);
        
        // First fetch the provider info and installed providers
        const [info, installedProviders] = await Promise.all([
          getProviderInfo(),
          window.api.getInstalledProviders()
        ]);
        
        // Only update state if component is still mounted
        if (isMounted) {
          // Filter provider info to only show installed providers
          const filteredInfo = Object.fromEntries(
            Object.entries(info).filter(([key]) => installedProviders.includes(key))
          ) as Record<LLMType, LLMProviderInfo>;
          
          setProviderInfo(filteredInfo);
          
          // If the selected model is not installed, switch to first available
          if (!installedProviders.includes(selectedModel)) {
            const firstAvailable = installedProviders[0] as LLMType;
            if (firstAvailable) {
              setSelectedProvider(firstAvailable);
              try {
                const availableModels = await getModelsForProvider(firstAvailable);
                if (isMounted) {
                  setModels(availableModels);
                  if (availableModels.length > 0) {
                    setSelectedModelId(availableModels[0].id);
                    setSelectedModelName(availableModels[0].name);
                  }
                }
              } catch (error) {
                log.error(`Failed to load models for provider ${firstAvailable}:`, error);
                if (isMounted) {
                  setModels([]);
                }
              }
            }
          } else {
            setSelectedProvider(selectedModel);
            try {
              const availableModels = await getModelsForProvider(selectedModel);
              if (isMounted) {
                setModels(availableModels);
                if (availableModels.length > 0) {
                  setSelectedModelId(availableModels[0].id);
                  setSelectedModelName(availableModels[0].name);
                }
              }
            } catch (error) {
              log.error(`Failed to load models for provider ${selectedModel}:`, error);
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
  }, [getProviderInfo, getModelsForProvider, selectedModel]);
  
  // Update the second useEffect to use the ref instead of comparing selectedProvider and selectedModel
  useEffect(() => {
    // Skip on first render since it's handled by the initialization effect
    if (!initialLoadComplete.current) {
      initialLoadComplete.current = true;
      return;
    }
    
    let isMounted = true;
    
    const loadModels = async () => {
      try {
        setLoading(true);
        const availableModels = await getModelsForProvider(selectedProvider);
        
        if (isMounted) {
          setModels(availableModels);
          
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
          Object.entries(info).filter(([key]) => installedProviders.includes(key))
        ) as Record<LLMType, LLMProviderInfo>;
        
        setProviderInfo(filteredInfo);
        
        // If current provider is no longer installed, switch to first available provider
        if (!installedProviders.includes(selectedProvider)) {
          const firstAvailable = installedProviders[0] as LLMType;
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
          Object.entries(info).filter(([key]) => installedProviders.includes(key))
        ) as Record<LLMType, LLMProviderInfo>;
        
        setProviderInfo(filteredInfo);
        
        // If current provider is no longer installed, switch to first available provider
        if (!installedProviders.includes(selectedProvider)) {
          const firstAvailable = installedProviders[0] as LLMType;
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
  const handleProviderSelect = (provider: LLMType) => {
    if (provider !== selectedProvider) {
      setSelectedProvider(provider);
    }
  };

  // Handle model selection
  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId);
    const selectedModel = models.find(model => model.id === modelId);
    if (selectedModel) {
      setSelectedModelName(selectedModel.name);
    }
  };

  // Apply selected model
  const applyModelSelection = () => {
    onModelSelect(selectedProvider, selectedModelId, selectedModelName);
    onClose();
  };

  return (
    <div className="model-picker-panel">
      <div className="model-picker-header">
        <h2>Select Model</h2>
        <button className="btn close-button" onClick={onClose}>×</button>
      </div>
      
      <div className="model-picker-content">
        {/* Provider List */}
        <div className="providers-list">
          <h3>Providers</h3>
          <ul>
            {Object.entries(providerInfo).map(([key, info]) => (
              <li 
                key={key} 
                className={selectedProvider === key as LLMType ? 'selected' : ''}
                onClick={() => handleProviderSelect(key as LLMType)}
              >
                {/* Add provider logo */}
                <img 
                  src={providerLogos[key as LLMType]} 
                  alt={info.name}
                  className="provider-logo"
                />
                <span>{info.name}</span>
              </li>
            ))}
          </ul>
        </div>
        
        {/* Provider Details */}
        {selectedProvider && providerInfo[selectedProvider] && (
          <div className="provider-details">
            <div className="provider-header">
              {/* Add larger provider logo */}
              <img 
                src={providerLogos[selectedProvider]} 
                alt={providerInfo[selectedProvider].name}
                className="provider-logo-large"
              />
              <h3>{providerInfo[selectedProvider].name}</h3>
            </div>
            <p>{providerInfo[selectedProvider].description}</p>
            <div className="provider-meta">
              {providerInfo[selectedProvider].website && (
                <a 
                  href="#" 
                  onClick={(e) => {
                    e.preventDefault();
                    const website = providerInfo[selectedProvider].website;
                    if (typeof website === 'string') {
                      window.api.openExternal(website);
                    }
                  }}
                >
                  Visit Website
                </a>
              )}
            </div>
          </div>
        )}
        
        {/* Models List */}
        <div className="models-list">
          <h3>Available Models</h3>
          {loading ? (
            <div className="loading">Loading models...</div>
          ) : models.length === 0 ? (
            <div className="no-models">No models available</div>
          ) : (
            <ul>
              {models.map(model => (
                <li 
                  key={model.id} 
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
      </div>
      
      <div className="model-picker-footer">
        <button className="btn cancel-button" onClick={onClose}>Cancel</button>
        <button className="btn apply-button" onClick={applyModelSelection} disabled={!selectedModelId}>Apply</button>
      </div>      
    </div>
  );
}; 