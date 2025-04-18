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
  installedProviders: string[];
}

const EditProviderModal: React.FC<EditProviderModalProps> = ({ provider, onSave, onCancel, installedProviders }) => {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [selectedProviderType, setSelectedProviderType] = useState<LLMType | null>(null);
  const [providerInfo, setProviderInfo] = useState<Record<string, LLMProviderInfo>>({});
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [isSelectingProvider, setIsSelectingProvider] = useState(!provider);
  const [showPassword, setShowPassword] = useState(false);

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
      provider.info.configValues?.forEach(async configValue => {
        const value = await window.api.getProviderConfig(provider.id, configValue.key);
        if (value !== null) {
          initialConfig[configValue.key] = value;
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
        // Close the modal after successful addition
        onSave(config);
      } else if (provider) {
        // Updating existing provider
        for (const [key, value] of Object.entries(config)) {
          await window.api.setProviderConfig(provider.id, key, value);
        }
        onSave(config);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save provider configuration');
      return;
    }
  };

  const handleProviderSelect = (type: LLMType) => {
    setSelectedProviderType(type);
    setIsSelectingProvider(false);
    const info = providerInfo[type];
    if (info?.configValues) {
      const initialConfig: Record<string, string> = {};
      info.configValues.forEach(configValue => {
        initialConfig[configValue.key] = configValue.default || '';
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
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h2 style={{ margin: 0 }}>
          {isSelectingProvider ? 'Add Provider' : (provider ? 'Configure Provider' : 'Add Provider')}
        </h2>
        {isSelectingProvider && (
          <button className="btn cancel-button" onClick={onCancel}>Cancel</button>
        )}
      </div>
      
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

      {isSelectingProvider ? (
        <div style={{ marginBottom: '20px', width: '100%' }}>
          <p>Select a provider to add:</p>
          {Object.entries(providerInfo).filter(([type]) => !installedProviders.includes(type)).length === 0 ? (
            <div style={{ 
              marginTop: '16px',
              padding: '20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <p style={{ margin: 0, color: '#666' }}>All available providers are already installed.</p>
            </div>
          ) : (
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '16px',
              marginTop: '16px',
              width: '100%'
            }}>
              {Object.entries(providerInfo)
                .filter(([type]) => !installedProviders.includes(type))
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([type, info]) => (
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
          )}
        </div>
      ) : (
        <>
          <div style={{ 
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '2px'
          }}>
            <img 
              src={providerLogos[(provider?.id || selectedProviderType) as LLMType]} 
              alt={provider?.info.name || providerInfo[selectedProviderType as LLMType]?.name}
              className="provider-logo-large"
            />
            <h3 style={{ margin: 0 }}>{provider?.info.name || providerInfo[selectedProviderType as LLMType]?.name}</h3>
          </div>
          <p>{provider?.info.description || providerInfo[selectedProviderType as LLMType]?.description}</p>
          {(provider?.info.website || providerInfo[selectedProviderType as LLMType]?.website) && (
            <a 
              href="#" 
              onClick={(e) => {
                e.preventDefault();
                const website = provider?.info.website || providerInfo[selectedProviderType as LLMType]?.website;
                if (typeof website === 'string') {
                  window.api.openExternal(website);
                }
              }}
              style={{ display: 'block', marginBottom: '24px' }}
            >
              Visit Website
            </a>
          )}

          {(provider?.info.configValues || providerInfo[selectedProviderType as LLMType]?.configValues) && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'max-content 1fr',
              gap: '12px',
              alignItems: 'center',
              marginBottom: '20px',
              width: '100%'
            }}>
              {(provider?.info.configValues || providerInfo[selectedProviderType as LLMType]?.configValues || []).map(configValue => (
                <React.Fragment key={configValue.key}>
                  <label style={{ 
                    fontWeight: 'bold', 
                    whiteSpace: 'nowrap', 
                    paddingRight: '8px',
                    color: configValue.required ? '#dc3545' : 'inherit'
                  }}>
                    {configValue.caption || configValue.key}:
                    {configValue.required && <span style={{ color: '#dc3545', marginLeft: '4px' }}>*</span>}
                  </label>
                  <div className="input-group">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={config[configValue.key] || ''}
                      onChange={(e) => setConfig({ ...config, [configValue.key]: e.target.value })}
                      className="form-control"
                      placeholder={configValue.hint || `Enter ${configValue.caption || configValue.key}`}
                      aria-label={configValue.hint || `Enter ${configValue.caption || configValue.key}`}
                    />
                    <button
                      type="button"
                      className="password-toggle-button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? "Hide" : "Show"}
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
        justifyContent: 'flex-start',
        gap: '8px',
        width: '100%'
      }}>
        {!isSelectingProvider && (
          <>
            <button className="btn cancel-button" onClick={onCancel}>Cancel</button>
            <button 
              className="btn apply-button"
              onClick={handleSave}
            >
              {provider ? 'OK' : 'Add Provider'}
            </button>
          </>
        )}
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
          installedProviders
            .sort((a, b) => a.localeCompare(b))
            .map(async (provider: string) => {
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
    try {
      if (editingProvider) {
        // Save each config key for existing provider
        for (const [key, value] of Object.entries(config)) {
          await window.api.setProviderConfig(editingProvider.id, key, value);
        }
      }
      // Refresh the providers list
      const installedProviders = await window.api.getInstalledProviders();
      const allProviderInfo = await window.api.getProviderInfo();
      const providersWithModels = await Promise.all(
        installedProviders
          .sort((a, b) => a.localeCompare(b))
          .map(async (provider: string) => {
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
      setIsEditing(false);
      setEditingProvider(undefined);
    } catch (error) {
      log.error('Error saving provider:', error);
      throw error;
    }
  };

  const handleRemoveProvider = async (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (confirm(`Are you sure you want to remove the ${provider?.info.name} provider? This will also remove all associated models.`)) {
      try {
        await window.api.removeProvider(providerId);
        log.info(`Provider ${provider?.info.name} removed successfully`);
        setProviders(providers.filter(p => p.id !== providerId));
        if (selectedProvider === providerId) {
          setSelectedProvider(null);
          setTabState({ mode: 'about' });
        }
      } catch (error) {
        log.error(`Failed to remove provider ${provider?.info.name}:`, error);
      }
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
          installedProviders={providers.map(p => p.id)}
        />
      ) : (
        <>
          <div className="references-sidebar">
            <div className="sidebar-header">
              <h3>Providers</h3>
              <button className="btn add-button" onClick={handleAddProvider}>Add</button>
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
                        <button className="btn configure-button" onClick={() => handleConfigureProvider(provider)}>Configure</button>
                        <button className="btn remove-button" onClick={() => handleRemoveProvider(provider.id)}>Remove Provider</button>
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