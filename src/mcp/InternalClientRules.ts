import { Tool } from "@modelcontextprotocol/sdk/types";
import { Rule } from "../types/Rule";
import { CallToolResultWithElapsedTime, McpClient } from "./types";
import log from 'electron-log';
import { RulesManager } from '../state/RulesManager';

export class McpClientInternalRules implements McpClient {
    private rulesManager: RulesManager;
    serverVersion: { name: string; version: string } | null =  { name: "Rules", version: "1.0.0" };
    serverTools: Tool[] = [
        {
            name: "createRule",
            description: "Create a new rule",
            inputSchema: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Unique name for the rule"
                    },
                    description: {
                        type: "string",
                        description: "Description of what the rule does"
                    },
                    priorityLevel: {
                        type: "number",
                        description: "Priority level of the rule (000-999, higher numbers = higher priority)"
                    },
                    enabled: {
                        type: "boolean",
                        description: "Whether the rule is enabled"
                    },
                    text: {
                        type: "string",
                        description: "The actual rule text"
                    }
                },
                required: ["name", "description", "priorityLevel", "enabled", "text"]
            }
        },
        {
            name: "getRule",
            description: "Get a rule by name",
            inputSchema: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Name of the rule to retrieve"
                    }
                },
                required: ["name"]
            }
        },
        {
            name: "updateRule",
            description: "Update an existing rule",
            inputSchema: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Name of the rule to update"
                    },
                    description: {
                        type: "string",
                        description: "New description of what the rule does"
                    },
                    priorityLevel: {
                        type: "number",
                        description: "New priority level of the rule (000-999, higher numbers = higher priority)"
                    },
                    enabled: {
                        type: "boolean",
                        description: "New enabled state of the rule"
                    },
                    text: {
                        type: "string",
                        description: "New rule text"
                    }
                },
                required: ["name"]
            }
        },
        {
            name: "deleteRule",
            description: "Delete a rule by name",
            inputSchema: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Name of the rule to delete"
                    }
                },
                required: ["name"]
            }
        },
        {
            name: "listRules",
            description: "Get all rules",
            inputSchema: {
                type: "object",
                properties: {},
                required: []
            }
        }
    ];

    constructor(rulesManager: RulesManager) {
        this.rulesManager = rulesManager;
    }

    async connect(): Promise<boolean> {
        return true;
    }

    async disconnect(): Promise<void> {
        return;
    }

    async cleanup(): Promise<void> {
        return;
    }

    getErrorLog(): string[] {
        return [];
    }

    isConnected(): boolean {
        return true;
    }

    async callTool(tool: Tool, args?: Record<string, unknown>): Promise<CallToolResultWithElapsedTime> {
        const startTime = performance.now();
        
        try {
            switch (tool.name) {
                case "createRule":
                    if (!args?.name || !args?.description || !args?.priorityLevel || !args?.enabled || !args?.text) {
                        throw new Error("Missing required fields for createRule");
                    }
                    this.rulesManager.saveRule({
                        name: args.name as string,
                        description: args.description as string,
                        priorityLevel: args.priorityLevel as number,
                        enabled: args.enabled as boolean,
                        text: args.text as string
                    });
                    return {
                        content: [{ type: "text", text: `Rule "${args.name}" created successfully` }],
                        elapsedTimeMs: performance.now() - startTime
                    };

                case "getRule":
                    if (!args?.name) {
                        throw new Error("Missing name for getRule");
                    }
                    const rules = this.rulesManager.getRules();
                    const rule = rules.find((r: Rule) => r.name === args.name);
                    if (!rule) {
                        throw new Error(`Rule "${args.name}" not found`);
                    }
                    return {
                        content: [{ type: "text", text: JSON.stringify(rule, null, 2) }],
                        elapsedTimeMs: performance.now() - startTime
                    };

                case "updateRule":
                    if (!args?.name) {
                        throw new Error("Missing name for updateRule");
                    }
                    const existingRules = await this.rulesManager.getRules();
                    const existingRule = existingRules.find((r: Rule) => r.name === args.name);
                    if (!existingRule) {
                        throw new Error(`Rule "${args.name}" not found`);
                    }
                    const updatedRule: Rule = {
                        ...existingRule,
                        description: args.description ? args.description as string : existingRule.description,
                        priorityLevel: args.priorityLevel ? args.priorityLevel as number : existingRule.priorityLevel,
                        enabled: args.enabled !== undefined ? args.enabled as boolean : existingRule.enabled,
                        text: args.text ? args.text as string : existingRule.text
                    };
                    this.rulesManager.saveRule(updatedRule);
                    return {
                        content: [{ type: "text", text: `Rule "${args.name}" updated successfully` }],
                        elapsedTimeMs: performance.now() - startTime
                    };

                case "deleteRule":
                    if (!args?.name) {
                        throw new Error("Missing name for deleteRule");
                    }
                    this.rulesManager.deleteRule(args.name as string);
                    return {
                        content: [{ type: "text", text: `Rule "${args.name}" deleted successfully` }],
                        elapsedTimeMs: performance.now() - startTime
                    };

                case "listRules":
                    const allRules = this.rulesManager.getRules();
                    return {
                        content: [{ type: "text", text: JSON.stringify(allRules, null, 2) }],
                        elapsedTimeMs: performance.now() - startTime
                    };

                default:
                    throw new Error(`Unknown tool: ${tool.name}`);
            }
        } catch (error) {
            log.error(`Error in callTool for ${tool.name}:`, error);
            return {
                content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
                elapsedTimeMs: performance.now() - startTime
            };
        }
    }

    async ping(): Promise<{ elapsedTimeMs: number }> {
        return { elapsedTimeMs: 0 };
    }
}