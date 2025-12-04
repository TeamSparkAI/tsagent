import { v4 as uuidv4 } from 'uuid';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { Agent, AgentTool, ToolInputSchema, Logger, MessageUpdate, Turn, JsonSchemaDefinition } from '@tsagent/core';
import { loadAndInitializeAgent } from '@tsagent/core/runtime';
import { ConsoleLogger } from './logger.js';

/**
 * Meta MCP Server
 * 
 * Exposes a Tools agent as an MCP server with tools dynamically generated from
 * the agent's tool definitions. Each tool call processes a prompt template and
 * executes it via a headless chat session.
 */
export class MetaMCPServer {
  private server: Server | null = null;
  private agent: Agent | null = null;
  private agentPath: string;
  private logger: Logger;
  private debug: boolean;

  constructor(agentPath: string, logger?: Logger, debug: boolean = false) {
    this.agentPath = agentPath;
    this.logger = logger || new ConsoleLogger();
    this.debug = debug;
  }

  private setupHandlers(): void {
    if (!this.server) {
      throw new Error('Server not initialized. Call start() first.');
    }

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      if (!this.agent) {
        throw new Error('Agent not loaded. Call start() first.');
      }

      const tools = this.getAgentTools();
      return {
        tools: tools.map(tool => this.convertAgentToolToMCPTool(tool)),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.agent) {
        throw new Error('Agent not loaded. Call start() first.');
      }

      const { name, arguments: args } = request.params;
      
      if (!args) {
        throw new Error('No arguments provided');
      }

      return await this.executeTool(name, args);
    });
  }

  /**
   * Load the agent and initialize the server
   */
  async start(): Promise<void> {
    // Log to stderr only during startup, before connecting to stdio transport
    this.logger.info(`Loading Tools agent from: ${this.agentPath}`);
    this.agent = await loadAndInitializeAgent(this.agentPath, this.logger);
    this.logger.info(`Agent loaded successfully: ${this.agent.name}`);
    
    // Verify this is a Tools agent
    if (this.agent.mode !== 'tools') {
      throw new Error(`Agent is not a Tools agent. Mode: ${this.agent.mode}`);
    }

    const tools = this.getAgentTools();
    if (tools.length === 0) {
      this.logger.warn('Agent has no tools defined');
    } else {
      this.logger.info(`Agent has ${tools.length} tool(s) defined`);
    }

    // Create the server with instructions from agent description
    const agentDescription = this.agent.description || undefined;
    this.server = new Server(
      {
        name: '@tsagent/meta-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
        instructions: agentDescription,
      }
    );

    // Set up request handlers
    this.setupHandlers();

    // Start the server - after this point, stdout is used for MCP protocol
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // After connecting to stdio, disable verbose logging
    // Only critical errors will be logged to stderr
    if (this.logger instanceof ConsoleLogger) {
      (this.logger as ConsoleLogger).setVerbose(false);
    }
  }

  /**
   * Get agent tools from metadata
   */
  private getAgentTools(): AgentTool[] {
    if (!this.agent) {
      return [];
    }
    const metadata = this.agent.getMetadata();
    return metadata.tools || [];
  }

  /**
   * Convert AgentTool to MCP SDK Tool type
   */
  private convertAgentToolToMCPTool(agentTool: AgentTool): Tool {
    // Convert ToolInputSchema to MCP inputSchema format
    const inputSchema = this.convertToolInputSchema(agentTool.parameters);

    return {
      name: agentTool.name,
      description: agentTool.description,
      inputSchema: inputSchema,
    };
  }

  /**
   * Convert ToolInputSchema (our custom type) to MCP SDK format
   */
  private convertToolInputSchema(schema: ToolInputSchema): Tool['inputSchema'] {
    // ToolInputSchema is already an ObjectSchema, so we can convert it directly
    // MCP SDK expects a JSON Schema object
    const mcpSchema: Tool['inputSchema'] = {
      type: 'object',
      ...(schema.properties && { properties: this.convertProperties(schema.properties) }),
      ...(schema.required && schema.required.length > 0 && { required: schema.required }),
      ...(schema.description && { description: schema.description }),
      ...(schema.title && { title: schema.title }),
      ...(schema.additionalProperties !== undefined && { additionalProperties: schema.additionalProperties }),
      ...(schema.minProperties !== undefined && { minProperties: schema.minProperties }),
      ...(schema.maxProperties !== undefined && { maxProperties: schema.maxProperties }),
    };

    return mcpSchema;
  }

  /**
   * Convert properties Record to MCP format
   */
  private convertProperties(properties: Record<string, JsonSchemaDefinition>): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};
    
    for (const [key, value] of Object.entries(properties)) {
      result[key] = this.convertPropertySchema(value);
    }
    
    return result;
  }

  /**
   * Convert a single property schema to MCP format
   * Returns a JSON Schema object compatible with MCP SDK
   */
  private convertPropertySchema(schema: JsonSchemaDefinition): Record<string, unknown> {
    // Type-specific properties with proper narrowing
    if (schema.type === 'string') {
      return {
        type: schema.type,
        ...(schema.description && { description: schema.description }),
        ...(schema.title && { title: schema.title }),
        ...(schema.default !== undefined && { default: schema.default }),
        ...(schema.enum && { enum: schema.enum }),
        ...(schema.examples && { examples: schema.examples }),
        ...(schema.minLength !== undefined && { minLength: schema.minLength }),
        ...(schema.maxLength !== undefined && { maxLength: schema.maxLength }),
      };
    } else if (schema.type === 'number' || schema.type === 'integer') {
      return {
        type: schema.type,
        ...(schema.description && { description: schema.description }),
        ...(schema.title && { title: schema.title }),
        ...(schema.default !== undefined && { default: schema.default }),
        ...(schema.enum && { enum: schema.enum }),
        ...(schema.examples && { examples: schema.examples }),
        ...(schema.minimum !== undefined && { minimum: schema.minimum }),
        ...(schema.maximum !== undefined && { maximum: schema.maximum }),
      };
    } else if (schema.type === 'boolean') {
      return {
        type: schema.type,
        ...(schema.description && { description: schema.description }),
        ...(schema.title && { title: schema.title }),
        ...(schema.default !== undefined && { default: schema.default }),
      };
    } else if (schema.type === 'array') {
      return {
        type: schema.type,
        ...(schema.description && { description: schema.description }),
        ...(schema.title && { title: schema.title }),
        ...(schema.items && {
          items: Array.isArray(schema.items)
            ? schema.items.map((item) => this.convertPropertySchema(item))
            : this.convertPropertySchema(schema.items)
        }),
        ...(schema.minItems !== undefined && { minItems: schema.minItems }),
        ...(schema.maxItems !== undefined && { maxItems: schema.maxItems }),
        ...(schema.uniqueItems !== undefined && { uniqueItems: schema.uniqueItems }),
      };
    } else if (schema.type === 'object') {
      return {
        type: schema.type,
        ...(schema.description && { description: schema.description }),
        ...(schema.title && { title: schema.title }),
        ...(schema.properties && { properties: this.convertProperties(schema.properties) }),
        ...(schema.required && { required: schema.required }),
        ...(schema.additionalProperties !== undefined && { additionalProperties: schema.additionalProperties }),
        ...(schema.minProperties !== undefined && { minProperties: schema.minProperties }),
        ...(schema.maxProperties !== undefined && { maxProperties: schema.maxProperties }),
      };
    }
    
    // Fallback (should never happen with proper discriminated union)
    return { type: schema.type };
  }

  /**
   * Process prompt template with parameter substitution
   */
  private processPromptTemplate(template: string, params: Record<string, any>, toolName: string): string {
    let result = template;
    
    // Replace {name} with tool name
    result = result.replace(/\{name\}/g, toolName);
    
    // Replace {param} with parameter values
    for (const [key, value] of Object.entries(params)) {
      const pattern = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(pattern, String(value));
    }
    
    return result;
  }

  /**
   * Execute a tool call
   */
  private async executeTool(toolName: string, params: Record<string, any>): Promise<CallToolResult> {
    if (!this.agent) {
      throw new Error('Agent not loaded');
    }

    // Find the tool definition
    const tools = this.getAgentTools();
    const toolDef = tools.find(t => t.name === toolName);
    
    if (!toolDef) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Process prompt template
    const prompt = this.processPromptTemplate(toolDef.prompt, params, toolName);
    // Log tool execution to stderr (not stdout) for debugging
    this.logger.debug(`Executing tool ${toolName} with prompt: ${prompt.substring(0, 100)}...`);

    // Create unique context ID for this tool call
    const contextId = uuidv4();

    // Create chat session with headless configuration
    const chatSession = this.agent.createChatSession(contextId, {
      toolPermission: 'never', // No approval required for headless execution
    });

    try {
      // Handle message and get response
      const response = await chatSession.handleMessage(prompt);

      // Extract assistant response text based on debug mode
      const assistantText = this.extractAssistantResponse(response, this.debug);

      return {
        content: [
          {
            type: 'text',
            text: assistantText,
          },
        ],
        isError: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error executing tool ${toolName}:`, errorMessage);
      
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Extract assistant response text from handleMessage response
   * Modeled after A2A server's response extraction
   * 
   * @param response - The response from handleMessage
   * @param debug - If true, returns all turns. If false, returns only the last turn.
   */
  private extractAssistantResponse(response: MessageUpdate, debug: boolean): string {
    // Extract text from turn.results (type: 'text')
    const assistantUpdates = response.updates
      .filter((update) => 
        update.role === 'assistant' && 'modelReply' in update && update.modelReply?.turns !== undefined
      )
      .map((update) => {
        if (update.role !== 'assistant' || !('modelReply' in update)) return '';
        
        // If not debug mode, only process the last turn
        const turns = debug ? update.modelReply.turns : update.modelReply.turns.slice(-1);
        
        return turns
          .map((turn: Turn) => {
            if (turn.results) {
              return turn.results
                .filter((result): result is { type: 'text'; text: string } => result.type === 'text')
                .map((result) => result.text)
                .join('');
            }
            return '';
          })
          .join('');
      })
      .join('\n');

    return assistantUpdates || 'No response generated';
  }
}

