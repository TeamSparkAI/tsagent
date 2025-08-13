import { EventEmitter } from 'events';
import { ProvidersManager as IProvidersManager } from './types';
import { Agent, Logger } from '../types';
import { ProviderType, ProviderModel } from '../providers/types';
import { ProviderFactory } from '../providers/provider-factory';

export class ProvidersManager extends EventEmitter implements IProvidersManager {
  private agent: Agent;
  private providerFactory: ProviderFactory;

  constructor(agent: Agent, private logger: Logger) {
    super();
    this.agent = agent;
    this.providerFactory = new ProviderFactory(agent, logger);
  }

  isInstalled(provider: string): boolean {
    const providers = this.agent.getSetting('providers');
    if (!providers) return false;
    
    try {
      const providersObj = JSON.parse(providers);
      return providersObj[provider] !== undefined;
    } catch {
      return false;
    }
  }

  async add(provider: string): Promise<void> {
    const providers = this.agent.getSetting('providers');
    let providersObj: Record<string, any> = {};
    
    if (providers) {
      try {
        providersObj = JSON.parse(providers);
      } catch {
        providersObj = {};
      }
    }
    
    providersObj[provider] = {};
    await this.agent.setSetting('providers', JSON.stringify(providersObj));
    
    // Emit change event
    this.emit('providersChanged');
  }

  async remove(provider: string): Promise<void> {
    const providers = this.agent.getSetting('providers');
    if (!providers) return;
    
    try {
      const providersObj = JSON.parse(providers);
      if (providersObj[provider]) {
        delete providersObj[provider];
        await this.agent.setSetting('providers', JSON.stringify(providersObj));
        
        // Emit change event
        this.emit('providersChanged');
      }
    } catch {
      // Invalid JSON, ignore
    }
  }

  getAll(): string[] {
    const providers = this.agent.getSetting('providers');
    if (!providers) return [];
    
    try {
      const providersObj = JSON.parse(providers);
      return Object.keys(providersObj);
    } catch {
      return [];
    }
  }

  getSetting(provider: string, key: string): string | null {
    const providers = this.agent.getSetting('providers');
    if (!providers) return null;
    
    try {
      const providersObj = JSON.parse(providers);
      return providersObj[provider]?.[key] || null;
    } catch {
      return null;
    }
  }

  async setSetting(provider: string, key: string, value: string): Promise<void> {
    const providers = this.agent.getSetting('providers');
    let providersObj: Record<string, any> = {};
    
    if (providers) {
      try {
        providersObj = JSON.parse(providers);
      } catch {
        providersObj = {};
      }
    }

    if (!providersObj[provider]) {
      providersObj[provider] = {};
    }

    providersObj[provider][key] = value;
    await this.agent.setSetting('providers', JSON.stringify(providersObj));
  }

  // New methods for provider functionality
  getProvidersInfo() {
    return this.providerFactory.getProvidersInfo();
  }

  getProviderTypeByName(name: string): ProviderType | null {
    return this.providerFactory.getProviderTypeByName(name);
  }

  async validateProviderConfiguration(provider: string): Promise<{ isValid: boolean, error?: string }> {
    const providerType = this.getProviderTypeByName(provider);
    if (!providerType) {
      return { isValid: false, error: `Unknown provider: ${provider}` };
    }
    return this.providerFactory.validateConfiguration(providerType);
  }

  createProvider(provider: string, modelId?: string) {
    const providerType = this.getProviderTypeByName(provider);
    if (!providerType) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    return this.providerFactory.create(providerType, modelId);
  }

  async getModels(provider: string): Promise<ProviderModel[]> {
    const providerType = this.getProviderTypeByName(provider);
    if (!providerType) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    const providerInstance = this.createProvider(provider);
    return providerInstance.getModels();
  }
}
