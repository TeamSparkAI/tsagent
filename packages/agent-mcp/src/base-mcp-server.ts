import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  Tool,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '@tsagent/core';

/**
 * Tool handler definition combining tool metadata with handler function
 */
export interface ToolHandler {
  tool: Tool;
  handler: (args: Record<string, any>) => Promise<any>;
}

/**
 * Abstract base class for MCP servers
 * 
 * Handles protocol communication, tool registration, argument validation, and routing.
 * Subclasses provide tool definitions and handler implementations.
 */
export abstract class BaseMCPServer {
  protected server: McpServer | null = null;
  protected validator: Ajv;
  protected toolHandlers: Map<string, ToolHandler> = new Map();

  constructor(protected logger: Logger) {
    // Initialize JSON Schema validator
    this.validator = new Ajv({ allErrors: true, strict: false });
    addFormats(this.validator);
  }

  /**
   * Tool handlers - must be implemented by subclass
   */
  protected abstract readonly toolHandlersArray: ToolHandler[];

  /**
   * Server name and version for MCP initialization
   */
  protected abstract readonly serverInfo: { name: string; version: string };

  /**
   * Server instructions/description
   */
  protected abstract readonly serverInstructions: string;

  /**
   * Initialize tool handlers map from the array
   */
  private initializeToolHandlers(): void {
    for (const toolHandler of this.toolHandlersArray) {
      this.toolHandlers.set(toolHandler.tool.name, toolHandler);
    }
  }

  /**
   * Get all tools available from this server
   */
  private getTools(): Tool[] {
    return Array.from(this.toolHandlers.values()).map(th => th.tool);
  }

  /**
   * Register all tools with the MCP server
   */
  private registerTools(): void {
    if (!this.server) {
      throw new Error('Server not initialized. Call start() first.');
    }

    // Register each tool individually
    // Note: registerTool expects Zod schemas, but we're using JSON Schema from getTools().
    // The SDK may accept JSON Schema at runtime, so we cast to any for now.
    // If this causes issues, we may need to convert JSON Schema to Zod schemas.
    const tools = this.getTools();
    for (const tool of tools) {
      this.server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.inputSchema as any,
        },
        async (args: any) => {
          return await this.executeTool(tool.name, args);
        }
      );
    }
  }

  /**
   * Validate tool arguments against the tool's inputSchema
   */
  private validateToolArgs(tool: Tool, args: Record<string, any>): void {
    // If no inputSchema, skip validation (shouldn't happen, but be defensive)
    if (!tool.inputSchema) {
      this.logger.warn(`Tool ${tool.name} has no inputSchema, skipping validation`);
      return;
    }
    
    // Validate arguments against schema
    const valid = this.validator.validate(tool.inputSchema, args);
    
    if (!valid) {
      const errors = this.validator.errors || [];
      const errorMessages = errors.map(err => {
        const path = err.instancePath || err.schemaPath || 'root';
        return `${path}: ${err.message}`;
      });
      
      throw new Error(
        `Tool arguments validation failed for ${tool.name}:\n${errorMessages.join('\n')}`
      );
    }
  }

  /**
   * Execute a tool call
   */
  private async executeTool(toolName: string, args: Record<string, any>): Promise<CallToolResult> {
    try {
      // Look up tool handler
      const toolHandler = this.toolHandlers.get(toolName);
      if (!toolHandler) {
        throw new Error(`Unknown tool: ${toolName}`);
      }
      
      // Validate arguments against tool's inputSchema
      this.validateToolArgs(toolHandler.tool, args);
      
      // Execute handler
      const result = await toolHandler.handler(args);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isValidationError = errorMessage.includes('validation failed');
      
      this.logger.error(`Error executing tool ${toolName}:`, errorMessage);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: {
                  code: isValidationError ? 'VALIDATION_ERROR' : 'TOOL_EXECUTION_ERROR',
                  message: errorMessage,
                  tool: toolName,
                },
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    this.logger.info('Starting MCP Server');

    // Initialize tool handlers from the array
    this.initializeToolHandlers();

    // Create the server
    this.server = new McpServer(
      this.serverInfo,
      {
        capabilities: {
          tools: {},
        },
        instructions: this.serverInstructions,
      }
    );

    // Register all tools
    this.registerTools();

    // Start the server - after this point, stdout is used for MCP protocol
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    this.logger.info('MCP Server started');
  }
}

