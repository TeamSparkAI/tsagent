import React, { useEffect, useState } from 'react';
import { TabProps } from '../types/TabProps';
import { TabState, TabMode } from '../types/TabState';
import { LLMType, LLMProviderInfo, ILLMModel } from '../../shared/llm';
import { AboutView } from './AboutView';
import log from 'electron-log';

import './ProvidersTab.css';

interface Provider {
  id: string;
  name: string;
  models: ILLMModel[];
  info: LLMProviderInfo;
}

export const ProvidersTab: React.FC<TabProps> = ({ id, activeTabId, name, type }) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabState, setTabState] = useState<TabState>({ mode: 'about' });
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

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

  const handleAddProvider = async () => {
    // TODO: Implement add provider dialog
    log.info('Add provider clicked');
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
                    <h3>{provider.info.name}</h3>
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
    </div>
  );
}; 