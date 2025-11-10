import { Tool } from "@modelcontextprotocol/sdk/types.js";

import { CallToolResultWithElapsedTime, McpClient } from "./types.js";
import { SearchArgs, validateSearchArgs } from "./client.js";
import { Logger } from '../types/common.js';
import { ChatSession } from "../types/chat.js";
import { Rule } from "../types/rules.js";
import { Agent } from "../types/agent.js";
import { SessionContextItem } from "../types/context.js";

/**
 * Interface for rule arguments with all fields optional
 */
export interface RuleArgs {
    name?: string;
    description?: string;
    priorityLevel?: number;
    enabled?: boolean;
    text?: string;
    include?: 'always' | 'manual' | 'agent';
}

export interface RuleSearchResult {
    name: string;
    description?: string;
    priorityLevel?: number;
    include?: 'always' | 'manual' | 'agent';
    similarityScore?: number;
    text?: string;
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
        },
        {
            name: "listContextRules",
            description: "List rules currently in the chat session context",
            inputSchema: {
                type: "object",
                properties: {},
                required: []
            }
        },
        {
            name: "searchRules",
            description: "Search rules using semantic similarity and return matching items",
            inputSchema: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Search query text to match against rule contents"
                    },
                    topK: {
                        type: "number",
                        description: "Maximum embedding matches to consider before grouping (default: 20)",
                        minimum: 1
                    },
                    topN: {
                        type: "number",
                        description: "Target number of results to return after grouping (default: 5)",
                        minimum: 1
                    },
                    includeScore: {
                        type: "number",
                        description: "Always include items with this cosine similarity score or higher (default: 0.7)",
                        minimum: 0,
                        maximum: 1
                    }
                },
                required: ["query"],
                additionalProperties: false
            }
        }
    ];

    constructor(agent: Agent, logger: Logger) {
        this.agent = agent;
        this.logger = logger;
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
                    const validatedArgs = validateRuleArgs(args, ["name", "text"]);
                    const message = await implementCreateRule(this.agent, validatedArgs);
                    return {
                        content: [{ type: "text", text: message }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "getRule": {
                    const validatedArgs = validateRuleArgs(args, ["name"]);
                    const rule = implementGetRule(this.agent, validatedArgs.name!);
                    return {
                        content: [{ type: "text", text: JSON.stringify(rule, null, 2) }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "updateRule": {
                    const validatedArgs = validateRuleArgs(args, ["name"]);
                    const message = await implementUpdateRule(this.agent, validatedArgs);
                    return {
                        content: [{ type: "text", text: message }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "deleteRule": {
                    const validatedArgs = validateRuleArgs(args, ["name"]);
                    const message = await implementDeleteRule(this.agent, validatedArgs.name!);
                    return {
                        content: [{ type: "text", text: message }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "listRules": {
                    const allRules = implementListRules(this.agent);
                    const rulesWithoutText = allRules.map((rule: Rule) => {
                        const { text, ...ruleWithoutText } = rule;
                        return ruleWithoutText;
                    });
                    return {
                        content: [{ type: "text", text: JSON.stringify(rulesWithoutText, null, 2) }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "listContextRules": {
                    if (!session) {
                        throw new Error(`Chat session not found`);
                    }
                    const contextRules = implementListContextRules(session);
                    return {
                        content: [{ type: "text", text: JSON.stringify(contextRules, null, 2) }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "includeRule": {
                    const validatedArgs = validateRuleArgs(args, ["name"]);
                    if (!session) {
                        throw new Error(`Chat session not found`);
                    }
                    const message = implementIncludeRule(session, validatedArgs.name!);
                    return {
                        content: [{ type: "text", text: message }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "excludeRule": {
                    const validatedArgs = validateRuleArgs(args, ["name"]);
                    if (!session) {
                        throw new Error(`Chat session not found`);
                    }
                    const message = implementExcludeRule(session, validatedArgs.name!);
                    return {
                        content: [{ type: "text", text: message }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }
                
                case "searchRules": {
                    const validatedArgs = validateSearchArgs(args);
                    const results = await implementSearchRules(this.agent, validatedArgs);
                    return {
                        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
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

// ========================================
// Exported Implementation Functions
// These functions implement the core logic and can be reused by supervision tools
// ========================================

/**
 * Validates rule arguments, ensuring each field has the correct type if present.
 * @param args User-provided arguments
 * @param requiredFields Array of field names that are required
 * @returns Validated arguments typed as RuleArgs
 * @throws Error if any field has an invalid type or if a required field is missing
 */
export function validateRuleArgs(args?: Record<string, unknown>, requiredFields: string[] = []): RuleArgs {
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

/**
 * Implementation for creating a rule
 */
export async function implementCreateRule(agent: Agent, args: RuleArgs): Promise<string> {
    const newRule: Rule = {
        name: args.name!,
        description: args.description || "",
        priorityLevel: args.priorityLevel ?? 500,
        text: args.text!,
        include: args.include || 'manual'
    };
    
    await agent.addRule(newRule);
    return `Rule "${args.name}" created successfully`;
}

/**
 * Implementation for getting a rule
 */
export function implementGetRule(agent: Agent, ruleName: string): Rule {
    const rule = agent.getRule(ruleName);
    if (!rule) {
        throw new Error(`Rule "${ruleName}" not found`);
    }
    return rule;
}

/**
 * Implementation for updating a rule
 */
export async function implementUpdateRule(agent: Agent, args: RuleArgs): Promise<string> {
    const existingRule = agent.getRule(args.name!);
    if (!existingRule) {
        throw new Error(`Rule "${args.name}" not found`);
    }
    
    const updatedRule: Rule = {
        name: existingRule.name,
        description: args.description ?? existingRule.description,
        priorityLevel: args.priorityLevel ?? existingRule.priorityLevel,
        text: args.text ?? existingRule.text,
        include: args.include ?? existingRule.include
    };
    
    await agent.addRule(updatedRule);
    return `Rule "${args.name}" updated successfully`;
}

/**
 * Implementation for deleting a rule
 */
export async function implementDeleteRule(agent: Agent, ruleName: string): Promise<string> {
    const success = await agent.deleteRule(ruleName);
    if (!success) {
        throw new Error(`Rule "${ruleName}" not found`);
    }
    return `Rule "${ruleName}" deleted successfully`;
}

/**
 * Implementation for listing all rules
 */
export function implementListRules(agent: Agent): Rule[] {
    return agent.getAllRules();
}

/**
 * Implementation for listing rules in context
 */
export function implementListContextRules(session: ChatSession): string[] {
    return session.getState().contextItems
        .filter(item => item.type === 'rule')
        .map(item => item.name);
}

/**
 * Implementation for including a rule in session context
 */
export function implementIncludeRule(session: ChatSession, ruleName: string): string {
    if (!session) {
        throw new Error('Chat session not found');
    }
    
    const success = session.addRule(ruleName);
    if (!success) {
        throw new Error(`Rule "${ruleName}" could not be added to session context`);
    }
    
    return `Rule "${ruleName}" successfully included in chat session`;
}

/**
 * Implementation for excluding a rule from session context
 */
export function implementExcludeRule(session: ChatSession, ruleName: string): string {
    if (!session) {
        throw new Error('Chat session not found');
    }
    
    const success = session.removeRule(ruleName);
    if (!success) {
        throw new Error(`Rule "${ruleName}" could not be removed from session context`);
    }
    
    return `Rule "${ruleName}" successfully excluded from chat session`;
}

export async function implementSearchRules(agent: Agent, args: SearchArgs): Promise<RuleSearchResult[]> {
    const rules = agent.getAllRules();
    if (rules.length === 0) {
        return [];
    }

    const ruleMap = new Map(rules.map(rule => [rule.name, rule]));

    const sessionItems: SessionContextItem[] = rules.map(rule => ({
        type: 'rule' as const,
        name: rule.name,
        includeMode: rule.include === 'always' ? 'always' : 'manual',
    }));

    const searchResults = await agent.searchContextItems(args.query, sessionItems, args);

    return searchResults
        .filter(item => item.type === 'rule')
        .map(item => {
            const rule = ruleMap.get(item.name);
            if (!rule) {
                return {
                    name: item.name,
                    similarityScore: item.similarityScore,
                };
            }

            const result: RuleSearchResult = {
                name: rule.name,
                description: rule.description || undefined,
                priorityLevel: rule.priorityLevel,
                include: rule.include,
                similarityScore: item.similarityScore,
                text: rule.text || undefined,
            };

            return result;
        });
}