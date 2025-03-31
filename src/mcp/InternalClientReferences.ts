import { Tool } from "@modelcontextprotocol/sdk/types";
import { Reference } from "../types/Reference";
import { CallToolResultWithElapsedTime, McpClient } from "./types";
import log from 'electron-log';
import { ReferencesManager } from '../state/ReferencesManager';

export class McpClientInternalReferences implements McpClient {
    private referencesManager: ReferencesManager;
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
                        description: "Unique name for the reference"
                    },
                    description: {
                        type: "string",
                        description: "Description of what the reference contains"
                    },
                    priorityLevel: {
                        type: "number",
                        description: "Priority level of the reference (000-999, higher numbers = higher priority)"
                    },
                    enabled: {
                        type: "boolean",
                        description: "Whether the reference is enabled"
                    },
                    text: {
                        type: "string",
                        description: "The actual reference text"
                    }
                },
                required: ["name", "description", "priorityLevel", "enabled", "text"]
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
        }
    ];

    constructor(referencesManager: ReferencesManager) {
        this.referencesManager = referencesManager;
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
                case "createReference":
                    if (!args?.name || !args?.description || !args?.priorityLevel || !args?.enabled || !args?.text) {
                        throw new Error("Missing required fields for createReference");
                    }
                    this.referencesManager.saveReference({
                        name: args.name as string,
                        description: args.description as string,
                        priorityLevel: args.priorityLevel as number,
                        enabled: args.enabled as boolean,
                        text: args.text as string
                    });
                    return {
                        content: [{ type: "text", text: `Reference "${args.name}" created successfully` }],
                        elapsedTimeMs: performance.now() - startTime
                    };

                case "getReference":
                    if (!args?.name) {
                        throw new Error("Missing name for getReference");
                    }
                    const references = this.referencesManager.getReferences();
                    const reference = references.find((r: Reference) => r.name === args.name);
                    if (!reference) {
                        throw new Error(`Reference "${args.name}" not found`);
                    }
                    return {
                        content: [{ type: "text", text: JSON.stringify(reference, null, 2) }],
                        elapsedTimeMs: performance.now() - startTime
                    };

                case "updateReference":
                    if (!args?.name) {
                        throw new Error("Missing name for updateReference");
                    }
                    const existingReferences = await this.referencesManager.getReferences();
                    const existingReference = existingReferences.find((r: Reference) => r.name === args.name);
                    if (!existingReference) {
                        throw new Error(`Reference "${args.name}" not found`);
                    }
                    const updatedReference: Reference = {
                        ...existingReference,
                        description: args.description ? args.description as string : existingReference.description,
                        priorityLevel: args.priorityLevel ? args.priorityLevel as number : existingReference.priorityLevel,
                        enabled: args.enabled !== undefined ? args.enabled as boolean : existingReference.enabled,
                        text: args.text ? args.text as string : existingReference.text
                    };
                    this.referencesManager.saveReference(updatedReference);
                    return {
                        content: [{ type: "text", text: `Reference "${args.name}" updated successfully` }],
                        elapsedTimeMs: performance.now() - startTime
                    };

                case "deleteReference":
                    if (!args?.name) {
                        throw new Error("Missing name for deleteReference");
                    }
                    this.referencesManager.deleteReference(args.name as string);
                    return {
                        content: [{ type: "text", text: `Reference "${args.name}" deleted successfully` }],
                        elapsedTimeMs: performance.now() - startTime
                    };

                case "listReferences":
                    const allReferences = this.referencesManager.getReferences();
                    return {
                        content: [{ type: "text", text: JSON.stringify(allReferences, null, 2) }],
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