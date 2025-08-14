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
    const providers = this.agent.getWorkspaceProviders();
    return providers?.[provider] !== undefined;
  }

  async add(provider: string): Promise<void> {
    const providers = this.agent.getWorkspaceProviders() || {};
    providers[provider] = {};
    await this.agent.updateWorkspaceProviders(providers);
    
    // Emit change event
    this.emit('providersChanged');
  }

  async remove(provider: string): Promise<void> {
    const providers = this.agent.getWorkspaceProviders();
    if (!providers || !providers[provider]) return;
    
    delete providers[provider];
    await this.agent.updateWorkspaceProviders(providers);
    
    // Emit change event
    this.emit('providersChanged');
  }

  getAll(): string[] {
    const providers = this.agent.getWorkspaceProviders();
    return providers ? Object.keys(providers) : [];
  }

  getSetting(provider: string, key: string): string | null {
    const providers = this.agent.getWorkspaceProviders();
    return providers?.[provider]?.[key] || null;
  }

  async setSetting(provider: string, key: string, value: string): Promise<void> {
    const providers = this.agent.getWorkspaceProviders() || {};
    
    if (!providers[provider]) {
      providers[provider] = {};
    }

    providers[provider][key] = value;
    await this.agent.updateWorkspaceProviders(providers);
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
