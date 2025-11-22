import * as path from 'path';
import * as fs from 'fs';
import {
  Agent,
  AgentConfig,
  AgentMetadata,
  AgentMode,
  AgentTool,
  Logger,
  Rule,
  Reference,
  ProviderType,
  McpConfig,
  AGENT_FILE_NAME,
} from '@tsagent/core';
import {
  createAgent,
  loadAgent,
  cloneAgent,
  agentExists,
  loadAgentMetadataOnly,
} from '@tsagent/core/runtime';
import { ConsoleLogger } from './logger.js';
import { BaseMCPServer, ToolHandler } from './base-mcp-server.js';

/**
 * Agent Management MCP Server
 * 
 * Provides tools to create, configure, and manage TsAgent agents.
 * All tools use an `agentTarget` parameter to identify which agent to operate on.
 */
export class AgentManagementMCPServer extends BaseMCPServer {
  private agentRegistry: Map<string, Agent> = new Map();
  private debug: boolean;

  constructor(logger?: Logger, debug: boolean = false) {
    super(logger || new ConsoleLogger());
    this.debug = debug;
  }

  /**
   * Server name and version
   */
  protected readonly serverInfo = {
    name: '@tsagent/agent-mcp',
    version: '1.0.0',
  } as const;

  /**
   * Server instructions
   */
  protected readonly serverInstructions = 'MCP server for managing TsAgent agents. Provides tools to create, configure, and manage agents including rules, references, tools, providers, and MCP servers.';

  /**
   * Resolve agent target (path, ID, or name) to an Agent instance
   */
  private async resolveAgent(agentTarget: string): Promise<Agent> {
    // Normalize path
    const normalizedPath = path.normalize(agentTarget);

    // Check registry first
    if (this.agentRegistry.has(normalizedPath)) {
      return this.agentRegistry.get(normalizedPath)!;
    }

    // Try to load agent
    try {
      const agent = await loadAgent(normalizedPath, this.logger);
      this.agentRegistry.set(normalizedPath, agent);
      return agent;
    } catch (error) {
      throw new Error(`Failed to load agent at path "${agentTarget}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Array of tool handlers - tool definitions co-located with their handlers
   */
  protected readonly toolHandlersArray: ToolHandler[] = [
      // Agent Discovery & Lifecycle
      {
        tool: {
          name: 'agent_list',
          description: 'List all available agents in the system. Optionally search from a base directory.',
          inputSchema: {
            type: 'object',
            properties: {
              basePath: {
                type: 'string',
                description: 'Base directory to search for agents. If not provided, returns empty list (agents must be loaded individually).',
              },
            },
          },
        },
        handler: async (args) => {
          const basePath = args.basePath ? path.normalize(args.basePath) : null;
          
          if (!basePath) {
            // If no basePath provided, return agents from registry
            const agents = Array.from(this.agentRegistry.entries()).map(([agentPath, agent]) => {
              const metadata = agent.getMetadata();
              return {
                id: agent.id,
                name: agent.name,
                path: agent.path,
                description: agent.description,
                mode: agent.mode,
                metadata,
              };
            });
            
            return {
              agents,
              count: agents.length,
            };
          }

          // Search for agents in the base directory
          const agents: any[] = [];
          
          // Note: We use fs.existsSync here only to check if the base directory exists.
          // This is not accessing agent files directly - it's just checking the search root.
          if (!fs.existsSync(basePath)) {
            return {
              agents: [],
              count: 0,
              error: `Base path does not exist: ${basePath}`,
            };
          }

          try {
            // Recursively search for directories containing agent files
            // Note: We use fs.readdirSync for directory traversal only. We do NOT read agent files directly.
            // All agent file access goes through the agent-api:
            // - agentExists() uses FileBasedAgentStrategy.agentExists() (proper API)
            // - loadAgentMetadataOnly() uses FileBasedAgentStrategy.loadConfig() (proper API)
            const findAgents = async (dir: string): Promise<void> => {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              
              for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                  // Check if this directory contains an agent using the API (not direct file access)
                  if (await agentExists(fullPath)) {
                    try {
                      // Load metadata only using the API (goes through AgentStrategy, not direct file read)
                      const metadata = await loadAgentMetadataOnly(fullPath, this.logger);
                      if (metadata) {
                        agents.push({
                          id: fullPath,
                          name: metadata.name || entry.name,
                          path: fullPath,
                          description: metadata.description,
                          mode: (metadata.tools ? 'tools' : (metadata.skills ? 'autonomous' : 'interactive')) as AgentMode,
                          metadata,
                        });
                      }
                    } catch (error) {
                      // Skip invalid agent files
                      this.logger.warn(`Failed to load agent metadata at ${fullPath}:`, error);
                    }
                  } else {
                    // Recursively search subdirectories
                    await findAgents(fullPath);
                  }
                }
              }
            };

            await findAgents(basePath);
          } catch (error) {
            this.logger.error(`Error searching for agents in ${basePath}:`, error);
            return {
              agents: [],
              count: 0,
              error: error instanceof Error ? error.message : String(error),
            };
          }

          return {
            agents,
            count: agents.length,
          };
        },
      },
      {
        tool: {
          name: 'agent_get_info',
          description: 'Get detailed information about a specific agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: `Agent path (directory containing ${AGENT_FILE_NAME})`,
              },
            },
            required: ['agentTarget'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const metadata = agent.getMetadata();
          const installedProviders = agent.getInstalledProviders();
          const mcpServers = await agent.getAllMcpServers();
          const rules = agent.getAllRules();
          const references = agent.getAllReferences();

          return {
            id: agent.id,
            name: agent.name,
            path: agent.path,
            description: agent.description,
            mode: agent.mode,
            metadata,
            installedProviders,
            mcpServerCount: Object.keys(mcpServers).length,
            ruleCount: rules.length,
            referenceCount: references.length,
            toolCount: metadata.tools?.length || 0,
          };
        },
      },
      {
        tool: {
          name: 'agent_create',
          description: 'Create a new agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentPath: {
                type: 'string',
                description: `File system path where agent should be created (directory path, not including ${AGENT_FILE_NAME})`,
              },
              name: {
                type: 'string',
                description: 'Agent name',
              },
              description: {
                type: 'string',
                description: 'Agent description',
              },
              mode: {
                type: 'string',
                enum: ['interactive', 'autonomous', 'tools'] as const satisfies readonly AgentMode[],
                description: 'Agent mode',
              },
              initialSettings: {
                type: 'object',
                description: 'Initial settings as key-value pairs',
              },
              initialPrompt: {
                type: 'string',
                description: 'Initial system prompt',
              },
            },
            required: ['agentPath', 'name'],
          },
        },
        handler: async (args) => {
          const normalizedPath = path.normalize(args.agentPath);
          
          // Check if agent already exists
          if (await agentExists(normalizedPath)) {
            throw new Error(`Agent already exists at path: ${normalizedPath}`);
          }
          
          const metadata: Partial<AgentMetadata> = {
            name: args.name,
            description: args.description,
            created: new Date().toISOString(),
            lastAccessed: new Date().toISOString(),
          };

          // Set mode by adding appropriate metadata fields
          const mode = args.mode as AgentMode | undefined;
          if (mode === 'tools') {
            metadata.tools = [];
          } else if (mode === 'autonomous') {
            metadata.skills = [];
          }
          // 'interactive' is the default, no special metadata needed

          const config: Partial<AgentConfig> = {
            metadata: metadata as AgentMetadata,
            settings: args.initialSettings || {},
          };

          const agent = await createAgent(normalizedPath, this.logger, config);
          
          if (args.initialPrompt) {
            await agent.setSystemPrompt(args.initialPrompt);
          }

          this.agentRegistry.set(normalizedPath, agent);

          return {
            success: true,
            agentId: agent.id,
            agentPath: agent.path,
          };
        },
      },
      {
        tool: {
          name: 'agent_delete',
          description: 'Delete an agent and all its associated files.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: `Agent path (directory containing ${AGENT_FILE_NAME})`,
              },
              confirm: {
                type: 'boolean',
                description: 'Confirmation flag (safety measure)',
              },
            },
            required: ['agentTarget', 'confirm'],
          },
        },
        handler: async (args) => {
          if (!args.confirm) {
            throw new Error('Deletion requires confirm=true');
          }

          const agent = await this.resolveAgent(args.agentTarget);
          await agent.delete();
          this.agentRegistry.delete(path.normalize(args.agentTarget));

          return {
            success: true,
          };
        },
      },
      {
        tool: {
          name: 'agent_clone',
          description: 'Clone an existing agent to a new location.',
          inputSchema: {
            type: 'object',
            properties: {
              sourceAgent: {
                type: 'string',
                description: 'Source agent path',
              },
              targetPath: {
                type: 'string',
                description: 'Target path for cloned agent',
              },
              newName: {
                type: 'string',
                description: 'New name for cloned agent',
              },
            },
            required: ['sourceAgent', 'targetPath'],
          },
        },
        handler: async (args) => {
          const sourceAgent = await this.resolveAgent(args.sourceAgent);
          const targetPath = path.normalize(args.targetPath);
          
          const clonedAgent = await cloneAgent(sourceAgent.path, targetPath, this.logger);
          
          if (args.newName) {
            await clonedAgent.updateMetadata({ name: args.newName });
          }

          this.agentRegistry.set(targetPath, clonedAgent);

          return {
            success: true,
            agentId: clonedAgent.id,
            agentPath: clonedAgent.path,
          };
        },
      },
      // Agent Configuration
      {
        tool: {
          name: 'agent_get_settings',
          description: 'Get all settings for an agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
            },
            required: ['agentTarget'],
          },
        },
        handler: async (args) => {
          // Note: Agent API doesn't have a method to get all settings at once
          // We'd need to know all possible keys. For now, return empty object.
          return {
            settings: {},
          };
        },
      },
      {
        tool: {
          name: 'agent_set_setting',
          description: 'Set a single setting value.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              key: {
                type: 'string',
                description: 'Setting key',
              },
              value: {
                type: 'string',
                description: 'Setting value',
              },
            },
            required: ['agentTarget', 'key', 'value'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          await agent.setSetting(args.key, args.value);
          return {
            success: true,
          };
        },
      },
      {
        tool: {
          name: 'agent_get_system_prompt',
          description: 'Get the system prompt for an agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
            },
            required: ['agentTarget'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const prompt = await agent.getSystemPrompt();
          return {
            prompt,
          };
        },
      },
      {
        tool: {
          name: 'agent_set_system_prompt',
          description: 'Set the system prompt for an agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              prompt: {
                type: 'string',
                description: 'New system prompt',
              },
            },
            required: ['agentTarget', 'prompt'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          await agent.setSystemPrompt(args.prompt);
          return {
            success: true,
          };
        },
      },
      {
        tool: {
          name: 'agent_get_metadata',
          description: 'Get agent metadata.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
            },
            required: ['agentTarget'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const metadata = agent.getMetadata();
          return {
            metadata,
          };
        },
      },
      {
        tool: {
          name: 'agent_update_metadata',
          description: 'Update agent metadata.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              metadata: {
                type: 'object',
                description: 'Partial metadata updates',
              },
            },
            required: ['agentTarget', 'metadata'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          await agent.updateMetadata(args.metadata);
          return {
            success: true,
          };
        },
      },
      // Rules Management
      {
        tool: {
          name: 'agent_list_rules',
          description: 'List all rules for an agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
            },
            required: ['agentTarget'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const rules = agent.getAllRules();
          return {
            rules,
            count: rules.length,
          };
        },
      },
      {
        tool: {
          name: 'agent_get_rule',
          description: 'Get a specific rule by name.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              ruleName: {
                type: 'string',
                description: 'Name of the rule',
              },
            },
            required: ['agentTarget', 'ruleName'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const rule = agent.getRule(args.ruleName);
          return {
            rule,
          };
        },
      },
      {
        tool: {
          name: 'agent_add_rule',
          description: 'Add a new rule to an agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              rule: {
                type: 'object',
                description: 'Rule object with name, description, text, priorityLevel, include mode',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  text: { type: 'string' },
                  priorityLevel: { type: 'number' },
                  include: {
                    type: 'string',
                    enum: ['always', 'manual', 'agent'],
                  },
                },
                required: ['name', 'description', 'text', 'priorityLevel', 'include'],
              },
            },
            required: ['agentTarget', 'rule'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          await agent.addRule(args.rule as Rule);
          return {
            success: true,
          };
        },
      },
      {
        tool: {
          name: 'agent_update_rule',
          description: 'Update an existing rule.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              ruleName: {
                type: 'string',
                description: 'Name of the rule to update',
              },
              rule: {
                type: 'object',
                description: 'Partial rule updates',
              },
            },
            required: ['agentTarget', 'ruleName', 'rule'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const existingRule = agent.getRule(args.ruleName);
          if (!existingRule) {
            throw new Error(`Rule not found: ${args.ruleName}`);
          }
          
          const updatedRule: Rule = {
            ...existingRule,
            ...args.rule,
          };
          
          // Delete and re-add to update
          await agent.deleteRule(args.ruleName);
          await agent.addRule(updatedRule);
          
          return {
            success: true,
          };
        },
      },
      {
        tool: {
          name: 'agent_delete_rule',
          description: 'Delete a rule from an agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              ruleName: {
                type: 'string',
                description: 'Name of the rule to delete',
              },
            },
            required: ['agentTarget', 'ruleName'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const deleted = await agent.deleteRule(args.ruleName);
          return {
            success: deleted,
          };
        },
      },
      // References Management
      {
        tool: {
          name: 'agent_list_references',
          description: 'List all references for an agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
            },
            required: ['agentTarget'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const references = agent.getAllReferences();
          return {
            references,
            count: references.length,
          };
        },
      },
      {
        tool: {
          name: 'agent_get_reference',
          description: 'Get a specific reference by name.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              referenceName: {
                type: 'string',
                description: 'Name of the reference',
              },
            },
            required: ['agentTarget', 'referenceName'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const reference = agent.getReference(args.referenceName);
          return {
            reference,
          };
        },
      },
      {
        tool: {
          name: 'agent_add_reference',
          description: 'Add a new reference to an agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              reference: {
                type: 'object',
                description: 'Reference object with name, description, text, priorityLevel, include mode',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  text: { type: 'string' },
                  priorityLevel: { type: 'number' },
                  include: {
                    type: 'string',
                    enum: ['always', 'manual', 'agent'],
                  },
                },
                required: ['name', 'description', 'text', 'priorityLevel', 'include'],
              },
            },
            required: ['agentTarget', 'reference'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          await agent.addReference(args.reference as Reference);
          return {
            success: true,
          };
        },
      },
      {
        tool: {
          name: 'agent_update_reference',
          description: 'Update an existing reference.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              referenceName: {
                type: 'string',
                description: 'Name of the reference to update',
              },
              reference: {
                type: 'object',
                description: 'Partial reference updates',
              },
            },
            required: ['agentTarget', 'referenceName', 'reference'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const existingReference = agent.getReference(args.referenceName);
          if (!existingReference) {
            throw new Error(`Reference not found: ${args.referenceName}`);
          }
          
          const updatedReference: Reference = {
            ...existingReference,
            ...args.reference,
          };
          
          // Delete and re-add to update
          await agent.deleteReference(args.referenceName);
          await agent.addReference(updatedReference);
          
          return {
            success: true,
          };
        },
      },
      {
        tool: {
          name: 'agent_delete_reference',
          description: 'Delete a reference from an agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              referenceName: {
                type: 'string',
                description: 'Name of the reference to delete',
              },
            },
            required: ['agentTarget', 'referenceName'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const deleted = await agent.deleteReference(args.referenceName);
          return {
            success: deleted,
          };
        },
      },
      // Tools Management (for Tools Mode Agents)
      {
        tool: {
          name: 'agent_list_tools',
          description: 'List all exported tools for a tools-mode agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
            },
            required: ['agentTarget'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          if (agent.mode !== 'tools') {
            throw new Error(`Agent is not in tools mode. Current mode: ${agent.mode}`);
          }
          const metadata = agent.getMetadata();
          const tools = metadata.tools || [];
          return {
            tools,
            count: tools.length,
          };
        },
      },
      {
        tool: {
          name: 'agent_get_tool',
          description: 'Get a specific tool by name.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              toolName: {
                type: 'string',
                description: 'Name of the tool',
              },
            },
            required: ['agentTarget', 'toolName'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          if (agent.mode !== 'tools') {
            throw new Error(`Agent is not in tools mode. Current mode: ${agent.mode}`);
          }
          const metadata = agent.getMetadata();
          const tools = metadata.tools || [];
          const tool = tools.find((t: AgentTool) => t.name === args.toolName);
          return {
            tool: tool || null,
          };
        },
      },
      {
        tool: {
          name: 'agent_add_tool',
          description: 'Add a new exported tool to a tools-mode agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              tool: {
                type: 'object',
                description: 'Tool definition with name, description, parameters (JSON Schema), and prompt template',
              },
            },
            required: ['agentTarget', 'tool'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          if (agent.mode !== 'tools') {
            throw new Error(`Agent is not in tools mode. Current mode: ${agent.mode}`);
          }
          const metadata = agent.getMetadata();
          const tools = metadata.tools || [];
          
          // Check if tool already exists
          if (tools.some((t: AgentTool) => t.name === args.tool.name)) {
            throw new Error(`Tool already exists: ${args.tool.name}`);
          }
          
          const updatedTools = [...tools, args.tool as AgentTool];
          await agent.updateMetadata({ tools: updatedTools });
          
          return {
            success: true,
          };
        },
      },
      {
        tool: {
          name: 'agent_update_tool',
          description: 'Update an existing tool.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              toolName: {
                type: 'string',
                description: 'Name of the tool to update',
              },
              tool: {
                type: 'object',
                description: 'Partial tool updates',
              },
            },
            required: ['agentTarget', 'toolName', 'tool'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          if (agent.mode !== 'tools') {
            throw new Error(`Agent is not in tools mode. Current mode: ${agent.mode}`);
          }
          const metadata = agent.getMetadata();
          const tools = metadata.tools || [];
          
          const toolIndex = tools.findIndex((t: AgentTool) => t.name === args.toolName);
          if (toolIndex === -1) {
            throw new Error(`Tool not found: ${args.toolName}`);
          }
          
          const updatedTools = [...tools];
          updatedTools[toolIndex] = {
            ...updatedTools[toolIndex],
            ...args.tool,
          };
          
          await agent.updateMetadata({ tools: updatedTools });
          
          return {
            success: true,
          };
        },
      },
      {
        tool: {
          name: 'agent_delete_tool',
          description: 'Delete a tool from a tools-mode agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              toolName: {
                type: 'string',
                description: 'Name of the tool to delete',
              },
            },
            required: ['agentTarget', 'toolName'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          if (agent.mode !== 'tools') {
            throw new Error(`Agent is not in tools mode. Current mode: ${agent.mode}`);
          }
          const metadata = agent.getMetadata();
          const tools = metadata.tools || [];
          
          const filteredTools = tools.filter((t: AgentTool) => t.name !== args.toolName);
          await agent.updateMetadata({ tools: filteredTools });
          
          return {
            success: true,
          };
        },
      },
      // Provider Management
      {
        tool: {
          name: 'agent_list_providers',
          description: 'List all installed and available providers for an agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
            },
            required: ['agentTarget'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const installed = agent.getInstalledProviders();
          const available = agent.getAvailableProviders();
          const providerInfo = agent.getAvailableProvidersInfo();
          
          return {
            installed,
            available,
            providerInfo,
          };
        },
      },
      {
        tool: {
          name: 'agent_get_provider_config',
          description: 'Get configuration for a specific provider.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              providerType: {
                type: 'string',
                description: 'Provider type (e.g., "openai", "anthropic")',
              },
            },
            required: ['agentTarget', 'providerType'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const providerType = args.providerType as ProviderType;
          const installed = agent.isProviderInstalled(providerType);
          const config = agent.getInstalledProviderConfig(providerType);
          const resolvedConfig = installed ? await agent.getResolvedProviderConfig(providerType) : null;
          
          return {
            installed,
            config,
            resolvedConfig,
          };
        },
      },
      {
        tool: {
          name: 'agent_install_provider',
          description: 'Install and configure a provider.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              providerType: {
                type: 'string',
                description: 'Provider type',
              },
              config: {
                type: 'object',
                description: 'Provider configuration (may include secret references)',
              },
            },
            required: ['agentTarget', 'providerType', 'config'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const providerType = args.providerType as ProviderType;
          await agent.installProvider(providerType, args.config);
          return {
            success: true,
          };
        },
      },
      {
        tool: {
          name: 'agent_update_provider',
          description: 'Update provider configuration.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              providerType: {
                type: 'string',
                description: 'Provider type',
              },
              config: {
                type: 'object',
                description: 'Updated configuration',
              },
            },
            required: ['agentTarget', 'providerType', 'config'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const providerType = args.providerType as ProviderType;
          await agent.updateProvider(providerType, args.config);
          return {
            success: true,
          };
        },
      },
      {
        tool: {
          name: 'agent_uninstall_provider',
          description: 'Uninstall a provider from an agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              providerType: {
                type: 'string',
                description: 'Provider type to uninstall',
              },
            },
            required: ['agentTarget', 'providerType'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const providerType = args.providerType as ProviderType;
          await agent.uninstallProvider(providerType);
          return {
            success: true,
          };
        },
      },
      {
        tool: {
          name: 'agent_validate_provider_config',
          description: 'Validate a provider configuration without installing it.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              providerType: {
                type: 'string',
                description: 'Provider type',
              },
              config: {
                type: 'object',
                description: 'Configuration to validate',
              },
            },
            required: ['agentTarget', 'providerType', 'config'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const providerType = args.providerType as ProviderType;
          const validation = await agent.validateProviderConfiguration(providerType, args.config);
          return validation;
        },
      },
      // MCP Server Management
      {
        tool: {
          name: 'agent_list_mcp_servers',
          description: 'List all MCP servers configured for an agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
            },
            required: ['agentTarget'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const servers = await agent.getAllMcpServers();
          return {
            servers,
            count: Object.keys(servers).length,
          };
        },
      },
      {
        tool: {
          name: 'agent_get_mcp_server',
          description: 'Get configuration for a specific MCP server.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              serverName: {
                type: 'string',
                description: 'Name of the MCP server',
              },
            },
            required: ['agentTarget', 'serverName'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const server = agent.getMcpServer(args.serverName);
          return {
            server,
          };
        },
      },
      {
        tool: {
          name: 'agent_add_mcp_server',
          description: 'Add a new MCP server configuration.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              serverName: {
                type: 'string',
                description: 'Name for the MCP server',
              },
              config: {
                type: 'object',
                description: 'MCP server configuration (type, command, args, url, headers, etc.)',
              },
            },
            required: ['agentTarget', 'serverName', 'config'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          
          // Check if server already exists
          const existing = agent.getMcpServer(args.serverName);
          if (existing) {
            throw new Error(`MCP server "${args.serverName}" already exists. Use agent_update_mcp_server to update it.`);
          }
          
          const mcpConfig: McpConfig = {
            name: args.serverName,
            config: args.config,
          };
          await agent.saveMcpServer(mcpConfig);
          return {
            success: true,
          };
        },
      },
      {
        tool: {
          name: 'agent_update_mcp_server',
          description: 'Update an existing MCP server configuration.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              serverName: {
                type: 'string',
                description: 'Name of the MCP server to update',
              },
              config: {
                type: 'object',
                description: 'Updated MCP server configuration (type, command, args, url, headers, etc.)',
              },
            },
            required: ['agentTarget', 'serverName', 'config'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          
          // Check if server exists
          const existing = agent.getMcpServer(args.serverName);
          if (!existing) {
            throw new Error(`MCP server "${args.serverName}" does not exist. Use agent_add_mcp_server to create it.`);
          }
          
          const mcpConfig: McpConfig = {
            name: args.serverName,
            config: args.config,
          };
          await agent.saveMcpServer(mcpConfig);
          return {
            success: true,
          };
        },
      },
      {
        tool: {
          name: 'agent_delete_mcp_server',
          description: 'Remove an MCP server from an agent.',
          inputSchema: {
            type: 'object',
            properties: {
              agentTarget: {
                type: 'string',
                description: 'Agent path',
              },
              serverName: {
                type: 'string',
                description: 'Name of the MCP server to remove',
              },
            },
            required: ['agentTarget', 'serverName'],
          },
        },
        handler: async (args) => {
          const agent = await this.resolveAgent(args.agentTarget);
          const deleted = await agent.deleteMcpServer(args.serverName);
          return {
            success: deleted,
          };
        },
      },
    ];

  /**
   * Override start to add agent-specific logging
   */
  async start(): Promise<void> {
    this.logger.info('Starting Agent Management MCP Server');
    
    // Call base class start
    await super.start();

    // After connecting to stdio, disable verbose logging
    if (this.logger instanceof ConsoleLogger) {
      (this.logger as ConsoleLogger).setVerbose(false);
    }

    this.logger.info('Agent Management MCP Server started');
  }
}

