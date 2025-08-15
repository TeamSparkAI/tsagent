// Runtime exports (not pure JS, requires node.js runtime)

import { FileBasedAgent } from './core/agent-api';
import type { Logger } from './types/common';
import type { AgentConfig, Agent } from './types/agent';

// Factory functions
export const createAgent = async (path: string, logger: Logger, data?: Partial<AgentConfig>): Promise<Agent> => FileBasedAgent.createAgent(path, logger, data);
export const loadAgent = async (path: string, logger: Logger): Promise<Agent> => FileBasedAgent.loadAgent(path, logger);
export const agentExists = async (path: string): Promise<boolean> => FileBasedAgent.agentExists(path);
