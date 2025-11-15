import React, { useEffect, useState } from 'react';
import { TabProps } from '../types/TabProps';
import { TabState, TabMode } from '../types/TabState';
import { ProviderType } from '@tsagent/core';
import type { ProviderInfo as LLMProviderInfo, ProviderModel as ILLMModel } from '@tsagent/core';
import { AboutView } from './AboutView';
import log from 'electron-log';

// Import provider logos
import TestLogo from '../assets/frosty.png';
import OllamaLogo from '../assets/ollama.png';
import OpenAILogo from '../assets/openai.png';
import GeminiLogo from '../assets/gemini.png';
import AnthropicLogo from '../assets/anthropic.png';
import BedrockLogo from '../assets/bedrock.png';
import LocalLogo from '../assets/local.png';
import DockerLogo from '../assets/docker.png';

import './ProvidersTab.css';

// Map each provider to its logo
const providerLogos: Record<ProviderType, any> = {
  [ProviderType.Test]: TestLogo,
  [ProviderType.Ollama]: OllamaLogo,
  [ProviderType.OpenAI]: OpenAILogo,
  [ProviderType.Gemini]: GeminiLogo,
  [ProviderType.Claude]: AnthropicLogo,
  [ProviderType.Bedrock]: BedrockLogo,
  [ProviderType.Local]: LocalLogo,
  [ProviderType.Docker]: DockerLogo,
};

interface Provider {
  id: string;
  name: string;
  models: ILLMModel[];
  info: LLMProviderInfo;
}

interface EditProviderModalProps {
  provider?: Provider;
  onSave: (config: Record<string, string>, providerId?: string) => void;
  onCancel: () => void;
  installedProviders: string[];
}

const EditProviderModal: React.FC<EditProviderModalProps> = ({ provider, onSave, onCancel, installedProviders }) => {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [selectedProviderType, setSelectedProviderType] = useState<ProviderType | null>(null);
  const [providerInfo, setProviderInfo] = useState<Record<string, LLMProviderInfo>>({});
  const [isSelectingProvider, setIsSelectingProvider] = useState(!provider);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const loadProviderInfo = async () => {
      // Get all available providers and their info
      const availableProviders = await window.api.getAvailableProviders();
      const providerInfoMap: Record<string, LLMProviderInfo> = {};
      
      for (const provider of availableProviders) {
        try {
          const info = await window.api.getProviderInfo(provider);
          providerInfoMap[provider] = info;
        } catch (error) {
          log.error(`Failed to get info for provider ${provider}:`, error);
        }
      }
      
      setProviderInfo(providerInfoMap);
    };
    loadProviderInfo();
  }, []);

  useEffect(() => {
    if (provider) {
      // Initialize config with any existing values
      const initialConfig: Record<string, string> = {};
      provider.info.configValues?.forEach(async configValue => {
        const value = await window.api.getProviderConfig(provider.id as ProviderType, configValue.key);
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
        // Adding a new provider - validate config first
        const validation = await window.api.validateProviderConfig(selectedProviderType, config);
        if (!validation.isValid) {
          setError(validation.error || 'Invalid configuration');
          return;
        }
        // Add provider with config
        await window.api.addProvider(selectedProviderType, config);
        // Close the modal after successful addition
        onSave(config, selectedProviderType);
      } else if (provider) {
        // Updating existing provider - validate config first
        const providerType = provider.id as ProviderType;
        const validation = await window.api.validateProviderConfig(providerType, config);
        if (!validation.isValid) {
          setError(validation.error || 'Invalid configuration');
          return;
        }
        // Update provider with new config
        await window.api.addProvider(providerType, config);
        onSave(config);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save provider configuration');
      return;
    }
  };

  const handleProviderSelect = (type: ProviderType) => {
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
                    onClick={() => handleProviderSelect(type as ProviderType)}
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
                      src={providerLogos[type as ProviderType]} 
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
              src={providerLogos[(provider?.id || selectedProviderType) as ProviderType]} 
              alt={provider?.info.name || providerInfo[selectedProviderType as ProviderType]?.name}
              className="provider-logo-large"
            />
            <h3 style={{ margin: 0 }}>{provider?.info.name || providerInfo[selectedProviderType as ProviderType]?.name}</h3>
          </div>
          <p>{provider?.info.description || providerInfo[selectedProviderType as ProviderType]?.description}</p>
          {(provider?.info.website || providerInfo[selectedProviderType as ProviderType]?.website) && (
            <a 
              href="#" 
              onClick={(e) => {
                e.preventDefault();
                const website = provider?.info.website || providerInfo[selectedProviderType as ProviderType]?.website;
                if (typeof website === 'string') {
                  window.api.openExternal(website);
                }
              }}
              style={{ display: 'block', marginBottom: '24px' }}
            >
              Visit Website
            </a>
          )}

          {(provider?.info.configValues || providerInfo[selectedProviderType as ProviderType]?.configValues) && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'max-content 1fr',
              gap: '12px',
              alignItems: 'center',
              marginBottom: '20px',
              width: '100%'
            }}>
              {(provider?.info.configValues || providerInfo[selectedProviderType as ProviderType]?.configValues || []).map(configValue => (
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
                      type={configValue.secret ? (showPassword ? "text" : "password") : "text"}
                      value={config[configValue.key] || ''}
                      onChange={(e) => setConfig({ ...config, [configValue.key]: e.target.value })}
                      className="form-control"
                      placeholder={configValue.hint || `Enter ${configValue.caption || configValue.key}`}
                      required={configValue.required}
                      aria-label={configValue.hint || `Enter ${configValue.caption || configValue.key}`}
                    />
                    {configValue.secret && (
                      <button
                        type="button"
                        className="password-toggle-button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        title={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    )}
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

interface ModelListProps {
  provider: Provider;
}

const ModelList: React.FC<ModelListProps> = ({ provider }) => {
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const validateConfig = async () => {
      try {
        // Get the current config for the provider from the agent
        const providerType = provider.id as ProviderType;
        
        // Build the config object from individual settings
        const config: Record<string, string> = {};
        if (provider.info.configValues) {
          for (const configValue of provider.info.configValues) {
            const value = await window.api.getProviderConfig(providerType, configValue.key);
            if (value !== null) {
              config[configValue.key] = value;
            }
          }
        }
        
        const result = await window.api.validateProviderConfig(providerType, config);
        setIsValid(result.isValid);
        setError(result.error || null);
      } catch (err) {
        setIsValid(false);
        setError('Failed to validate configuration');
      }
    };
    validateConfig();
  }, [provider.id]);

  if (isValid === null) {
    return <div className="loading">Validating configuration...</div>;
  }

  if (!isValid) {
    return (
      <div className="config-error">
        <p style={{ color: '#dc3545' }}>Configuration Error: {error}</p>
        <p>Please configure the provider settings before viewing available models.</p>
      </div>
    );
  }

  return (
    <ul>
      {provider.models.map((model) => (
        <li key={model.id} className="model-item">
          <div className="model-name">{model.name}</div>
          {model.id !== model.name && <div className="model-id">{model.id}</div>}
          {model.description && <div className="model-description">{model.description}</div>}
        </li>
      ))}
    </ul>
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
        const providersWithModels = await Promise.all(
          installedProviders
            .sort((a, b) => a.localeCompare(b))
            .map(async (provider: ProviderType) => {
              const models = await window.api.getModelsForProvider(provider);
              const info = await window.api.getProviderInfo(provider);
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

  const handleSaveProvider = async (config: Record<string, string>, newProviderId?: string) => {
    try {
      if (editingProvider) {
        // Update existing provider with new config
        const providerType = editingProvider.id as ProviderType;
        await window.api.addProvider(providerType, config);
      }
      // Refresh the providers list
      const installedProviders = await window.api.getInstalledProviders();
      const providersWithModels = await Promise.all(
        installedProviders
          .sort((a, b) => a.localeCompare(b))
          .map(async (provider: ProviderType) => {
            const models = await window.api.getModelsForProvider(provider);
            const info = await window.api.getProviderInfo(provider);
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
      
      // If this was a new provider, select it
      if (newProviderId) {
        handleProviderSelect(newProviderId);
      }
    } catch (error) {
      log.error('Error saving provider:', error);
      throw error;
    }
  };

  const handleRemoveProvider = async (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (confirm(`Are you sure you want to remove the ${provider?.info.name} provider? This will also remove all associated models.`)) {
      try {
        await window.api.removeProvider(providerId as ProviderType);
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
    <div className="tab-items-container">
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
          <div className="sidebar">
            <div className="sidebar-header">
              <h2>Providers</h2>
              <button className="btn add-button" onClick={handleAddProvider}>Add</button>
            </div>
            <div className="tab-items-list">
              {loading ? (
                <div className="loading">Loading providers...</div>
              ) : (
                <>
                  <div 
                    className={`tab-items-item ${tabState.mode === 'about' ? 'selected' : ''}`}
                    onClick={() => {
                      setTabState({ mode: 'about' });
                      setSelectedProvider(null);
                    }}
                  >
                    <span className="info-icon">ℹ️</span>
                    <span>About Providers</span>
                  </div>
                  {providers.map((provider) => (
                    <div
                      key={provider.id}
                      className={`tab-items-item ${selectedProvider === provider.id ? 'selected' : ''}`}
                      onClick={() => handleProviderSelect(provider.id)}
                    >
                      <img 
                        src={providerLogos[provider.id as ProviderType]} 
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
                      Providers are the AI services that power your agent. Each provider offers different models
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
                          src={providerLogos[provider.id as ProviderType]} 
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
                        <ModelList provider={provider} />
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