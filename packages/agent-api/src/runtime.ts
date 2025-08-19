// Runtime exports (not pure JS, requires node.js runtime)

import type { Logger } from './types/common';
import type { AgentConfig, Agent } from './types/agent';
import { FileBasedAgentFactory } from './core/agent-api';
import { FileBasedAgentStrategy } from './core/agent-strategy';

// Factory functions
export const createAgent = async (path: string, logger: Logger, data?: Partial<AgentConfig>): Promise<Agent> => FileBasedAgentFactory.createAgent(path, logger, data);
export const loadAgent = async (path: string, logger: Logger): Promise<Agent> => FileBasedAgentFactory.loadAgent(path, logger);
export const cloneAgent = async (sourcePath: string, targetPath: string, logger: Logger): Promise<Agent> => FileBasedAgentFactory.cloneAgent(sourcePath, targetPath, logger);
export const agentExists = async (path: string): Promise<boolean> => FileBasedAgentStrategy.agentExists(path);
