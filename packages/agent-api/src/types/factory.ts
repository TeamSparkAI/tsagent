import { Agent, AgentConfig } from './agent';
import { Logger } from './common';

// Factory interface
export interface AgentFactory {
  createAgent(agentPath: string, logger: Logger, data?: Partial<AgentConfig>): Promise<Agent>;
  loadAgent(agentPath: string, logger: Logger): Promise<Agent>;
  agentExists(agentPath: string): Promise<boolean>;
  cloneAgent(sourcePath: string, targetPath: string, logger: Logger): Promise<Agent>;
}
