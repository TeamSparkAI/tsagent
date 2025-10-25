import { Tool } from "@modelcontextprotocol/sdk/types.js";

import { CallToolResultWithElapsedTime, McpClient } from "./types.js";
import { Logger } from '../types/common.js';
import { ChatSession } from "../types/chat.js";
import { Rule } from "../types/rules.js";
import { Reference } from "../types/references.js";
import { Agent } from "../types/agent.js";

// Import shared implementation functions
import {
    validateRuleArgs,
    implementCreateRule,
    implementGetRule,
    implementUpdateRule,
    implementDeleteRule,
    implementListRules,
    implementListContextRules,
    implementIncludeRule,
    implementExcludeRule,
    type RuleArgs
} from './client-rules.js';

import {
    validateReferenceArgs,
    implementCreateReference,
    implementGetReference,
    implementUpdateReference,
    implementDeleteReference,
    implementListReferences,
    implementListContextReferences,
    implementIncludeReference,
    implementExcludeReference,
    type ReferenceArgs
} from './client-references.js';

import {
    implementListTools,
    implementGetTool,
    implementListContextTools,
    implementIncludeTool,
    implementExcludeTool,
    implementSetToolIncludeMode,
    implementListToolServers,
    implementGetToolServer,
    implementSetServerIncludeMode,
    implementIncludeToolServer,
    implementExcludeToolServer
} from './client-tools.js';

/**
 * Internal MCP client for supervision tools
 * Provides tools for supervisor agents to monitor and modify supervised agents
 */
export class McpClientInternalSupervision implements McpClient {
    private agent: Agent;
    private logger: Logger;
    private supervisedSession: ChatSession | null = null;
    
    serverVersion: { name: string; version: string } | null = { name: "Supervision", version: "1.0.0" };
    
    serverTools: Tool[] = [
        // Data Access Tools
        {
            name: "supervised_get_current_messages",
            description: "Get current messages in supervised session",
            inputSchema: {
                type: "object",
                properties: {},
                required: []
            }
        },
        {
            name: "supervised_get_current_rules",
            description: "Get currently active rules in supervised session",
            inputSchema: {
                type: "object",
                properties: {},
                required: []
            }
        },
        {
            name: "supervised_get_current_references",
            description: "Get currently active references in supervised session",
            inputSchema: {
                type: "object",
                properties: {},
                required: []
            }
        },
        {
            name: "supervised_get_available_tools",
            description: "Get available tools in supervised session",
            inputSchema: {
                type: "object",
                properties: {},
                required: []
            }
        },
        {
            name: "supervised_get_session_stats",
            description: "Get session statistics and metadata",
            inputSchema: {
                type: "object",
                properties: {},
                required: []
            }
        },
        
        // Rules Management Tools
        {
            name: "supervised_listRules",
            description: "List all available rules in the supervised agent",
            inputSchema: {
                type: "object",
                properties: {},
                required: []
            }
        },
        {
            name: "supervised_getRule",
            description: "Get a specific rule from the supervised agent",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name of the rule to get" }
                },
                required: ["name"]
            }
        },
        {
            name: "supervised_createRule",
            description: "Create a new rule in the supervised agent",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name of the rule" },
                    description: { type: "string", description: "Description of the rule" },
                    priorityLevel: { type: "number", description: "Priority level (1-10)" },
                    enabled: { type: "boolean", description: "Whether the rule is enabled" },
                    text: { type: "string", description: "Rule content" },
                    include: { type: "string", enum: ["always", "manual", "agent"], description: "Include mode" }
                },
                required: ["name", "text"]
            }
        },
        {
            name: "supervised_updateRule",
            description: "Update an existing rule in the supervised agent",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name of the rule to update" },
                    description: { type: "string", description: "New description" },
                    priorityLevel: { type: "number", description: "New priority level" },
                    enabled: { type: "boolean", description: "New enabled state" },
                    text: { type: "string", description: "New rule content" },
                    include: { type: "string", enum: ["always", "manual", "agent"], description: "New include mode" }
                },
                required: ["name"]
            }
        },
        {
            name: "supervised_deleteRule",
            description: "Delete a rule from the supervised agent",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name of the rule to delete" }
                },
                required: ["name"]
            }
        },
        {
            name: "supervised_includeRule",
            description: "Include a rule in the supervised session context",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name of the rule to include" }
                },
                required: ["name"]
            }
        },
        {
            name: "supervised_excludeRule",
            description: "Exclude a rule from the supervised session context",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name of the rule to exclude" }
                },
                required: ["name"]
            }
        },
        
        // References Management Tools
        {
            name: "supervised_listReferences",
            description: "List all available references in the supervised agent",
            inputSchema: {
                type: "object",
                properties: {},
                required: []
            }
        },
        {
            name: "supervised_getReference",
            description: "Get a specific reference from the supervised agent",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name of the reference to get" }
                },
                required: ["name"]
            }
        },
        {
            name: "supervised_createReference",
            description: "Create a new reference in the supervised agent",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name of the reference" },
                    description: { type: "string", description: "Description of the reference" },
                    priorityLevel: { type: "number", description: "Priority level (1-10)" },
                    enabled: { type: "boolean", description: "Whether the reference is enabled" },
                    text: { type: "string", description: "Reference content" },
                    include: { type: "string", enum: ["always", "manual", "agent"], description: "Include mode" }
                },
                required: ["name", "text"]
            }
        },
        {
            name: "supervised_updateReference",
            description: "Update an existing reference in the supervised agent",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name of the reference to update" },
                    description: { type: "string", description: "New description" },
                    priorityLevel: { type: "number", description: "New priority level" },
                    enabled: { type: "boolean", description: "New enabled state" },
                    text: { type: "string", description: "New reference content" },
                    include: { type: "string", enum: ["always", "manual", "agent"], description: "New include mode" }
                },
                required: ["name"]
            }
        },
        {
            name: "supervised_deleteReference",
            description: "Delete a reference from the supervised agent",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name of the reference to delete" }
                },
                required: ["name"]
            }
        },
        {
            name: "supervised_includeReference",
            description: "Include a reference in the supervised session context",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name of the reference to include" }
                },
                required: ["name"]
            }
        },
        {
            name: "supervised_excludeReference",
            description: "Exclude a reference from the supervised session context",
            inputSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Name of the reference to exclude" }
                },
                required: ["name"]
            }
        },
        
        // Tool Context Management Tools
        {
            name: "supervised_listTools",
            description: "List all available tools in the supervised agent",
            inputSchema: {
                type: "object",
                properties: {},
                required: []
            }
        },
        {
            name: "supervised_getTool",
            description: "Get a specific tool from the supervised agent",
            inputSchema: {
                type: "object",
                properties: {
                    serverName: { type: "string", description: "Name of the server containing the tool" },
                    toolName: { type: "string", description: "Name of the tool to get" }
                },
                required: ["serverName", "toolName"]
            }
        },
        {
            name: "supervised_listContextTools",
            description: "List tools currently in context in the supervised session",
            inputSchema: {
                type: "object",
                properties: {},
                required: []
            }
        },
        {
            name: "supervised_includeTool",
            description: "Include a tool in the supervised session context",
            inputSchema: {
                type: "object",
                properties: {
                    serverName: { type: "string", description: "Name of the server containing the tool" },
                    toolName: { type: "string", description: "Name of the tool to include" }
                },
                required: ["serverName", "toolName"]
            }
        },
        {
            name: "supervised_excludeTool",
            description: "Exclude a tool from the supervised session context",
            inputSchema: {
                type: "object",
                properties: {
                    serverName: { type: "string", description: "Name of the server containing the tool" },
                    toolName: { type: "string", description: "Name of the tool to exclude" }
                },
                required: ["serverName", "toolName"]
            }
        },
        {
            name: "supervised_setToolIncludeMode",
            description: "Set the context mode for a tool in the supervised agent",
            inputSchema: {
                type: "object",
                properties: {
                    serverName: { type: "string", description: "Name of the server containing the tool" },
                    toolName: { type: "string", description: "Name of the tool" },
                    mode: { type: "string", enum: ["always", "manual", "agent"], description: "Include mode" }
                },
                required: ["serverName", "toolName", "mode"]
            }
        },
        {
            name: "supervised_listToolServers",
            description: "List all available tool servers in the supervised agent",
            inputSchema: {
                type: "object",
                properties: {},
                required: []
            }
        },
        {
            name: "supervised_getToolServer",
            description: "Get information about a specific tool server in the supervised agent",
            inputSchema: {
                type: "object",
                properties: {
                    serverName: { type: "string", description: "Name of the server to get information about" }
                },
                required: ["serverName"]
            }
        },
        {
            name: "supervised_setServerIncludeMode",
            description: "Set the include mode for a tool server in the supervised agent",
            inputSchema: {
                type: "object",
                properties: {
                    serverName: { type: "string", description: "Name of the server" },
                    mode: { type: "string", enum: ["always", "manual", "agent"], description: "Include mode" }
                },
                required: ["serverName", "mode"]
            }
        },
        {
            name: "supervised_includeToolServer",
            description: "Include all tools from a server in the supervised session context",
            inputSchema: {
                type: "object",
                properties: {
                    serverName: { type: "string", description: "Name of the server to include" }
                },
                required: ["serverName"]
            }
        },
        {
            name: "supervised_excludeToolServer",
            description: "Exclude all tools from a server from the supervised session context",
            inputSchema: {
                type: "object",
                properties: {
                    serverName: { type: "string", description: "Name of the server to exclude" }
                },
                required: ["serverName"]
            }
        },
        
        // Supervision Tools
        {
            name: "supervised_block_message",
            description: "Block the current message from being processed",
            inputSchema: {
                type: "object",
                properties: {
                    reason: { type: "string", description: "Reason for blocking the message" }
                },
                required: ["reason"]
            }
        },
        {
            name: "supervised_modify_message",
            description: "Modify the current message before processing",
            inputSchema: {
                type: "object",
                properties: {
                    content: { type: "string", description: "New message content" },
                    reason: { type: "string", description: "Reason for modification" }
                },
                required: ["content", "reason"]
            }
        },
        {
            name: "supervised_modify_response",
            description: "Modify the supervised agent's response",
            inputSchema: {
                type: "object",
                properties: {
                    content: { type: "string", description: "New response content" },
                    reason: { type: "string", description: "Reason for modification" }
                },
                required: ["content", "reason"]
            }
        },
        {
            name: "supervised_allow_message",
            description: "Allow the current message to proceed unchanged",
            inputSchema: {
                type: "object",
                properties: {
                    reason: { type: "string", description: "Reason for allowing the message" }
                },
                required: ["reason"]
            }
        },
        {
            name: "supervised_request_human_review",
            description: "Request human review for the current message",
            inputSchema: {
                type: "object",
                properties: {
                    reason: { type: "string", description: "Reason for requesting human review" }
                },
                required: ["reason"]
            }
        }
    ];

    constructor(agent: Agent, logger: Logger) {
        this.agent = agent;
        this.logger = logger;
    }

    async connect(): Promise<boolean> {
        // Internal supervision client is always connected
        return true;
    }

    async disconnect(): Promise<void> {
        // Internal supervision client doesn't need disconnection
    }

    async cleanup(): Promise<void> {
        // Internal supervision client doesn't need cleanup
    }

    getErrorLog(): string[] {
        // Internal supervision client doesn't maintain error logs
        return [];
    }

    isConnected(): boolean {
        // Internal supervision client is always connected
        return true;
    }

    async ping(): Promise<{ elapsedTimeMs: number }> {
        const startTime = Date.now();
        // Internal supervision client ping
        const elapsedTime = Date.now() - startTime;
        return { elapsedTimeMs: elapsedTime };
    }

    /**
     * Set the supervised session context for this client
     */
    setSupervisedSession(session: ChatSession): void {
        this.supervisedSession = session;
    }

    /**
     * Get the supervised agent from the supervised session
     */
    private get supervisedAgent(): Agent {
        if (!this.supervisedSession) {
            throw new Error("No supervised session set");
        }
        return (this.supervisedSession as any).agent;
    }

    async callTool(tool: Tool, args?: Record<string, unknown>, session?: ChatSession): Promise<CallToolResultWithElapsedTime> {
        const startTime = Date.now();
        
        if (!this.supervisedSession) {
            throw new Error("No supervised session set. Call setSupervisedSession() first.");
        }

        const supervisedAgent = this.supervisedAgent;
        const supervisedSession = this.supervisedSession;

        try {
            let result: any;

            switch (tool.name) {
                // Data Access Tools
                case "supervised_get_current_messages":
                    result = this.getSupervisedSessionData('messages');
                    break;
                case "supervised_get_current_rules":
                    result = this.getSupervisedSessionData('rules');
                    break;
                case "supervised_get_current_references":
                    result = this.getSupervisedSessionData('references');
                    break;
                case "supervised_get_available_tools":
                    result = this.getSupervisedSessionTools(supervisedSession);
                    break;
                case "supervised_get_session_stats":
                    result = this.getSupervisedSessionStats();
                    break;
                
                // Rules Management Tools - use shared implementations
                case "supervised_listRules": {
                    result = implementListRules(supervisedAgent);
                    break;
                }
                case "supervised_getRule": {
                    const validatedArgs = validateRuleArgs(args, ["name"]);
                    result = implementGetRule(supervisedAgent, validatedArgs.name!);
                    break;
                }
                case "supervised_createRule": {
                    const validatedArgs = validateRuleArgs(args, ["name", "text"]);
                    result = await implementCreateRule(supervisedAgent, validatedArgs);
                    break;
                }
                case "supervised_updateRule": {
                    const validatedArgs = validateRuleArgs(args, ["name"]);
                    result = await implementUpdateRule(supervisedAgent, validatedArgs);
                    break;
                }
                case "supervised_deleteRule": {
                    const validatedArgs = validateRuleArgs(args, ["name"]);
                    result = await implementDeleteRule(supervisedAgent, validatedArgs.name!);
                    break;
                }
                case "supervised_includeRule": {
                    const validatedArgs = validateRuleArgs(args, ["name"]);
                    result = implementIncludeRule(supervisedSession, validatedArgs.name!);
                    break;
                }
                case "supervised_excludeRule": {
                    const validatedArgs = validateRuleArgs(args, ["name"]);
                    result = implementExcludeRule(supervisedSession, validatedArgs.name!);
                    break;
                }
                
                // References Management Tools - use shared implementations
                case "supervised_listReferences": {
                    result = implementListReferences(supervisedAgent);
                    break;
                }
                case "supervised_getReference": {
                    const validatedArgs = validateReferenceArgs(args, ["name"]);
                    result = implementGetReference(supervisedAgent, validatedArgs.name!);
                    break;
                }
                case "supervised_createReference": {
                    const validatedArgs = validateReferenceArgs(args, ["name", "text"]);
                    result = await implementCreateReference(supervisedAgent, validatedArgs);
                    break;
                }
                case "supervised_updateReference": {
                    const validatedArgs = validateReferenceArgs(args, ["name"]);
                    result = await implementUpdateReference(supervisedAgent, validatedArgs);
                    break;
                }
                case "supervised_deleteReference": {
                    const validatedArgs = validateReferenceArgs(args, ["name"]);
                    result = await implementDeleteReference(supervisedAgent, validatedArgs.name!);
                    break;
                }
                case "supervised_includeReference": {
                    const validatedArgs = validateReferenceArgs(args, ["name"]);
                    result = implementIncludeReference(supervisedSession, validatedArgs.name!);
                    break;
                }
                case "supervised_excludeReference": {
                    const validatedArgs = validateReferenceArgs(args, ["name"]);
                    result = implementExcludeReference(supervisedSession, validatedArgs.name!);
                    break;
                }
                
                // Tool Context Management Tools - use shared implementations
                case "supervised_listTools": {
                    result = await implementListTools(supervisedAgent);
                    break;
                }
                case "supervised_getTool": {
                    result = await implementGetTool(supervisedAgent, args?.serverName as string, args?.toolName as string);
                    break;
                }
                case "supervised_listContextTools": {
                    result = await implementListContextTools(supervisedSession);
                    break;
                }
                case "supervised_includeTool": {
                    result = await implementIncludeTool(supervisedSession, args?.serverName as string, args?.toolName as string);
                    break;
                }
                case "supervised_excludeTool": {
                    result = await implementExcludeTool(supervisedSession, args?.serverName as string, args?.toolName as string);
                    break;
                }
                case "supervised_setToolIncludeMode": {
                    result = await implementSetToolIncludeMode(supervisedAgent, args?.serverName as string, args?.toolName as string, args?.mode as string);
                    break;
                }
                case "supervised_listToolServers": {
                    result = await implementListToolServers(supervisedAgent);
                    break;
                }
                case "supervised_getToolServer": {
                    result = await implementGetToolServer(supervisedAgent, args?.serverName as string);
                    break;
                }
                case "supervised_setServerIncludeMode": {
                    result = await implementSetServerIncludeMode(supervisedAgent, args?.serverName as string, args?.mode as string);
                    break;
                }
                case "supervised_includeToolServer": {
                    result = await implementIncludeToolServer(supervisedAgent, supervisedSession, args?.serverName as string);
                    break;
                }
                case "supervised_excludeToolServer": {
                    result = await implementExcludeToolServer(supervisedSession, args?.serverName as string);
                    break;
                }
                
                // Supervision Methods
                case "supervised_block_message":
                    result = this.blockMessage(args?.reason as string);
                    break;
                case "supervised_modify_message":
                    result = this.modifyMessage(args?.content as string, args?.reason as string);
                    break;
                case "supervised_modify_response":
                    result = this.modifyResponse(args?.content as string, args?.reason as string);
                    break;
                case "supervised_allow_message":
                    result = this.allowMessage(args?.reason as string);
                    break;
                case "supervised_request_human_review":
                    result = this.requestHumanReview(args?.reason as string);
                    break;
                
                default:
                    throw new Error(`Unknown tool: ${tool.name}`);
            }

            const elapsedTime = Date.now() - startTime;
            return {
                content: [{ type: "text", text: JSON.stringify(result) }],
                elapsedTimeMs: elapsedTime
            };
        } catch (error) {
            const elapsedTime = Date.now() - startTime;
            this.logger.error(`Error calling supervision tool ${tool.name}:`, error);
            return {
                content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
                elapsedTimeMs: elapsedTime
            };
        }
    }

    // Data Access Methods (keep as is)
    private getSupervisedSessionData(type: 'messages' | 'rules' | 'references'): any {
        if (!this.supervisedSession) return null;
        
        const state = this.supervisedSession.getState();
        switch (type) {
            case 'messages':
                return state.messages;
            case 'rules':
                return state.rules;
            case 'references':
                return state.references;
            default:
                return null;
        }
    }

    private async getSupervisedSessionTools(session: ChatSession): Promise<any> {
        // Access agent property from ChatSessionImpl
        const agent = (session as any).agent as Agent;
        return await implementListTools(agent);
    }

    private getSupervisedSessionStats(): any {
        if (!this.supervisedSession) return null;
        
        const state = this.supervisedSession.getState();
        return {
            sessionId: this.supervisedSession.id,
            messageCount: state.messages.length,
            ruleCount: state.rules.length,
            referenceCount: state.references.length,
        };
    }

    // Supervision Methods (keep TODOs as they are agent-specific)
    private blockMessage(reason: string): any {
        // TODO: Implement blocking message
        return { success: true, message: "Message blocked", reason };
    }

    private modifyMessage(content: string, reason: string): any {
        if (!this.supervisedSession) {
            throw new Error('No supervised session bound');
        }
        
        const state = this.supervisedSession.getState();
        const messages = state.messages;
        
        if (messages.length === 0) {
            throw new Error('No messages to modify');
        }
        
        // Modify the last message in place
        const lastMessage = messages[messages.length - 1];
        
        if (typeof lastMessage === 'string') {
            // Replace string message with modified content
            (this.supervisedSession as any).messages[messages.length - 1] = content;
        } else if (lastMessage.role === 'user' || lastMessage.role === 'system' || lastMessage.role === 'error') {
            // Modify the content of the last user/system/error message
            (this.supervisedSession as any).messages[messages.length - 1] = {
                ...lastMessage,
                content: content
            };
        } else {
            throw new Error('Cannot modify message of this type');
        }
        
        return { success: true, message: "Message modified", reason };
    }
    
    private modifyResponse(content: string, reason: string): any {
        if (!this.supervisedSession) {
            throw new Error('No supervised session bound');
        }
        
        const state = this.supervisedSession.getState();
        const messages = state.messages;
        
        if (messages.length === 0) {
            throw new Error('No messages to modify');
        }
        
        // Find and modify the last assistant message
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            
            if (typeof message !== 'string' && message.role === 'assistant' && 'modelReply' in message) {
                // Modify the assistant's response content
                if (message.modelReply && message.modelReply.turns.length > 0) {
                    (this.supervisedSession as any).messages[i] = {
                        ...message,
                        modelReply: {
                            ...message.modelReply,
                            turns: [
                                {
                                    ...message.modelReply.turns[0],
                                    message: content
                                }
                            ]
                        }
                    };
                } else {
                    (this.supervisedSession as any).messages[i] = {
                        ...message,
                        modelReply: {
                            timestamp: Date.now(),
                            turns: [{ message: content }]
                        }
                    };
                }
                return { success: true, message: "Response modified", reason };
            }
        }
        
        throw new Error('No assistant message found in response to modify');
    }

    private allowMessage(reason: string): any {
        // TODO: Implement allowing message
        return { success: true, message: "Message allowed", reason };
    }

    private requestHumanReview(reason: string): any {
        // TODO: Implement requesting human review
        return { success: true, message: "Human review requested", reason };
    }
}
