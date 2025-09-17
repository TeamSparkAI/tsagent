import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { A2AClient } from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';

interface AgentInfo {
  agentId: string;
  name: string;
  description: string;
  version: string;
  url: string;
  provider: {
    organization: string;
    url: string;
  };
  iconUrl: string;
  documentationUrl: string;
  skills: Array<{
    id: string;
    name: string;
    description: string;
    examples?: string[];
    inputModes?: string[];
    outputModes?: string[];
    tags: string[];
  }>;
  capabilities: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
}

export class A2AMCPServer {
  private server: Server;
  private clients: Map<string, A2AClient> = new Map();
  private a2aEndpoints: string[] = [];
  private agentMap: Map<string, string> = new Map(); // agentId -> endpoint

  constructor(a2aEndpoints: string[] = []) {
    this.a2aEndpoints = a2aEndpoints;
    this.server = new Server(
      {
        name: 'a2a-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'a2a_list_agents',
            description: 'List all available A2A agents and their capabilities',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            },
            outputSchema: {
              type: 'object',
              properties: {
                agents: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      agentId: { type: 'string', description: 'Unique agent identifier' },
                      name: { type: 'string', description: 'Agent name' },
                      description: { type: 'string', description: 'Agent description' },
                      version: { type: 'string', description: 'Agent version' },
                      url: { type: 'string', description: 'Agent endpoint URL' },
                      provider: { type: 'object', properties: { organization: { type: 'string' }, url: { type: 'string' } } },
                      iconUrl: { type: 'string', description: 'Agent icon URL' },
                      documentationUrl: { type: 'string', description: 'Agent documentation URL' },
                      skills: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            description: { type: 'string' },
                            examples: { type: 'array', items: { type: 'string' } },
                            inputModes: { type: 'array', items: { type: 'string' } },
                            outputModes: { type: 'array', items: { type: 'string' } },
                            tags: { type: 'array', items: { type: 'string' } }
                          }
                        }
                      },
                      capabilities: {
                        type: 'object',
                        properties: {
                          streaming: { type: 'boolean' },
                          pushNotifications: { type: 'boolean' },
                          stateTransitionHistory: { type: 'boolean' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          {
            name: 'a2a_send_message',
            description: 'Send a message to a specific A2A agent',
            inputSchema: {
              type: 'object',
              properties: {
                agentId: { 
                  type: 'string', 
                  description: 'Unique ID of the A2A agent (from a2a_list_agents)' 
                },
                message: { 
                  type: 'string', 
                  description: 'The message to send to the agent' 
                }
              },
              required: ['agentId', 'message']
            },
            outputSchema: {
              type: 'object',
              properties: {
                response: { type: 'string', description: 'Agent response text' },
                taskId: { type: 'string', description: 'Task ID if applicable' },
                status: { type: 'string', description: 'Response status' }
              }
            }
          }
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      if (!args) {
        throw new Error('No arguments provided');
      }

      switch (name) {
        case 'a2a_list_agents':
          return await this.handleListAgents();
        case 'a2a_send_message':
          return await this.handleSendMessage(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async getAgentCard(endpoint: string): Promise<any> {
    const response = await fetch(`${endpoint}/.well-known/agent-card.json`);
    if (!response.ok) {
      throw new Error(`Failed to fetch agent card: ${response.status}`);
    }
    return response.json();
  }

  private async handleListAgents() {
    const agents: AgentInfo[] = [];
    
    for (let i = 0; i < this.a2aEndpoints.length; i++) {
      const endpoint = this.a2aEndpoints[i];
      try {
        const agentCard = await this.getAgentCard(endpoint);
        const agentId = `agent_${String(i + 1).padStart(3, '0')}`;
        
        // Map agent ID to endpoint
        this.agentMap.set(agentId, endpoint);
        
        agents.push({
          agentId: agentId,
          name: agentCard.name,
          description: agentCard.description,
          version: agentCard.version,
          url: endpoint,
          provider: agentCard.provider,
          iconUrl: agentCard.iconUrl,
          documentationUrl: agentCard.documentationUrl,
          skills: agentCard.skills || [],
          capabilities: {
            streaming: agentCard.capabilities?.streaming,
            pushNotifications: agentCard.capabilities?.pushNotifications,
            stateTransitionHistory: agentCard.capabilities?.stateTransitionHistory
          }
        });
      } catch (error) {
        console.error(`Failed to get agent card from ${endpoint}:`, error);
      }
    }

    console.error('A2A MCP Server agents:', { agents });

    // Because we provide outputSchema for the tools, we are required to produce structuredContent that fulfills that schema
    // (some models will produce an error if there is an outputSchema and no structuredContent).  In practice, some models do
    // not support structuredContent and still others that do support (and require) structuredContent will produce errors if a
    // content value is not returned (even when there is a structuredContent value).  So we return both the "structuredContent"
    // value and a plaintext version of that same data as "content".

    const getAgentDetails = (agent: AgentInfo) => {    
      return '**' + agent.name + '** (AgentId: ' + agent.agentId + ')\n' +
             'Description: ' + agent.description + '\n' +
             'Version: ' + agent.version + '\n'
    };

    return {
      content: [
        {
          type: 'text',
          text: `Found ${agents.length} A2A agents: ${agents.map(getAgentDetails).join('\n')}`
        }
      ],
      structuredContent: { agents }
    };
  }

  private async handleSendMessage(args: any) {
    const { agentId, message } = args;
    
    if (!agentId || !message) {
      throw new Error('agentId and message are required');
    }
    
    // Get endpoint for this agent ID
    const endpoint = this.agentMap.get(agentId);
    if (!endpoint) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    // Get or create client for this endpoint
    let client = this.clients.get(endpoint);
    if (!client) {
      const agentCardUrl = `${endpoint}/.well-known/agent-card.json`;
      client = await A2AClient.fromCardUrl(agentCardUrl);
      this.clients.set(endpoint, client);
    }
    
    console.error('Sending message to A2A MCP Server client:', { client });

    try {
      // Send message to agent
      const response = await client.sendMessage({
        message: {
          kind: 'message',
          messageId: uuidv4(),
          role: 'user',
          parts: [{ kind: 'text', text: message }],
        },
      });
      
      // Extract response information
      let responseText = 'No response from agent';
      let taskId = '';
      let status = 'unknown';

      console.error('A2A MCP Server response:', JSON.stringify(response, null, 2));
      
      // Extract the actual result from the JSON-RPC response
      const result = 'result' in response ? response.result : null;
      if (!result) {
        throw new Error('No result in A2A response');
      }
      
      /* Result example:
      {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {
          "kind": "message",
          "messageId": "cb82aca7-23c1-463c-ba99-6945aea5538a",
          "role": "agent",
          "parts": [
            {
              "kind": "text",
              "text": "This is the model response text"
            }
          ],
          "contextId": "dd16b42e-27a4-4321-889e-7d002cfc4249"
        }
      }
      */

      if (result && typeof result === 'object') {
        // Handle different possible response structures
        if (result.kind === 'task') {
          // Task response
          taskId = String(result.id || '');
          status = result.status?.state || 'unknown';
          responseText = result.status?.message?.parts
            ?.filter((part: any) => part.kind === 'text')
            ?.map((part: any) => part.text)
            ?.join('\n') || 'Task created';
        } else if (result.kind === 'message') {
          // Direct message response
          responseText = result.parts
            ?.filter((part: any) => part.kind === 'text')
            ?.map((part: any) => part.text)
            ?.join('\n') || 'No response text';
          status = 'completed';
        } else {
          // Fallback: try to extract any text content
          responseText = JSON.stringify(result, null, 2);
          status = 'completed';
        }
      }
      
      // See note above about returning both "structuredContent" and a plaintext version of that same data as "content".

      // !!! If we can determine that the agents can access strucutred content, maybe we just return the responseText as content

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              response: responseText,
              taskId: taskId,
              status: status
            }, null, 2),
          },
        ],
        structuredContent: {
          response: responseText,
          taskId: taskId,
          status: status
        }
      };
    } catch (error) {
      throw new Error(`Failed to send message to agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('A2A MCP Server running on stdio');
  }
}

// Parse command line arguments for A2A endpoints
const args = process.argv.slice(2);
const a2aEndpoints = args.length > 0 ? args : null;
if (!a2aEndpoints) {
  console.error('Error: A2A endpoints are required');
  process.exit(1);
}

console.error('A2A MCP Server starting with endpoints:', a2aEndpoints);

const server = new A2AMCPServer(a2aEndpoints);
server.start().catch(console.error);

export default A2AMCPServer;