#!/usr/bin/env node

import { v4 as uuidv4 } from 'uuid';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { Agent, AgentTool, ToolInputSchema, Logger } from '@tsagent/core';
import { loadAgent } from '@tsagent/core/runtime';
import { ConsoleLogger } from './logger';

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

  constructor(agentPath: string, logger?: Logger) {
    this.agentPath = agentPath;
    this.logger = logger || new ConsoleLogger();
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
    this.agent = await loadAgent(this.agentPath, this.logger);
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
  private convertToolInputSchema(schema: ToolInputSchema): any {
    // ToolInputSchema is already an ObjectSchema, so we can convert it directly
    // MCP SDK expects a JSON Schema object
    const mcpSchema: any = {
      type: 'object',
    };

    if (schema.properties) {
      mcpSchema.properties = this.convertProperties(schema.properties);
    }

    if (schema.required && schema.required.length > 0) {
      mcpSchema.required = schema.required;
    }

    if (schema.description) {
      mcpSchema.description = schema.description;
    }

    if (schema.title) {
      mcpSchema.title = schema.title;
    }

    if (schema.additionalProperties !== undefined) {
      mcpSchema.additionalProperties = schema.additionalProperties;
    }

    if (schema.minProperties !== undefined) {
      mcpSchema.minProperties = schema.minProperties;
    }

    if (schema.maxProperties !== undefined) {
      mcpSchema.maxProperties = schema.maxProperties;
    }

    return mcpSchema;
  }

  /**
   * Convert properties Record to MCP format
   */
  private convertProperties(properties: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(properties)) {
      result[key] = this.convertPropertySchema(value);
    }
    
    return result;
  }

  /**
   * Convert a single property schema to MCP format
   */
  private convertPropertySchema(schema: any): any {
    const result: any = {
      type: schema.type,
    };

    if (schema.description) {
      result.description = schema.description;
    }

    if (schema.title) {
      result.title = schema.title;
    }

    if (schema.default !== undefined) {
      result.default = schema.default;
    }

    if (schema.enum) {
      result.enum = schema.enum;
    }

    if (schema.examples) {
      result.examples = schema.examples;
    }

    // Type-specific properties
    if (schema.type === 'string') {
      if (schema.minLength !== undefined) {
        result.minLength = schema.minLength;
      }
      if (schema.maxLength !== undefined) {
        result.maxLength = schema.maxLength;
      }
    }

    if (schema.type === 'number' || schema.type === 'integer') {
      if (schema.minimum !== undefined) {
        result.minimum = schema.minimum;
      }
      if (schema.maximum !== undefined) {
        result.maximum = schema.maximum;
      }
    }

    if (schema.type === 'boolean') {
      // No additional properties for boolean
    }

    if (schema.type === 'array') {
      if (schema.items) {
        if (Array.isArray(schema.items)) {
          result.items = schema.items.map((item: any) => this.convertPropertySchema(item));
        } else {
          result.items = this.convertPropertySchema(schema.items);
        }
      }
      if (schema.minItems !== undefined) {
        result.minItems = schema.minItems;
      }
      if (schema.maxItems !== undefined) {
        result.maxItems = schema.maxItems;
      }
      if (schema.uniqueItems !== undefined) {
        result.uniqueItems = schema.uniqueItems;
      }
    }

    if (schema.type === 'object') {
      if (schema.properties) {
        result.properties = this.convertProperties(schema.properties);
      }
      if (schema.required) {
        result.required = schema.required;
      }
      if (schema.additionalProperties !== undefined) {
        result.additionalProperties = schema.additionalProperties;
      }
      if (schema.minProperties !== undefined) {
        result.minProperties = schema.minProperties;
      }
      if (schema.maxProperties !== undefined) {
        result.maxProperties = schema.maxProperties;
      }
    }

    return result;
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

      // Extract assistant response text
      const assistantText = this.extractAssistantResponse(response);

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
   */
  private extractAssistantResponse(response: any): string {
    // Extract text from turn.results (type: 'text')
    const assistantUpdates = response.updates
      .filter((update: any) => update.role === 'assistant')
      .map((update: any) => {
        if (update.modelReply?.turns) {
          return update.modelReply.turns
            .map((turn: any) => {
              if (turn.results) {
                return turn.results
                  .filter((result: any) => result.type === 'text')
                  .map((result: any) => result.text)
                  .join('');
              }
              return '';
            })
            .join('');
        }
        return '';
      })
      .join('\n');

    return assistantUpdates || 'No response generated';
  }
}

// CLI entry point
async function main() {
  const agentPath = process.argv[2];
  
  if (!agentPath) {
    // Use stderr for error messages (stdout is reserved for MCP protocol)
    console.error('Usage: tsagent-meta-mcp <agent-path>');
    process.exit(1);
  }

  // Create logger with verbose enabled during startup only
  const logger = new ConsoleLogger(true);
  const server = new MetaMCPServer(agentPath, logger);
  
  try {
    await server.start();
  } catch (error) {
    // Log errors to stderr
    logger.error('Failed to start Meta MCP server:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url.endsWith('/index.js') || import.meta.url.endsWith('/index.ts')) {
  main().catch(console.error);
}

export default MetaMCPServer;

