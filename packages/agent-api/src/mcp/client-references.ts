import { Tool } from "@modelcontextprotocol/sdk/types.js";

import { CallToolResultWithElapsedTime, McpClient } from "./types.js";
import { Logger } from '../types/common.js';
import { ChatSession } from "../types/chat.js";
import { Reference } from "../types/references.js";
import { Agent } from "../types/agent.js";

/**
 * Interface for reference arguments with all fields optional
 */
export interface ReferenceArgs {
    name?: string;
    description?: string;
    priorityLevel?: number;
    enabled?: boolean;
    text?: string;
    include?: 'always' | 'manual' | 'agent';
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
                    enabled: {
                        type: "boolean",
                        description: "Whether the reference is enabled",
                        default: true
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
                    enabled: {
                        type: "boolean",
                        description: "New enabled state of the reference"
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
export function validateReferenceArgs(args?: Record<string, unknown>, requiredFields: string[] = []): ReferenceArgs {
    if (!args) {
        if (requiredFields.length > 0) {
            throw new Error(`Missing required arguments: ${requiredFields.join(', ')}`);
        }
        return {};
    }

    const missingFields = requiredFields.filter(field => !(field in args));
    if (missingFields.length > 0) {
        throw new Error(`Missing required arguments: ${missingFields.join(', ')}`);
    }

    const validated: ReferenceArgs = {};

    if ('name' in args) {
        if (typeof args.name !== 'string') {
            throw new Error('Reference name must be a string');
        }
        validated.name = args.name;
    }

    if ('description' in args) {
        if (typeof args.description !== 'string') {
            throw new Error('Reference description must be a string');
        }
        validated.description = args.description;
    }

    if ('priorityLevel' in args) {
        if (typeof args.priorityLevel !== 'number' || isNaN(args.priorityLevel)) {
            throw new Error('Reference priorityLevel must be a number');
        }
        validated.priorityLevel = args.priorityLevel;
    }

    if ('enabled' in args) {
        if (typeof args.enabled !== 'boolean') {
            throw new Error('Reference enabled must be a boolean');
        }
        validated.enabled = args.enabled;
    }

    if ('text' in args) {
        if (typeof args.text !== 'string') {
            throw new Error('Reference text must be a string');
        }
        validated.text = args.text;
    }

    if ('include' in args) {
        if (typeof args.include !== 'string' || !['always', 'manual', 'agent'].includes(args.include)) {
            throw new Error('Reference include must be one of: always, manual, agent');
        }
        validated.include = args.include as 'always' | 'manual' | 'agent';
    }

    return validated;
}

export async function implementCreateReference(agent: Agent, args: ReferenceArgs): Promise<string> {
    const newReference: Reference = {
        name: args.name!,
        description: args.description || "",
        priorityLevel: args.priorityLevel ?? 500,
        enabled: args.enabled ?? true,
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
        enabled: args.enabled ?? existingReference.enabled,
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