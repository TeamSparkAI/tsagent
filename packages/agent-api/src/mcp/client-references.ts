import { Tool } from "./types.js";

import { CallToolResultWithElapsedTime, McpClient } from "./types.js";
import { SearchArgs, validateSearchArgs } from "./client.js";
import { Logger } from '../types/common.js';
import { ChatSession } from "../types/chat.js";
import { Reference, ReferenceSchema } from "../types/references.js";
import { Agent } from "../types/agent.js";
import { SessionContextItem } from "../types/context.js";

/**
 * Reference arguments type - partial Reference for API validation
 */
export type ReferenceArgs = Partial<Reference>;

export interface ReferenceSearchResult {
    name: string;
    description?: string;
    priorityLevel?: number;
    include?: 'always' | 'manual' | 'agent';
    similarityScore?: number;
    text?: string;
}

export class McpClientInternalReferences implements McpClient {
    private agent: Agent;
    private logger: Logger;
    serverVersion: { name: string; version: string } | null = { name: "References", version: "1.0.0" };
    serverTools: Tool[] = [
        {
            name: "createReference",
            description: "Create a new reference",
            inputSchema: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Unique name for the reference (allowed characters: a-z, A-Z, 0-9, _, -)"
                    },
                    description: {
                        type: "string",
                        description: "Description of what the reference contains"
                    },
                    priorityLevel: {
                        type: "number",
                        description: "Priority level of the reference (000-999, higher numbers = higher priority)",
                        default: 500
                    },
                    include: {
                        type: "string",
                        description: "How the reference should be included in sessions",
                        enum: ["always", "manual", "agent"],
                        default: "manual"
                    },
                    text: {
                        type: "string",
                        description: "The actual reference text"
                    }
                },
                required: ["name", "text"]
            }
        },
        {
            name: "getReference",
            description: "Get a reference by name",
            inputSchema: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Name of the reference to retrieve"
                    }
                },
                required: ["name"]
            }
        },
        {
            name: "updateReference",
            description: "Update an existing reference",
            inputSchema: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Name of the reference to update"
                    },
                    description: {
                        type: "string",
                        description: "New description of what the reference contains"
                    },
                    priorityLevel: {
                        type: "number",
                        description: "New priority level of the reference (000-999, higher numbers = higher priority)"
                    },
                    text: {
                        type: "string",
                        description: "New reference text"
                    },
                    include: {
                        type: "string",
                        description: "How the reference should be included in sessions",
                        enum: ["always", "manual", "agent"]
                    }
                },
                required: ["name"]
            }
        },
        {
            name: "deleteReference",
            description: "Delete a reference by name",
            inputSchema: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Name of the reference to delete"
                    }
                },
                required: ["name"]
            }
        },
        {
            name: "listReferences",
            description: "Get all references",
            inputSchema: {
                type: "object",
                properties: {},
                required: []
            }
        },
        {
            name: "listContextReferences",
            description: "List references currently in the chat session context",
            inputSchema: {
                type: "object",
                properties: {},
                required: []
            }
        },
        {
            name: "includeReference",
            description: "Include (add) a reference in the current chat session context",
            inputSchema: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Name of the reference to include / add"
                    }
                },
                required: ["name"]
            }
        },
        {
            name: "excludeReference",
            description: "Exclude (remove) a reference from the current chat session context",
            inputSchema: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Name of the reference to exclude / remove"
                    }
                },
                required: ["name"]
            }
        },
        {
            name: "searchReferences",
            description: "Search references using semantic similarity and return matching items",
            inputSchema: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Search query text to match against reference contents"
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
        },
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
                case "createReference": {
                    const validatedArgs = validateReferenceArgs(args, ["name", "text"]);
                    const message = await implementCreateReference(this.agent, validatedArgs);
                    return {
                        content: [{ type: "text", text: message }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "getReference": {
                    const validatedArgs = validateReferenceArgs(args, ["name"]);
                    const reference = implementGetReference(this.agent, validatedArgs.name!);
                    return {
                        content: [{ type: "text", text: JSON.stringify(reference, null, 2) }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "updateReference": {
                    const validatedArgs = validateReferenceArgs(args, ["name"]);
                    const message = await implementUpdateReference(this.agent, validatedArgs);
                    return {
                        content: [{ type: "text", text: message }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "deleteReference": {
                    const validatedArgs = validateReferenceArgs(args, ["name"]);
                    const message = await implementDeleteReference(this.agent, validatedArgs.name!);
                    return {
                        content: [{ type: "text", text: message }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "listReferences": {
                    const allReferences = implementListReferences(this.agent);
                    const referencesWithoutText = allReferences.map((reference: Reference) => {
                        const { text, ...referenceWithoutText } = reference;
                        return referenceWithoutText;
                    });
                    return {
                        content: [{ type: "text", text: JSON.stringify(referencesWithoutText, null, 2) }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "listContextReferences": {
                    if (!session) {
                        throw new Error(`Chat session not found`);
                    }
                    const contextReferences = implementListContextReferences(session);
                    return {
                        content: [{ type: "text", text: JSON.stringify(contextReferences, null, 2) }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "includeReference": {
                    const validatedArgs = validateReferenceArgs(args, ["name"]);
                    if (!session) {
                        throw new Error(`Chat session not found`);
                    }
                    const message = implementIncludeReference(session, validatedArgs.name!);
                    return {
                        content: [{ type: "text", text: message }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "excludeReference": {
                    const validatedArgs = validateReferenceArgs(args, ["name"]);
                    if (!session) {
                        throw new Error(`Chat session not found`);
                    }
                    const message = implementExcludeReference(session, validatedArgs.name!);
                    return {
                        content: [{ type: "text", text: message }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "searchReferences": {
                    const validatedArgs = validateSearchArgs(args);
                    const results = await implementSearchReferences(this.agent, validatedArgs);
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
 * Validates reference arguments, ensuring each field has the correct type if present.
 * @param args User-provided arguments
 * @param requiredFields Array of field names that are required
 * @returns Validated arguments typed as ReferenceArgs
 * @throws Error if any field has an invalid type or if a required field is missing
 */
/**
 * Validate reference arguments using Zod schema.
 * Returns partial Reference that matches provided args.
 */
export function validateReferenceArgs(args?: Record<string, unknown>, requiredFields: string[] = []): ReferenceArgs {
    // Use partial schema to allow optional fields
    const result = ReferenceSchema.partial().parse(args || {});
    
    // Check required fields
    if (requiredFields.length > 0) {
        const missingFields = requiredFields.filter(field => !(field in result) || result[field as keyof Reference] === undefined);
        if (missingFields.length > 0) {
            throw new Error(`Missing required arguments: ${missingFields.join(', ')}`);
        }
    }
    
    return result;
}

export async function implementCreateReference(agent: Agent, args: ReferenceArgs): Promise<string> {
    const newReference: Reference = {
        name: args.name!,
        description: args.description || "",
        priorityLevel: args.priorityLevel ?? 500,
        text: args.text!,
        include: args.include || 'manual'
    };
    
    await agent.addReference(newReference);
    return `Reference "${args.name}" created successfully`;
}

export function implementGetReference(agent: Agent, referenceName: string): Reference {
    const reference = agent.getReference(referenceName);
    if (!reference) {
        throw new Error(`Reference "${referenceName}" not found`);
    }
    return reference;
}

export async function implementUpdateReference(agent: Agent, args: ReferenceArgs): Promise<string> {
    const existingReference = agent.getReference(args.name!);
    if (!existingReference) {
        throw new Error(`Reference "${args.name}" not found`);
    }
    
    const updatedReference: Reference = {
        name: existingReference.name,
        description: args.description ?? existingReference.description,
        priorityLevel: args.priorityLevel ?? existingReference.priorityLevel,
        text: args.text ?? existingReference.text,
        include: args.include ?? existingReference.include
    };
    
    await agent.addReference(updatedReference);
    return `Reference "${args.name}" updated successfully`;
}

export async function implementDeleteReference(agent: Agent, referenceName: string): Promise<string> {
    const success = await agent.deleteReference(referenceName);
    if (!success) {
        throw new Error(`Reference "${referenceName}" not found`);
    }
    return `Reference "${referenceName}" deleted successfully`;
}

export function implementListReferences(agent: Agent): Reference[] {
    return agent.getAllReferences();
}

export function implementListContextReferences(session: ChatSession): string[] {
    return session.getState().contextItems
        .filter(item => item.type === 'reference')
        .map(item => item.name);
}

export function implementIncludeReference(session: ChatSession, referenceName: string): string {
    if (!session) {
        throw new Error('Chat session not found');
    }
    
    const success = session.addReference(referenceName);
    if (!success) {
        throw new Error(`Reference "${referenceName}" could not be added to session context`);
    }
    
    return `Reference "${referenceName}" successfully included in chat session`;
}

export function implementExcludeReference(session: ChatSession, referenceName: string): string {
    if (!session) {
        throw new Error('Chat session not found');
    }
    
    const success = session.removeReference(referenceName);
    if (!success) {
        throw new Error(`Reference "${referenceName}" could not be removed from session context`);
    }
    
    return `Reference "${referenceName}" successfully excluded from chat session`;
} 

export async function implementSearchReferences(agent: Agent, args: SearchArgs): Promise<ReferenceSearchResult[]> {
    const references = agent.getAllReferences();
    if (references.length === 0) {
        return [];
    }

    const referenceMap = new Map(references.map(reference => [reference.name, reference]));

    const sessionItems: SessionContextItem[] = references.map(reference => ({
        type: 'reference' as const,
        name: reference.name,
        includeMode: reference.include === 'always' ? 'always' : 'manual',
    }));

    const searchResults = await agent.searchContextItems(args.query, sessionItems, args);

    return searchResults
        .filter(item => item.type === 'reference')
        .map(item => {
            const reference = referenceMap.get(item.name);
            if (!reference) {
                return {
                    name: item.name,
                    similarityScore: item.similarityScore,
                };
            }

            const result: ReferenceSearchResult = {
                name: reference.name,
                description: reference.description || undefined,
                priorityLevel: reference.priorityLevel,
                include: reference.include,
                similarityScore: item.similarityScore,
                text: reference.text || undefined,
            };

            return result;
        });
}