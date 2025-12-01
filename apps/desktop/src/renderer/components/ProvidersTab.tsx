import React, { useEffect, useState } from 'react';
import { TabProps } from '../types/TabProps';
import { TabState, TabMode } from '../types/TabState';
import { ProviderId } from '@tsagent/core';
import type { ProviderInfo as LLMProviderInfo, ProviderModel as ILLMModel } from '@tsagent/core';
import { AboutView } from './AboutView';
import { OnePasswordBrowserModal } from './OnePasswordBrowserModal';
import log from 'electron-log';

// Import provider logos
import './ProvidersTab.css';
import { ProviderIcon } from './ProviderIcon';

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

type SecretSource = 'direct' | 'env' | '1password';

const EditProviderModal: React.FC<EditProviderModalProps> = ({ provider, onSave, onCancel, installedProviders }) => {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [secretSources, setSecretSources] = useState<Record<string, SecretSource>>({});
  const [error, setError] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<ProviderId | null>(null);
  const [providerInfo, setProviderInfo] = useState<Record<string, LLMProviderInfo>>({});
  const [isSelectingProvider, setIsSelectingProvider] = useState(!provider);
  const [showPassword, setShowPassword] = useState(false);
  const [show1PasswordModal, setShow1PasswordModal] = useState<string | null>(null); // key of field showing modal
  const [is1PasswordAvailable, setIs1PasswordAvailable] = useState(false);

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
    // Check if 1Password is available (check for environment variables)
    const check1Password = async () => {
      try {
        const available = await window.api.is1PasswordAvailable();
        setIs1PasswordAvailable(available);
        log.info(`[ProvidersTab] 1Password availability: ${available}`);
      } catch (error) {
        log.error(`[ProvidersTab] Failed to check 1Password availability:`, error);
        setIs1PasswordAvailable(false);
      }
    };
    check1Password();
  }, []);

  useEffect(() => {
    if (provider) {
      // Initialize config with any existing values
      const loadConfig = async () => {
      const initialConfig: Record<string, string> = {};
        const initialSecretSources: Record<string, SecretSource> = {};
        
        for (const configValue of provider.info.configValues || []) {
          const needsSecretResolution = configValue.secret || (configValue as any).credential;
          const value = await window.api.getProviderConfig(provider.id as ProviderId, configValue.key);
          if (value !== null) {
            // Check if value is an env:// or op:// reference
            if (needsSecretResolution && value.startsWith('env://')) {
              initialSecretSources[configValue.key] = 'env';
              // Strip env:// prefix for display
              initialConfig[configValue.key] = value.substring(6);
            } else if (needsSecretResolution && value.startsWith('op://')) {
              initialSecretSources[configValue.key] = '1password';
              // Keep op:// reference for display (read-only)
              initialConfig[configValue.key] = value;
            } else {
              if (needsSecretResolution) {
                initialSecretSources[configValue.key] = 'direct';
              }
              initialConfig[configValue.key] = value;
            }
          } else {
            // Default to direct for fields that need secret resolution
            if (needsSecretResolution) {
              initialSecretSources[configValue.key] = 'direct';
            }
          }
        }
        
      setConfig(initialConfig);
        setSecretSources(initialSecretSources);
      };
      loadConfig();
    }
  }, [provider]);

  const handleSave = async () => {
    setError(null);
    try {
      // Build config with proper prefixes based on secret source selection
      const configToSave: Record<string, string> = {};
      const providerType = provider?.id as ProviderId || selectedProviderId;
      const configValues = provider?.info.configValues || providerInfo[providerType as ProviderId]?.configValues || [];
      
      for (const configValue of configValues) {
        const value = config[configValue.key] || '';
        const source = secretSources[configValue.key] || 'direct';
        
        const needsSecretResolution = configValue.secret || (configValue as any).credential;
        if (needsSecretResolution && source === 'env') {
          // Add env:// prefix for environment variable references
          configToSave[configValue.key] = `env://${value}`;
        } else if (needsSecretResolution && source === '1password') {
          // 1Password reference, save as-is (already has op:// prefix)
          configToSave[configValue.key] = value;
        } else {
          // Direct value, save as-is
          configToSave[configValue.key] = value;
        }
      }
      
      if (!provider && selectedProviderId) {
        // Adding a new provider - validate config first
        const validation = await window.api.validateProviderConfig(selectedProviderId, configToSave);
        if (!validation.isValid) {
          setError(validation.error || 'Invalid configuration');
          return;
        }
        // Add provider with config
        await window.api.addProvider(selectedProviderId, configToSave);
        // Close the modal after successful addition
        onSave(configToSave, selectedProviderId);
      } else if (provider) {
        // Updating existing provider - validate config first
        const providerId = provider.id as ProviderId;
        const validation = await window.api.validateProviderConfig(providerId, configToSave);
        if (!validation.isValid) {
          setError(validation.error || 'Invalid configuration');
          return;
        }
        // Update provider with new config
        await window.api.addProvider(providerId, configToSave);
        onSave(configToSave);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save provider configuration');
      return;
    }
  };

  const handleProviderSelect = (type: ProviderId) => {
    setSelectedProviderId(type);
    setIsSelectingProvider(false);
    const info = providerInfo[type];
    if (info?.configValues) {
      const initialConfig: Record<string, string> = {};
      const initialSecretSources: Record<string, SecretSource> = {};
      info.configValues.forEach(configValue => {
        initialConfig[configValue.key] = configValue.default || '';
        initialSecretSources[configValue.key] = 'direct';
      });
      setConfig(initialConfig);
      setSecretSources(initialSecretSources);
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
                    onClick={() => handleProviderSelect(type as ProviderId)}
                    style={{
                      padding: '16px',
                      border: `2px solid ${selectedProviderId === type ? '#1890ff' : '#e8e8e8'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <ProviderIcon 
                      providerType={type as ProviderId}
                      className="provider-logo"
                      alt={info.name}
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
            <ProviderIcon 
              providerType={(provider?.id || selectedProviderId) as ProviderId}
              className="provider-logo-large"
              alt={provider?.info.name || providerInfo[selectedProviderId as ProviderId]?.name}
            />
            <h3 style={{ margin: 0 }}>{provider?.info.name || providerInfo[selectedProviderId as ProviderId]?.name}</h3>
          </div>
          <p>{provider?.info.description || providerInfo[selectedProviderId as ProviderId]?.description}</p>
          {(provider?.info.website || providerInfo[selectedProviderId as ProviderId]?.website) && (
            <a 
              href="#" 
              onClick={(e) => {
                e.preventDefault();
                const website = provider?.info.website || providerInfo[selectedProviderId as ProviderId]?.website;
                if (typeof website === 'string') {
                  window.api.openExternal(website);
                }
              }}
              style={{ display: 'block', marginBottom: '24px' }}
            >
              Visit Website
            </a>
          )}

          {(provider?.info.configValues || providerInfo[selectedProviderId as ProviderId]?.configValues) && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'max-content 1fr',
              gap: '12px',
              alignItems: 'center',
              marginBottom: '20px',
              width: '100%'
            }}>
              {(provider?.info.configValues || providerInfo[selectedProviderId as ProviderId]?.configValues || []).map(configValue => {
                const isSecret = configValue.secret || false;
                const isCredential = configValue.credential || false;
                const needsSecretResolution = isSecret || isCredential;
                const secretSource = secretSources[configValue.key] || 'direct';
                const displayValue = config[configValue.key] || '';
                
                return (
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                      {needsSecretResolution && (
                        <select
                          value={secretSource}
                          onChange={(e) => {
                            const newSource = e.target.value as SecretSource;
                            setSecretSources({ ...secretSources, [configValue.key]: newSource });
                            // Clear the value when switching to 1Password (will be set by browser)
                            if (newSource === '1password') {
                              setConfig({ ...config, [configValue.key]: '' });
                            }
                          }}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            fontSize: '14px',
                            width: 'auto',
                            minWidth: 'fit-content'
                          }}
                        >
                          <option value="direct">Direct Value</option>
                          <option value="env">Environment Variable</option>
                          {is1PasswordAvailable && <option value="1password">1Password</option>}
                        </select>
                      )}
                      <div style={{ position: 'relative', flex: 1 }}>
                    <input
                          type={isSecret && secretSource === 'direct' ? (showPassword ? "text" : "password") : "text"}
                          value={displayValue}
                          onChange={(e) => {
                            // Allow editing for direct and env, but 1password is read-only (set via browser)
                            if (secretSource !== '1password') {
                              setConfig({ ...config, [configValue.key]: e.target.value });
                            }
                          }}
                      className="form-control"
                          placeholder={
                            needsSecretResolution && secretSource === 'env' 
                              ? 'VARIABLE_NAME' 
                              : needsSecretResolution && secretSource === '1password'
                              ? 'op://vault/item/field'
                              : (configValue.hint || `Enter ${configValue.caption || configValue.key}`)
                          }
                      required={configValue.required}
                      aria-label={configValue.hint || `Enter ${configValue.caption || configValue.key}`}
                          readOnly={needsSecretResolution && secretSource === '1password'}
                          style={{
                            paddingRight: needsSecretResolution && (secretSource === 'direct' || secretSource === '1password') ? '40px' : undefined,
                            backgroundColor: needsSecretResolution && secretSource === '1password' ? '#f5f5f5' : undefined,
                            cursor: needsSecretResolution && secretSource === '1password' ? 'not-allowed' : undefined
                          }}
                        />
                        {isSecret && secretSource === 'direct' && (
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                            aria-label={showPassword ? "Hide value" : "Show value"}
                            tabIndex={0}
                            style={{
                              position: 'absolute',
                              right: '8px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#666'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#333'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#666'}
                          >
                            {showPassword ? (
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-5.523 0-10-4.03-10-7 0-1.13.47-2.21 1.325-3.175M6.62 6.62A9.956 9.956 0 0112 5c5.523 0 10 4.03 10 7 0 1.13-.47 2.21-1.325 3.175M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                          </button>
                        )}
                        {needsSecretResolution && secretSource === '1password' && (
                          <button
                            type="button"
                            onClick={() => setShow1PasswordModal(configValue.key)}
                            aria-label="Browse 1Password"
                            tabIndex={0}
                            style={{
                              position: 'absolute',
                              right: '8px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#666'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#333'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#666'}
                          >
                            <svg role="img" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" height="18" width="18">
                              <title>1Password</title>
                              <path d="M36 0.021C16.119 0.021 0 16.128 0 35.997c0 19.872 16.119 35.982 36 35.982S72 55.869 72 36C72 16.128 55.881 0.021 36 0.021Zm-2.685 14.571000000000002h5.364c1.452 0 2.187 0.006 2.742 0.28800000000000003a2.58 2.58 0 0 1 1.131 1.131c0.28200000000000003 0.5549999999999999 0.28500000000000003 1.284 0.28500000000000003 2.736v18.048000000000002c0 0.36 0 0.546 -0.045 0.714a1.281 1.281 0 0 1 -0.201 0.41100000000000003 2.769 2.769 0 0 1 -0.522 0.486l-2.085 1.6919999999999997c-0.339 0.276 -0.51 0.41400000000000003 -0.573 0.5820000000000001a0.648 0.648 0 0 0 0 0.44999999999999996c0.06 0.165 0.23399999999999999 0.30300000000000005 0.573 0.579l2.085 1.6949999999999998c0.28200000000000003 0.22799999999999998 0.42000000000000004 0.34500000000000003 0.522 0.486 0.09 0.126 0.159 0.261 0.201 0.41100000000000003a2.8080000000000003 2.8080000000000003 0 0 1 0.045 0.714v8.238c0 1.452 -0.003 2.181 -0.28500000000000003 2.736a2.58 2.58 0 0 1 -1.131 1.131c-0.5549999999999999 0.28200000000000003 -1.29 0.28800000000000003 -2.742 0.28800000000000003h-5.364c-1.452 0 -2.178 -0.006 -2.736 -0.28800000000000003a2.58 2.58 0 0 1 -1.131 -1.131c-0.28200000000000003 -0.5549999999999999 -0.28500000000000003 -1.284 -0.28500000000000003 -2.736v-18.048000000000002c0 -0.36 0 -0.546 0.045 -0.714a1.311 1.311 0 0 1 0.201 -0.41700000000000004c0.10200000000000001 -0.14100000000000001 0.24 -0.249 0.522 -0.48l2.085 -1.6919999999999997c0.339 -0.276 0.51 -0.41400000000000003 0.573 -0.5820000000000001a0.648 0.648 0 0 0 0 -0.44999999999999996c-0.06 -0.165 -0.23399999999999999 -0.30300000000000005 -0.573 -0.579l-2.085 -1.6949999999999998a2.7600000000000002 2.7600000000000002 0 0 1 -0.522 -0.486 1.311 1.311 0 0 1 -0.201 -0.41700000000000004 2.7600000000000002 2.7600000000000002 0 0 1 -0.045 -0.708V18.75c0 -1.452 0.003 -2.181 0.28500000000000003 -2.736a2.58 2.58 0 0 1 1.131 -1.131c0.558 -0.28200000000000003 1.284 -0.28800000000000003 2.736 -0.28800000000000003z" fill="currentColor" strokeWidth="3"></path>
                            </svg>
                      </button>
                    )}
                      </div>
                  </div>
                </React.Fragment>
                );
              })}
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

      {/* 1Password Browser Modal */}
      {show1PasswordModal && (
        <OnePasswordBrowserModal
          isOpen={true}
          onClose={() => setShow1PasswordModal(null)}
          onSelect={(opReference) => {
            setConfig({ ...config, [show1PasswordModal]: opReference });
            setShow1PasswordModal(null);
          }}
        />
      )}
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
        const providerType = provider.id as ProviderId;
        
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
            .map(async (provider: ProviderId) => {
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
        const providerType = editingProvider.id as ProviderId;
        await window.api.addProvider(providerType, config);
      }
      // Refresh the providers list
      const installedProviders = await window.api.getInstalledProviders();
      const providersWithModels = await Promise.all(
        installedProviders
          .sort((a, b) => a.localeCompare(b))
          .map(async (provider: ProviderId) => {
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
        await window.api.removeProvider(providerId as ProviderId);
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
                      <ProviderIcon 
                        providerType={provider.id as ProviderId}
                        className="provider-logo"
                        alt={provider.info.name}
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
                        <ProviderIcon 
                          providerType={provider.id as ProviderId}
                          className="provider-logo-large"
                          alt={provider.info.name}
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