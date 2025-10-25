import { loadAgent } from '../runtime.js';
import { Logger } from '../types/common.js';
import { SupervisorConfig } from '../types/supervision.js';

/**
 * Example of how to configure supervisors in an agent's JSON configuration
 */
export async function supervisorConfigExample(logger: Logger) {
  // Load an agent that has supervisors configured in its JSON file
  const agent = await loadAgent('./my-agent-with-supervisors', logger);
  
  // The supervisors are automatically loaded from the agent's configuration
  const supervisors = agent.getAllSupervisors();
  logger.info(`Loaded ${supervisors.length} supervisors from configuration`);
  
  // Get the supervisor configurations (read-only access)
  const supervisorConfigs = agent.getSupervisorConfigs();
  for (const config of supervisorConfigs) {
    logger.info(`Supervisor: ${config.name} (${config.type})`);
  }
  
  // Create a chat session - supervision will be automatically applied
  const session = agent.createChatSession('supervised-session');
  
  // The supervisors are already registered and will process messages
  const result = await session.handleMessage('Hello, how can you help me?');
  logger.info('Message processed with supervision');
}

/**
 * Example agent configuration JSON with supervisors:
 * 
 * {
 *   "metadata": {
 *     "name": "My Agent",
 *     "description": "An agent with supervisors",
 *     "created": "2024-01-01T00:00:00Z",
 *     "lastAccessed": "2024-01-01T00:00:00Z"
 *   },
 *   "settings": {
 *     "maxChatTurns": "50",
 *     "maxOutputTokens": "4000",
 *     "temperature": "0.7",
 *     "topP": "0.9"
 *   },
 *   "supervisors": [
 *     {
 *       "type": "agent",
 *       "id": "architect-supervisor",
 *       "name": "Conversation Architect",
 *       "config": {
 *         "agentPath": "./supervisors/architect-agent",
 *         "allowedActions": ["READ_ONLY", "MODIFY_CONTEXT"],
 *         "maxModifications": 5,
 *         "fallbackBehavior": "allow"
 *       }
 *     },
 *     {
 *       "type": "guardian",
 *       "id": "guardian-supervisor",
 *       "name": "Content Guardian",
 *       "config": {
 *         "rules": ["no profanity", "no personal info", "no harmful content"],
 *         "allowedActions": ["READ_ONLY", "MODIFY_MESSAGES"]
 *       }
 *     },
 *     {
 *       "type": "collection",
 *       "id": "collection-supervisor",
 *       "name": "Data Collector",
 *       "config": {
 *         "allowedActions": ["READ_ONLY"]
 *       }
 *     }
 *   ]
 * }
 */
