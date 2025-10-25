import { Logger } from '../types/common.js';
import { loadAgent } from '../runtime.js';

/**
 * Example demonstrating supervision tools as internal MCP server
 */
export async function supervisionMcpExample(logger: Logger): Promise<void> {
    try {
        // Load a supervisor agent that has supervision tools configured
        const supervisorAgent = await loadAgent('./supervisor-agent', logger);
        
        // Get the supervision MCP client
        const supervisionClient = await supervisorAgent.getMcpClient('supervision');
        
        if (!supervisionClient) {
            logger.error('Supervision MCP client not found. Make sure the supervisor agent has supervision tools configured.');
            return;
        }
        
        logger.info('Supervision MCP client loaded successfully');
        
        // List available supervision tools
        logger.info('Available supervision tools:', supervisionClient.serverTools.map(tool => tool.name));
        
        // Example: Get supervision tools for different supervisor types
        const architectTools = supervisionClient.serverTools.filter(tool => 
            tool.name.includes('rule') || tool.name.includes('reference') || tool.name.includes('modify')
        );
        
        const guardianTools = supervisionClient.serverTools.filter(tool => 
            tool.name.includes('block') || tool.name.includes('allow') || tool.name.includes('review')
        );
        
        logger.info('Architect supervisor tools:', architectTools.map(tool => tool.name));
        logger.info('Guardian supervisor tools:', guardianTools.map(tool => tool.name));
        
    } catch (error) {
        logger.error('Error in supervision MCP example:', error);
    }
}

/**
 * Example supervisor agent configuration
 * This would be in the supervisor agent's JSON file
 */
export const exampleSupervisorAgentConfig = {
    "metadata": {
        "name": "Architect Supervisor",
        "description": "Supervises and improves other agents",
        "created": "2024-01-01T00:00:00Z",
        "lastAccessed": "2024-01-01T00:00:00Z"
    },
    "settings": {
        "maxChatTurns": "50",
        "maxOutputTokens": "4000",
        "temperature": "0.7",
        "topP": "0.9"
    },
    "mcpServers": {
        "supervision": {
            "type": "internal",
            "tool": "supervision",
            "toolInclude": {
                "serverDefault": "manual",
                "tools": {
                    // Architect supervisor focuses on rules and references
                    "supervised_listRules": "always",
                    "supervised_createRule": "always",
                    "supervised_updateRule": "always",
                    "supervised_includeRule": "always",
                    "supervised_excludeRule": "always",
                    "supervised_listReferences": "always",
                    "supervised_createReference": "always",
                    "supervised_modify_message": "always",
                    // Blocking tools not needed for architect
                    "supervised_block_message": "manual",
                    "supervised_allow_message": "manual"
                }
            }
        }
    },
    "supervisors": [
        {
            "type": "agent",
            "id": "architect-supervisor",
            "name": "Conversation Architect",
            "config": {
                "agentPath": "./supervisor-agent",
                "allowedActions": ["READ_ONLY", "MODIFY_CONTEXT"]
            }
        }
    ]
};

/**
 * Example guardian supervisor agent configuration
 */
export const exampleGuardianAgentConfig = {
    "metadata": {
        "name": "Guardian Supervisor",
        "description": "Monitors and blocks inappropriate content",
        "created": "2024-01-01T00:00:00Z",
        "lastAccessed": "2024-01-01T00:00:00Z"
    },
    "settings": {
        "maxChatTurns": "50",
        "maxOutputTokens": "4000",
        "temperature": "0.3",
        "topP": "0.9"
    },
    "mcpServers": {
        "supervision": {
            "type": "internal",
            "tool": "supervision",
            "toolInclude": {
                "serverDefault": "manual",
                "tools": {
                    // Guardian supervisor focuses on blocking and allowing
                    "supervised_block_message": "always",
                    "supervised_allow_message": "always",
                    "supervised_request_human_review": "always",
                    "supervised_listRules": "always",
                    // Modification tools not needed for guardian
                    "supervised_modify_message": "manual",
                    "supervised_createRule": "manual",
                    "supervised_createReference": "manual"
                }
            }
        }
    },
    "supervisors": [
        {
            "type": "agent",
            "id": "guardian-supervisor",
            "name": "Content Guardian",
            "config": {
                "agentPath": "./guardian-agent",
                "allowedActions": ["READ_ONLY", "MODIFY_MESSAGES"]
            }
        }
    ]
};
