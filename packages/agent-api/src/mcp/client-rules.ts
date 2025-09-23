import { Tool } from "@modelcontextprotocol/sdk/types.js";

import { CallToolResultWithElapsedTime, McpClient } from "./types.js";
import { Logger } from '../types/common.js';
import { ChatSession } from "../types/chat.js";
import { Rule } from "../types/rules.js";
import { Agent } from "../types/agent.js";

/**
 * Interface for rule arguments with all fields optional
 */
interface RuleArgs {
    name?: string;
    description?: string;
    priorityLevel?: number;
    enabled?: boolean;
    text?: string;
    include?: 'always' | 'manual' | 'agent';
}

export class McpClientInternalRules implements McpClient {
    private agent: Agent;
    private logger: Logger;
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
                        description: "Unique name for the rule (allowed characters: a-z, A-Z, 0-9, _, -)"
                    },
                    description: {
                        type: "string",
                        description: "Description of what the rule does"
                    },
                    priorityLevel: {
                        type: "number",
                        description: "Priority level of the rule (000-999, higher numbers = higher priority)",
                        default: 500
                    },
                    enabled: {
                        type: "boolean",
                        description: "Whether the rule is enabled",
                        default: true
                    },
                    include: {
                        type: "string",
                        description: "How the rule should be included in sessions",
                        enum: ["always", "manual", "agent"],
                        default: "manual"
                    },
                    text: {
                        type: "string",
                        description: "The actual rule text"
                    }
                },
                required: ["name", "text"]
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
                    },
                    include: {
                        type: "string",
                        description: "How the rule should be included in sessions",
                        enum: ["always", "manual", "agent"]
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
            name: "includeRule",
            description: "Include (add) a rule in the current chat session context",
            inputSchema: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Name of the rule to include / add"
                    }
                },
                required: ["name"]
            }
        },
        {
            name: "excludeRule",
            description: "Exclude (remove) a rule from the current chat session context",
            inputSchema: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Name of the rule to exclude / remove"
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

    constructor(agent: Agent, logger: Logger) {
        this.agent = agent;
        this.logger = logger;
    }

    /**
     * Validates rule arguments, ensuring each field has the correct type if present.
     * @param args User-provided arguments
     * @param requiredFields Array of field names that are required
     * @returns Validated arguments typed as RuleArgs
     * @throws Error if any field has an invalid type or if a required field is missing
     */
    private validateRuleArgs(args?: Record<string, unknown>, requiredFields: string[] = []): RuleArgs {
        if (!args) {
            if (requiredFields.length > 0) {
                throw new Error(`Missing required arguments: ${requiredFields.join(', ')}`);
            }
            return {};
        }

        // Check that all required fields are present
        const missingFields = requiredFields.filter(field => !(field in args));
        if (missingFields.length > 0) {
            throw new Error(`Missing required arguments: ${missingFields.join(', ')}`);
        }

        // Validate the types of any provided arguments and assign to typed result
        const validated: RuleArgs = {};

        if ('name' in args) {
            if (typeof args.name !== 'string') {
                throw new Error('Rule name must be a string');
            }
            validated.name = args.name;
        }

        if ('description' in args) {
            if (typeof args.description !== 'string') {
                throw new Error('Rule description must be a string');
            }
            validated.description = args.description;
        }

        if ('priorityLevel' in args) {
            if (typeof args.priorityLevel !== 'number' || isNaN(args.priorityLevel)) {
                throw new Error('Rule priorityLevel must be a number');
            }
            validated.priorityLevel = args.priorityLevel;
        }

        if ('enabled' in args) {
            if (typeof args.enabled !== 'boolean') {
                throw new Error('Rule enabled must be a boolean');
            }
            validated.enabled = args.enabled;
        }

        if ('text' in args) {
            if (typeof args.text !== 'string') {
                throw new Error('Rule text must be a string');
            }
            validated.text = args.text;
        }

        if ('include' in args) {
            if (typeof args.include !== 'string' || !['always', 'manual', 'agent'].includes(args.include)) {
                throw new Error('Rule include must be one of: always, manual, agent');
            }
            validated.include = args.include as 'always' | 'manual' | 'agent';
        }

        return validated;
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

    async callTool(tool: Tool, args?: Record<string, unknown>, session?: ChatSession): Promise<CallToolResultWithElapsedTime> {
        const startTime = performance.now();
        
        try {
            switch (tool.name) {
                case "createRule": {
                    const validatedArgs = this.validateRuleArgs(args, ["name", "text"]);
                    
                    // Create a rule with defaults for any missing fields
                    const newRule: Rule = {
                        name: validatedArgs.name!,
                        description: validatedArgs.description || "",
                        priorityLevel: validatedArgs.priorityLevel ?? 500,
                        enabled: validatedArgs.enabled ?? true,
                        text: validatedArgs.text!,
                        include: validatedArgs.include || 'manual'
                    };
                    
                    this.agent.addRule(newRule);
                    
                    return {
                        content: [{ type: "text", text: `Rule "${validatedArgs.name}" created successfully` }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "getRule": {
                    const validatedArgs = this.validateRuleArgs(args, ["name"]);
                    
                    const rules = this.agent.getAllRules();
                    const rule = rules.find((r: Rule) => r.name === validatedArgs.name);
                    
                    if (!rule) {
                        throw new Error(`Rule "${validatedArgs.name}" not found`);
                    }
                    
                    return {
                        content: [{ type: "text", text: JSON.stringify(rule, null, 2) }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "updateRule": {
                    const validatedArgs = this.validateRuleArgs(args, ["name"]);                    
                    
                    const existingRules = this.agent.getAllRules();
                    const existingRule = existingRules.find((r: Rule) => r.name === validatedArgs.name);
                    
                    if (!existingRule) {
                        throw new Error(`Rule "${validatedArgs.name}" not found`);
                    }
                    
                    // Create updated rule by combining existing rule with validated updates
                    const updatedRule: Rule = {
                        name: existingRule.name,
                        description: validatedArgs.description ?? existingRule.description,
                        priorityLevel: validatedArgs.priorityLevel ?? existingRule.priorityLevel,
                        enabled: validatedArgs.enabled ?? existingRule.enabled,
                        text: validatedArgs.text ?? existingRule.text,
                        include: validatedArgs.include ?? existingRule.include
                    };
                    
                    this.agent.addRule(updatedRule);
                    
                    return {
                        content: [{ type: "text", text: `Rule "${validatedArgs.name}" updated successfully` }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "deleteRule": {
                    const validatedArgs = this.validateRuleArgs(args, ["name"]);                    
                    
                    this.agent.deleteRule(validatedArgs.name!);
                    
                    return {
                        content: [{ type: "text", text: `Rule "${validatedArgs.name}" deleted successfully` }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "listRules": {
                    const allRules = this.agent.getAllRules();
                    
                    // Create a new array with the text field omitted from each rule
                    const rulesWithoutText = allRules.map(rule => {
                        // Destructure to omit the text field
                        const { text, ...ruleWithoutText } = rule;
                        return ruleWithoutText;
                    });
                    
                    return {
                        content: [{ type: "text", text: JSON.stringify(rulesWithoutText, null, 2) }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "includeRule": {
                    const validatedArgs = this.validateRuleArgs(args, ["name"]);

                    if (!session) {
                        throw new Error(`Chat session not found`);
                    }
                    
                    session.addRule(validatedArgs.name!);
                    
                    return {
                        content: [{ type: "text", text: `Rule "${validatedArgs.name}" successfully included in chat session` }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "excludeRule": {
                    const validatedArgs = this.validateRuleArgs(args, ["name"]);

                    if (!session) {
                        throw new Error(`Chat session not found`);
                    }
                    
                    session.removeRule(validatedArgs.name!);
                    
                    return {
                        content: [{ type: "text", text: `Rule "${validatedArgs.name}" successfully excluded from chat session` }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }
                
                
                default:
                    throw new Error(`Unknown tool: ${tool.name}`);
            }
        } catch (error) {
            this.logger.error(`Error in callTool for ${tool.name}:`, error);
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