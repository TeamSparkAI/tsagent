import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { Provider, ProviderModel } from './types.js';
import { ChatSession, ChatMessage } from '../types/chat.js';
import { ModelReply } from './types.js';

export abstract class BaseProvider<ConfigType> implements Provider {
  protected readonly config: ConfigType;
  protected readonly modelName: string;
  protected readonly agent: Agent;
  protected readonly logger: Logger;
  
  constructor(
    modelName: string,
    agent: Agent,
    logger: Logger,
    config: ConfigType
  ) {
    this.modelName = modelName;
    this.agent = agent;
    this.logger = logger;
    this.config = config;
  }
  
  // Abstract methods - must be implemented by derived classes
  abstract getModels(): Promise<ProviderModel[]>;
  abstract generateResponse(session: ChatSession, messages: ChatMessage[]): Promise<ModelReply>;
}

