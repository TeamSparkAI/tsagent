import { Tool } from "@modelcontextprotocol/sdk/types.js";

import { CallToolResultWithElapsedTime, McpClient } from "./types.js";
import { Logger } from '../types/common.js';
import { ChatSession } from "../types/chat.js";
import { Reference } from "../types/references.js";
import { Agent } from "../types/agent.js";

/**
 * Interface for reference arguments with all fields optional
 */
interface ReferenceArgs {
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

    /**
     * Validates reference arguments, ensuring each field has the correct type if present.
     * @param args User-provided arguments
     * @param requiredFields Array of field names that are required
     * @returns Validated arguments typed as ReferenceArgs
     * @throws Error if any field has an invalid type or if a required field is missing
     */
    private validateReferenceArgs(args?: Record<string, unknown>, requiredFields: string[] = []): ReferenceArgs {
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
                    const validatedArgs = this.validateReferenceArgs(args, ["name", "text"]);
                    
                    // Create a reference with defaults for any missing fields
                    const newReference: Reference = {
                        name: validatedArgs.name!,
                        description: validatedArgs.description || "",
                        priorityLevel: validatedArgs.priorityLevel ?? 500,
                        enabled: validatedArgs.enabled ?? true,
                        text: validatedArgs.text!,
                        include: validatedArgs.include || 'manual'
                    };
                    
                    this.agent.addReference(newReference);
                    
                    return {
                        content: [{ type: "text", text: `Reference "${validatedArgs.name}" created successfully` }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "getReference": {
                    const validatedArgs = this.validateReferenceArgs(args, ["name"]);
                    
                    const references = this.agent.getAllReferences();
                    const reference = references.find((r: Reference) => r.name === validatedArgs.name);
                    
                    if (!reference) {
                        throw new Error(`Reference "${validatedArgs.name}" not found`);
                    }
                    
                    return {
                        content: [{ type: "text", text: JSON.stringify(reference, null, 2) }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "updateReference": {
                    const validatedArgs = this.validateReferenceArgs(args, ["name"]);
                    
                    const existingReferences = this.agent.getAllReferences();
                    const existingReference = existingReferences.find((r: Reference) => r.name === validatedArgs.name);
                    
                    if (!existingReference) {
                        throw new Error(`Reference "${validatedArgs.name}" not found`);
                    }
                    
                    // Create updated reference by combining existing reference with validated updates
                    const updatedReference: Reference = {
                        name: existingReference.name,
                        description: validatedArgs.description ?? existingReference.description,
                        priorityLevel: validatedArgs.priorityLevel ?? existingReference.priorityLevel,
                        enabled: validatedArgs.enabled ?? existingReference.enabled,
                        text: validatedArgs.text ?? existingReference.text,
                        include: validatedArgs.include ?? existingReference.include
                    };
                    
                    this.agent.addReference(updatedReference);
                    
                    return {
                        content: [{ type: "text", text: `Reference "${validatedArgs.name}" updated successfully` }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "deleteReference": {
                    const validatedArgs = this.validateReferenceArgs(args, ["name"]);
                    
                    this.agent.deleteReference(validatedArgs.name!);
                    
                    return {
                        content: [{ type: "text", text: `Reference "${validatedArgs.name}" deleted successfully` }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "listReferences": {
                    const allReferences = this.agent.getAllReferences();
                    
                    // Create a new array with the text field omitted from each reference
                    const referencesWithoutText = allReferences.map(reference => {
                        // Destructure to omit the text field
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
                    
                    const contextReferences = session.getState().references;
                    
                    return {
                        content: [{ type: "text", text: JSON.stringify(contextReferences, null, 2) }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "includeReference": {
                    const validatedArgs = this.validateReferenceArgs(args, ["name"]);

                    if (!session) {
                        throw new Error(`Chat session not found`);
                    }
                    
                    session.addReference(validatedArgs.name!);
                    
                    return {
                        content: [{ type: "text", text: `Reference "${validatedArgs.name}" successfully included in chat session` }],
                        elapsedTimeMs: performance.now() - startTime
                    };
                }

                case "excludeReference": {
                    const validatedArgs = this.validateReferenceArgs(args, ["name"]);

                    if (!session) {
                        throw new Error(`Chat session not found`);
                    }
                    
                    session.removeReference(validatedArgs.name!);
                    
                    return {
                        content: [{ type: "text", text: `Reference "${validatedArgs.name}" successfully excluded from chat session` }],
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