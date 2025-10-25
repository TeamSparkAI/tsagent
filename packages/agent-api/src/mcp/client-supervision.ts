import { Tool } from "@modelcontextprotocol/sdk/types.js";

import { CallToolResultWithElapsedTime, McpClient } from "./types.js";
import { Logger } from '../types/common.js';
import { ChatSession } from "../types/chat.js";
import { Rule } from "../types/rules.js";
import { Reference } from "../types/references.js";
import { Agent } from "../types/agent.js";

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

    async callTool(tool: Tool, args?: Record<string, unknown>, session?: ChatSession): Promise<CallToolResultWithElapsedTime> {
        const startTime = Date.now();
        
        if (!this.supervisedSession) {
            throw new Error("No supervised session set. Call setSupervisedSession() first.");
        }

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
                    result = this.getSupervisedSessionTools();
                    break;
                case "supervised_get_session_stats":
                    result = this.getSupervisedSessionStats();
                    break;
                
                // Rules Management Tools
                case "supervised_listRules":
                    result = this.listSupervisedRules();
                    break;
                case "supervised_getRule":
                    result = this.getSupervisedRule(args?.name as string);
                    break;
                case "supervised_createRule":
                    result = this.createSupervisedRule(args);
                    break;
                case "supervised_updateRule":
                    result = this.updateSupervisedRule(args);
                    break;
                case "supervised_deleteRule":
                    result = this.deleteSupervisedRule(args?.name as string);
                    break;
                case "supervised_includeRule":
                    result = this.includeSupervisedRule(args?.name as string);
                    break;
                case "supervised_excludeRule":
                    result = this.excludeSupervisedRule(args?.name as string);
                    break;
                
                // References Management Tools
                case "supervised_listReferences":
                    result = this.listSupervisedReferences();
                    break;
                case "supervised_getReference":
                    result = this.getSupervisedReference(args?.name as string);
                    break;
                case "supervised_createReference":
                    result = this.createSupervisedReference(args);
                    break;
                case "supervised_updateReference":
                    result = this.updateSupervisedReference(args);
                    break;
                case "supervised_deleteReference":
                    result = this.deleteSupervisedReference(args?.name as string);
                    break;
                case "supervised_includeReference":
                    result = this.includeSupervisedReference(args?.name as string);
                    break;
                case "supervised_excludeReference":
                    result = this.excludeSupervisedReference(args?.name as string);
                    break;
                
                // Tool Context Management Tools
                case "supervised_listTools":
                    result = this.listSupervisedTools();
                    break;
                case "supervised_getTool":
                    result = this.getSupervisedTool(args?.serverName as string, args?.toolName as string);
                    break;
                case "supervised_listContextTools":
                    result = this.listSupervisedContextTools();
                    break;
                case "supervised_includeTool":
                    result = this.includeSupervisedTool(args?.serverName as string, args?.toolName as string);
                    break;
                case "supervised_excludeTool":
                    result = this.excludeSupervisedTool(args?.serverName as string, args?.toolName as string);
                    break;
                case "supervised_setToolIncludeMode":
                    result = this.setSupervisedToolIncludeMode(args?.serverName as string, args?.toolName as string, args?.mode as string);
                    break;
                case "supervised_listToolServers":
                    result = this.listSupervisedToolServers();
                    break;
                case "supervised_getToolServer":
                    result = this.getSupervisedToolServer(args?.serverName as string);
                    break;
                case "supervised_setServerIncludeMode":
                    result = this.setSupervisedServerIncludeMode(args?.serverName as string, args?.mode as string);
                    break;
                case "supervised_includeToolServer":
                    result = this.includeSupervisedToolServer(args?.serverName as string);
                    break;
                case "supervised_excludeToolServer":
                    result = this.excludeSupervisedToolServer(args?.serverName as string);
                    break;
                
                // Supervision Tools
                case "supervised_block_message":
                    result = this.blockMessage(args?.reason as string);
                    break;
                case "supervised_modify_message":
                    result = this.modifyMessage(args?.content as string, args?.reason as string);
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

    // Data Access Methods
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

    private getSupervisedSessionTools(): any {
        // TODO: Implement getting available tools from supervised session
        return { tools: [] };
    }

    private getSupervisedSessionStats(): any {
        if (!this.supervisedSession) return null;
        
        const state = this.supervisedSession.getState();
        return {
            sessionId: this.supervisedSession.id,
            messageCount: state.messages.length,
            ruleCount: state.rules.length,
            referenceCount: state.references.length,
            // Add more stats as needed
        };
    }

    // Rules Management Methods
    private listSupervisedRules(): any {
        if (!this.supervisedSession) return [];
        const state = this.supervisedSession.getState();
        return state.rules;
    }

    private getSupervisedRule(name: string): any {
        if (!this.supervisedSession) return null;
        // TODO: Implement getting specific rule
        return null;
    }

    private createSupervisedRule(args: any): any {
        if (!this.supervisedSession) return null;
        // TODO: Implement creating rule in supervised agent
        return { success: true, message: "Rule created" };
    }

    private updateSupervisedRule(args: any): any {
        if (!this.supervisedSession) return null;
        // TODO: Implement updating rule in supervised agent
        return { success: true, message: "Rule updated" };
    }

    private deleteSupervisedRule(name: string): any {
        if (!this.supervisedSession) return null;
        // TODO: Implement deleting rule from supervised agent
        return { success: true, message: "Rule deleted" };
    }

    private includeSupervisedRule(name: string): any {
        if (!this.supervisedSession) return null;
        // TODO: Implement including rule in supervised session
        return { success: true, message: "Rule included" };
    }

    private excludeSupervisedRule(name: string): any {
        if (!this.supervisedSession) return null;
        // TODO: Implement excluding rule from supervised session
        return { success: true, message: "Rule excluded" };
    }

    // References Management Methods
    private listSupervisedReferences(): any {
        if (!this.supervisedSession) return [];
        const state = this.supervisedSession.getState();
        return state.references;
    }

    private getSupervisedReference(name: string): any {
        if (!this.supervisedSession) return null;
        // TODO: Implement getting specific reference
        return null;
    }

    private createSupervisedReference(args: any): any {
        if (!this.supervisedSession) return null;
        // TODO: Implement creating reference in supervised agent
        return { success: true, message: "Reference created" };
    }

    private updateSupervisedReference(args: any): any {
        if (!this.supervisedSession) return null;
        // TODO: Implement updating reference in supervised agent
        return { success: true, message: "Reference updated" };
    }

    private deleteSupervisedReference(name: string): any {
        if (!this.supervisedSession) return null;
        // TODO: Implement deleting reference from supervised agent
        return { success: true, message: "Reference deleted" };
    }

    private includeSupervisedReference(name: string): any {
        if (!this.supervisedSession) return null;
        // TODO: Implement including reference in supervised session
        return { success: true, message: "Reference included" };
    }

    private excludeSupervisedReference(name: string): any {
        if (!this.supervisedSession) return null;
        // TODO: Implement excluding reference from supervised session
        return { success: true, message: "Reference excluded" };
    }

    // Tool Context Management Methods
    private listSupervisedTools(): any {
        // TODO: Implement getting available tools from supervised agent
        return { tools: [] };
    }

    private getSupervisedTool(serverName: string, toolName: string): any {
        // TODO: Implement getting specific tool from supervised agent
        return null;
    }

    private listSupervisedContextTools(): any {
        // TODO: Implement getting tools in context from supervised session
        return { tools: [] };
    }

    private includeSupervisedTool(serverName: string, toolName: string): any {
        // TODO: Implement including tool in supervised session context
        return { success: true, message: "Tool included" };
    }

    private excludeSupervisedTool(serverName: string, toolName: string): any {
        // TODO: Implement excluding tool from supervised session context
        return { success: true, message: "Tool excluded" };
    }

    private setSupervisedToolIncludeMode(serverName: string, toolName: string, mode: string): any {
        // TODO: Implement setting tool include mode in supervised agent
        return { success: true, message: "Tool include mode set" };
    }

    private listSupervisedToolServers(): any {
        // TODO: Implement listing tool servers from supervised agent
        return { servers: [] };
    }

    private getSupervisedToolServer(serverName: string): any {
        // TODO: Implement getting tool server information from supervised agent
        return null;
    }

    private setSupervisedServerIncludeMode(serverName: string, mode: string): any {
        // TODO: Implement setting server include mode in supervised agent
        return { success: true, message: "Server include mode set" };
    }

    private includeSupervisedToolServer(serverName: string): any {
        // TODO: Implement including tool server in supervised session context
        return { success: true, message: "Tool server included" };
    }

    private excludeSupervisedToolServer(serverName: string): any {
        // TODO: Implement excluding tool server from supervised session context
        return { success: true, message: "Tool server excluded" };
    }

    // Supervision Methods
    private blockMessage(reason: string): any {
        // TODO: Implement blocking message
        return { success: true, message: "Message blocked", reason };
    }

    private modifyMessage(content: string, reason: string): any {
        // TODO: Implement modifying message
        return { success: true, message: "Message modified", content, reason };
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
