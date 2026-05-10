import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { Provider, ProviderModel, ProviderId } from './types.js';

export abstract class BaseProvider<ConfigType> implements Provider {
  protected readonly config: ConfigType;
  protected readonly modelName: string;
  protected readonly agent: Agent;
  protected readonly logger: Logger;
  protected readonly providerId: ProviderId;
  
  constructor(
    modelName: string,
    agent: Agent,
    logger: Logger,
    config: ConfigType,
    providerId: ProviderId
  ) {
    this.modelName = modelName;
    this.agent = agent;
    this.logger = logger;
    this.config = config;
    this.providerId = providerId;
  }
  
  abstract getModels(): Promise<ProviderModel[]>;
}

