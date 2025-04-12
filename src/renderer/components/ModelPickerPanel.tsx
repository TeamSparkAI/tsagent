import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LLMType, LLMProviderInfo, ILLMModel } from '../../shared/llm';

// Import provider logos
import TestLogo from '../assets/frosty.png';
import OllamaLogo from '../assets/ollama.png';
import OpenAILogo from '../assets/openai.png';
import GeminiLogo from '../assets/gemini.png';
import AnthropicLogo from '../assets/anthropic.png';
import BedrockLogo from '../assets/bedrock.png';

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
  selectedModel: LLMType;
  onModelSelect: (model: LLMType, modelId: string, modelName: string) => void;
  onClose: () => void;
}

export const ModelPickerPanel: React.FC<ModelPickerPanelProps> = ({ 
  selectedModel, 
  onModelSelect,
  onClose
}) => {
  // Inline the useAppState hook functions
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
        
        // First fetch the provider info
        const info = await getProviderInfo();
        
        // Only update state if component is still mounted
        if (isMounted) {
          setProviderInfo(info);
          setSelectedProvider(selectedModel);
          
          // Then fetch models for the selected provider
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
            console.error(`Failed to load models for provider ${selectedModel}:`, error);
            if (isMounted) {
              setModels([]);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load provider information:', error);
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
  }, [getProviderInfo, getModelsForProvider, selectedModel]); // Include the inlined functions as dependencies
  
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
        <button className="close-button" onClick={onClose}>×</button>
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
              {providerInfo[selectedProvider].requiresApiKey && (
                <div className="api-key-notice">
                  <strong>Requires API Key</strong>
                  {providerInfo[selectedProvider].configKeys && providerInfo[selectedProvider].configKeys.length > 0 && (
                    <div className="config-keys">
                      <small>Config Keys: {providerInfo[selectedProvider].configKeys.join(', ')}</small>
                    </div>
                  )}
                </div>
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
        <button 
          className="cancel-button" 
          onClick={onClose}
        >
          Cancel
        </button>
        <button 
          className="apply-button" 
          onClick={applyModelSelection}
          disabled={!selectedModelId}
        >
          Apply
        </button>
      </div>
      
      <style>
        {`
          .model-picker-panel {
            background-color: #fff;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            width: 100%;
            display: flex;
            flex-direction: column;
            max-height: 400px;
          }
          
          .model-picker-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 15px;
            border-bottom: 1px solid #eee;
          }
          
          .model-picker-header h2 {
            margin: 0;
            font-size: 18px;
          }
          
          .close-button {
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #666;
          }
          
          .model-picker-content {
            display: grid;
            grid-template-columns: 1fr 1fr 2fr;
            gap: 15px;
            padding: 15px;
            overflow-y: auto;
            flex: 1;
          }
          
          .providers-list, .provider-details, .models-list {
            overflow-y: auto;
            max-height: 300px;
          }
          
          .providers-list ul, .models-list ul {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          
          .providers-list li, .models-list li {
            padding: 10px;
            border-radius: 4px;
            cursor: pointer;
            margin-bottom: 5px;
          }
          
          .providers-list li {
            display: flex;
            align-items: center;
          }
          
          .models-list li {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
          }
          
          .providers-list li:hover, .models-list li:hover {
            background-color: #f5f5f5;
          }
          
          .providers-list li.selected, .models-list li.selected {
            background-color: #e6f7ff;
            border-left: 3px solid #1890ff;
          }
          
          .provider-logo {
            width: 20px;
            height: 20px;
            margin-right: 8px;
            object-fit: contain;
          }
          
          .provider-logo-large {
            width: 40px;
            height: 40px;
            margin-right: 12px;
            object-fit: contain;
          }
          
          .provider-header {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
          }
          
          .provider-details {
            padding: 10px;
            border-left: 1px solid #eee;
            border-right: 1px solid #eee;
          }
          
          .provider-meta {
            margin-top: 15px;
          }
          
          .api-key-notice {
            margin-top: 10px;
            color: #ff4d4f;
          }
          
          .config-keys {
            margin-top: 5px;
            color: #666;
          }
          
          .model-picker-footer {
            display: flex;
            justify-content: flex-end;
            padding: 10px 15px;
            border-top: 1px solid #eee;
          }
          
          .cancel-button, .apply-button {
            padding: 6px 15px;
            border-radius: 4px;
            cursor: pointer;
            margin-left: 10px;
          }
          
          .cancel-button {
            border: 1px solid #d9d9d9;
            background-color: #fff;
          }
          
          .apply-button {
            border: 1px solid #1890ff;
            background-color: #1890ff;
            color: #fff;
          }
          
          .apply-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          
          .model-name {
            font-weight: bold;
            margin-bottom: 4px;
          }
          
          .model-id {
            font-size: 0.85em;
            color: #666;
            margin-bottom: 4px;
          }
          
          .model-description {
            font-size: 0.9em;
            color: #444;
          }
        `}
      </style>
    </div>
  );
}; 