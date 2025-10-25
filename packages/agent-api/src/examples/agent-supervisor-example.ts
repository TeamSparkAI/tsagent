import { AgentSupervisor, AgentSupervisorConfig } from '../supervisors/agent-supervisor.js';
import { SupervisionManagerImpl as SupervisionManager } from '../managers/supervision-manager.js';
import { SupervisionPermission } from '../types/supervision.js';
import { Logger } from '../types/common.js';

/**
 * Example of how to create and use an AgentSupervisor
 */
export async function createAgentSupervisorExample(logger: Logger): Promise<AgentSupervisor> {
  // Configuration for the supervisor agent
  const config: AgentSupervisorConfig = {
    systemPrompt: `You are an architect supervisor agent. Your role is to:
1. Analyze conversations between users and the supervised agent
2. Identify opportunities to improve the supervised agent's performance
3. Create or modify rules and references to enhance the agent's capabilities
4. Ensure the supervised agent follows best practices

You have access to tools that allow you to:
- View conversation history
- Access current rules and references
- Modify the supervised agent's context
- Block or modify messages if necessary

Use these tools responsibly and only make changes that will genuinely improve the supervised agent's performance.`,
    
    tools: [
      // Data Access Tools
      'supervised_get_conversation_history',
      'supervised_get_current_rules',
      'supervised_get_current_references',
      'supervised_get_available_tools',
      'supervised_get_session_stats',
      
      // Rules Management Tools
      'supervised_listRules',
      'supervised_createRule',
      'supervised_getRule',
      'supervised_updateRule',
      'supervised_deleteRule',
      'supervised_includeRule',
      'supervised_excludeRule',
      
      // References Management Tools
      'supervised_listReferences',
      'supervised_createReference',
      'supervised_getReference',
      'supervised_updateReference',
      'supervised_deleteReference',
      'supervised_includeReference',
      'supervised_excludeReference',
      
      // Supervision Tools
      'supervised_block_message',
      'supervised_modify_message',
      'supervised_allow_message',
      'supervised_request_human_review'
    ],
    
    allowedActions: [
      SupervisionPermission.READ_ONLY,
      SupervisionPermission.MODIFY_CONTEXT,
      SupervisionPermission.MODIFY_MESSAGES
    ]
  };
  
  // Create the agent supervisor
  const supervisor = new AgentSupervisor(
    '/path/to/supervisor/agent', // Path to the supervisor agent
    config,
    logger
  );
  
  return supervisor;
}

/**
 * Example of how to integrate an AgentSupervisor with SupervisionManager
 */
export async function integrateWithSupervisionManager(
  supervisor: AgentSupervisor,
  supervisionManager: SupervisionManager,
  sessionId: string,
  logger: Logger
): Promise<void> {
  // Add the supervisor to the supervision manager
  await supervisionManager.addSupervisor(supervisor);
  
  // Register the supervisor for a specific session
  await supervisionManager.registerSupervisor(sessionId, supervisor);
  
  logger.info(`Agent supervisor ${supervisor.id} registered for session ${sessionId}`);
}

/**
 * Example of how to create a custom supervisor agent configuration
 */
export function createCustomSupervisorConfig(): AgentSupervisorConfig {
  return {
    systemPrompt: `You are a guardian supervisor agent. Your role is to:
1. Monitor conversations for inappropriate content
2. Block messages that violate safety guidelines
3. Modify messages to remove harmful content
4. Ensure the supervised agent maintains appropriate boundaries

You should be conservative in your approach and err on the side of caution when blocking content.`,
    
    tools: [
      'supervised_get_conversation_history',
      'supervised_get_current_rules'
    ],
    
    allowedActions: [
      SupervisionPermission.READ_ONLY,
      SupervisionPermission.MODIFY_MESSAGES
    ]
  };
}

/**
 * Example of how to use the supervisor in a chat session
 */
export async function useSupervisorInChatSession(
  supervisor: AgentSupervisor,
  session: any, // ChatSession
  messages: any[], // ChatMessage[]
  logger: Logger
): Promise<void> {
  try {
    // Process a request through the supervisor
    const result = await supervisor.processRequest(session, messages);
    
    if (result.action === 'block') {
      logger.info('Message blocked by supervisor:', result.reasons);
      // Handle blocked message
    } else if (result.action === 'modify') {
      logger.info('Message modified by supervisor:', result.reasons);
      // Use the modified message
      const modifiedMessage = result.finalMessage;
    } else {
      logger.info('Message allowed by supervisor');
      // Use the original message
    }
  } catch (error) {
    logger.error('Error in supervisor processing:', error);
    // Handle error - could fall back to allowing the message
  }
}
