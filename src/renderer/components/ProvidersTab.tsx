import React, { useEffect, useState } from 'react';
import { TabProps } from '../types/TabProps';
import { TabState, TabMode } from '../types/TabState';
import { LLMType, LLMProviderInfo, ILLMModel } from '../../shared/llm';
import { AboutView } from './AboutView';
import log from 'electron-log';

// Import provider logos
import TestLogo from '../assets/frosty.png';
import OllamaLogo from '../assets/ollama.png';
import OpenAILogo from '../assets/openai.png';
import GeminiLogo from '../assets/gemini.png';
import AnthropicLogo from '../assets/anthropic.png';
import BedrockLogo from '../assets/bedrock.png';

import './ProvidersTab.css';

// Map each provider to its logo
const providerLogos: Record<LLMType, any> = {
  [LLMType.Test]: TestLogo,
  [LLMType.Ollama]: OllamaLogo,
  [LLMType.OpenAI]: OpenAILogo,
  [LLMType.Gemini]: GeminiLogo,
  [LLMType.Claude]: AnthropicLogo,
  [LLMType.Bedrock]: BedrockLogo,
};

interface Provider {
  id: string;
  name: string;
  models: ILLMModel[];
  info: LLMProviderInfo;
}

interface EditProviderModalProps {
  provider?: Provider;
  onSave: (config: Record<string, string>) => void;
  onCancel: () => void;
}

const EditProviderModal: React.FC<EditProviderModalProps> = ({ provider, onSave, onCancel }) => {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [selectedProviderType, setSelectedProviderType] = useState<LLMType | null>(null);
  const [providerInfo, setProviderInfo] = useState<Record<string, LLMProviderInfo>>({});
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const loadProviderInfo = async () => {
      const info = await window.api.getProviderInfo();
      setProviderInfo(info);
    };
    loadProviderInfo();
  }, []);

  useEffect(() => {
    if (provider) {
      // Initialize config with any existing values
      const initialConfig: Record<string, string> = {};
      provider.info.configKeys?.forEach(async key => {
        const value = await window.api.getProviderConfig(provider.id, key);
        if (value !== null) {
          initialConfig[key] = value;
        }
      });
      setConfig(initialConfig);
    }
  }, [provider]);

  const handleSave = async () => {
    setError(null);
    try {
      if (!provider && selectedProviderType) {
        // Adding a new provider
        await window.api.addProvider(selectedProviderType);
        // Set config values for the new provider
        for (const [key, value] of Object.entries(config)) {
          await window.api.setProviderConfig(selectedProviderType, key, value);
        }
      } else if (provider) {
        // Updating existing provider
        for (const [key, value] of Object.entries(config)) {
          await window.api.setProviderConfig(provider.id, key, value);
        }
      }
      await onSave(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save provider configuration');
      return;
    }
  };

  const handleProviderSelect = (type: LLMType) => {
    setSelectedProviderType(type);
    const info = providerInfo[type];
    if (info?.configKeys) {
      const initialConfig: Record<string, string> = {};
      info.configKeys.forEach(key => {
        initialConfig[key] = '';
      });
      setConfig(initialConfig);
    }
  };

  const toggleFieldVisibility = (key: string) => {
    setVisibleFields(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div style={{ padding: '20px', width: '100%', boxSizing: 'border-box' }}>
      <h2 style={{ marginTop: 0 }}>
        Configure Provider
      </h2>
      
      {error && (
        <div style={{ 
          color: '#dc3545',
          backgroundColor: '#f8d7da',
          padding: '8px 12px',
          borderRadius: '4px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '1.2em' }}>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {provider ? (
        <>
          <div style={{ 
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '2px'
          }}>
            <img 
              src={providerLogos[provider.id as LLMType]} 
              alt={provider.info.name}
              className="provider-logo-large"
            />
            <h3 style={{ margin: 0 }}>{provider.info.name}</h3>
          </div>
          <p>{provider.info.description}</p>
          {provider.info.website && (
            <a 
              href="#" 
              onClick={(e) => {
                e.preventDefault();
                if (typeof provider.info.website === 'string') {
                  window.api.openExternal(provider.info.website);
                }
              }}
              style={{ display: 'block', marginBottom: '24px' }}
            >
              Visit Website
            </a>
          )}

          {provider.info.configKeys && provider.info.configKeys.length > 0 && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'max-content 1fr',
              gap: '12px',
              alignItems: 'center',
              marginBottom: '20px',
              width: '100%'
            }}>
              {provider.info.configKeys.map(key => (
                <React.Fragment key={key}>
                  <label style={{ fontWeight: 'bold', whiteSpace: 'nowrap', paddingRight: '8px' }}>{key}:</label>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input 
                      type={visibleFields[key] ? 'text' : 'password'} 
                      value={config[key] || ''}
                      onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
                      style={{ width: '100%', padding: '4px 8px' }}
                      placeholder={`Enter ${key}`}
                    />
                    <button
                      onClick={() => toggleFieldVisibility(key)}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: 'transparent',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}
                    >
                      {visibleFields[key] ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ marginBottom: '20px', width: '100%' }}>
            <p>Select a provider to add:</p>
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '16px',
              marginTop: '16px',
              width: '100%'
            }}>
              {Object.entries(providerInfo).map(([type, info]) => (
                <div
                  key={type}
                  onClick={() => handleProviderSelect(type as LLMType)}
                  style={{
                    padding: '16px',
                    border: `2px solid ${selectedProviderType === type ? '#1890ff' : '#e8e8e8'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <img 
                    src={providerLogos[type as LLMType]} 
                    alt={info.name}
                    className="provider-logo"
                  />
                  <h3 style={{ margin: 0 }}>{info.name}</h3>
                  <p style={{ margin: 0, textAlign: 'center' }}>{info.description}</p>
                </div>
              ))}
            </div>
          </div>

          {selectedProviderType && providerInfo[selectedProviderType]?.configKeys && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'max-content 1fr',
              gap: '12px',
              alignItems: 'center',
              marginBottom: '20px',
              width: '100%'
            }}>
              {providerInfo[selectedProviderType].configKeys.map(key => (
                <React.Fragment key={key}>
                  <label style={{ fontWeight: 'bold', whiteSpace: 'nowrap', paddingRight: '8px' }}>{key}:</label>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input 
                      type={visibleFields[key] ? 'text' : 'password'} 
                      value={config[key] || ''}
                      onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
                      style={{ width: '100%', padding: '4px 8px' }}
                      placeholder={`Enter ${key}`}
                    />
                    <button
                      onClick={() => toggleFieldVisibility(key)}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: 'transparent',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}
                    >
                      {visibleFields[key] ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ 
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px',
        width: '100%'
      }}>
        <button onClick={onCancel}>Cancel</button>
        <button 
          onClick={handleSave}
          disabled={!provider && !selectedProviderType}
          style={{ 
            padding: '6px 12px',
            backgroundColor: '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {provider ? 'Save' : 'Add Provider'}
        </button>
      </div>
    </div>
  );
};

export const ProvidersTab: React.FC<TabProps> = ({ id, activeTabId, name, type }) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabState, setTabState] = useState<TabState>({ mode: 'about' });
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | undefined>(undefined);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const installedProviders = await window.api.getInstalledProviders();
        const allProviderInfo = await window.api.getProviderInfo();
        const providersWithModels = await Promise.all(
          installedProviders.map(async (provider: string) => {
            const models = await window.api.getModelsForProvider(provider);
            const info = allProviderInfo[provider as LLMType];
            return {
              id: provider,
              name: provider,
              models,
              info
            };
          })
        );
        setProviders(providersWithModels);
      } catch (error) {
        log.error('Error loading providers:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProviders();
  }, []);

  const handleAddProvider = () => {
    setEditingProvider(undefined);
    setIsEditing(true);
  };

  const handleConfigureProvider = (provider: Provider) => {
    setEditingProvider(provider);
    setIsEditing(true);
  };

  const handleSaveProvider = async (config: Record<string, string>) => {
    if (!editingProvider) return;
    
    try {
      // Save each config key
      for (const [key, value] of Object.entries(config)) {
        await window.api.setProviderConfig(editingProvider.id, key, value);
      }
      setIsEditing(false);
      setEditingProvider(undefined);
    } catch (error) {
      throw error;
    }
  };

  const handleRemoveProvider = async (providerId: string) => {
    try {
      await window.api.removeProvider(providerId);
      setProviders(providers.filter(p => p.id !== providerId));
      if (selectedProvider === providerId) {
        setSelectedProvider(null);
        setTabState({ mode: 'about' });
      }
    } catch (error) {
      log.error('Error removing provider:', error);
    }
  };

  const handleProviderSelect = (providerId: string) => {
    setSelectedProvider(providerId);
    setTabState({ mode: 'item' });
  };

  if (id !== activeTabId) {
    return null;
  }

  return (
    <div className="references-container">
      {isEditing ? (
        <EditProviderModal
          provider={editingProvider}
          onSave={handleSaveProvider}
          onCancel={() => {
            setIsEditing(false);
            setEditingProvider(undefined);
          }}
        />
      ) : (
        <>
          <div className="references-sidebar">
            <div className="sidebar-header">
              <h3>Providers</h3>
              <button onClick={handleAddProvider}>Add</button>
            </div>
            <div className="references-list">
              {loading ? (
                <div className="loading">Loading providers...</div>
              ) : (
                <>
                  <div 
                    className={`reference-item ${tabState.mode === 'about' ? 'selected' : ''}`}
                    onClick={() => {
                      setTabState({ mode: 'about' });
                      setSelectedProvider(null);
                    }}
                    style={{
                      padding: '10px',
                      cursor: 'pointer',
                      backgroundColor: tabState.mode === 'about' && !selectedProvider ? '#e6f7ff' : 'transparent',
                      borderLeft: tabState.mode === 'about' && !selectedProvider ? '3px solid #1890ff' : 'none',
                      borderRadius: '4px',
                      marginBottom: '5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <span style={{ color: '#666' }}>ℹ️</span>
                    <span>About Providers</span>
                  </div>
                  {providers.map((provider) => (
                    <div
                      key={provider.id}
                      className={`reference-item ${selectedProvider === provider.id ? 'selected' : ''}`}
                      onClick={() => handleProviderSelect(provider.id)}
                      style={{
                        padding: '10px',
                        cursor: 'pointer',
                        backgroundColor: selectedProvider === provider.id ? '#e6f7ff' : 'transparent',
                        borderLeft: selectedProvider === provider.id ? '3px solid #1890ff' : 'none',
                        borderRadius: '4px',
                        marginBottom: '5px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <img 
                        src={providerLogos[provider.id as LLMType]} 
                        alt={provider.info.name}
                        className="provider-logo"
                      />
                      {provider.info.name}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="references-main">
            {tabState.mode === 'about' ? (
              <AboutView
                title="About Providers"
                description={
                  <div>
                    <p>
                      Providers are the AI services that power your workspace. Each provider offers different models
                      with varying capabilities and costs. You can install multiple providers and switch between them
                      as needed.
                    </p>
                    <p>
                      To use a provider, you may need to configure API keys or other settings. Each provider has its
                      own requirements and capabilities, which are detailed in their respective configuration sections.
                    </p>
                  </div>
                }
              />
            ) : selectedProvider ? (
              <div className="provider-details">
                {(() => {
                  const provider = providers.find(p => p.id === selectedProvider);
                  if (!provider) return null;
                  
                  return (
                    <>
                      <div className="provider-header">
                        <img 
                          src={providerLogos[provider.id as LLMType]} 
                          alt={provider.info.name}
                          className="provider-logo-large"
                        />
                        <h3>{provider.info.name}</h3>
                        <button 
                          className="configure-button"
                          onClick={() => handleConfigureProvider(provider)}
                        >
                          Configure
                        </button>
                        <button 
                          className="remove-button"
                          onClick={() => handleRemoveProvider(provider.id)}
                        >
                          Remove Provider
                        </button>
                      </div>
                      
                      <div className="provider-info">
                        <p>{provider.info.description}</p>
                        {provider.info.website && (
                          <a 
                            href="#" 
                            onClick={(e) => {
                              e.preventDefault();
                              if (typeof provider.info.website === 'string') {
                                window.api.openExternal(provider.info.website);
                              }
                            }}
                          >
                            Visit Website
                          </a>
                        )}
                        {provider.info.requiresApiKey && (
                          <div className="api-key-notice">
                            <strong>Requires API Key</strong>
                            {provider.info.configKeys && provider.info.configKeys.length > 0 && (
                              <div className="config-keys">
                                <small>Config Keys: {provider.info.configKeys.join(', ')}</small>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="provider-models">
                        <h4>Available Models</h4>
                        <ul>
                          {provider.models.map((model) => (
                            <li key={model.id} className="model-item">
                              <div className="model-name">{model.name}</div>
                              {model.id !== model.name && <div className="model-id">{model.id}</div>}
                              {model.description && <div className="model-description">{model.description}</div>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}; 