import { ILLM, ILLMModel, LLMType, LLMProviderInfo } from '../../shared/llm';
import { Tool } from '@modelcontextprotocol/sdk/types';
import log from 'electron-log';
import { ChatMessage } from '../../shared/ChatSession';
import { ModelReply, Turn } from '../../shared/ModelReply';
import { ChatResponse, Message, Ollama, Tool as OllamaTool } from 'ollama'
import { WorkspaceManager } from '../state/WorkspaceManager';

export class OllamaLLM implements ILLM {
  private readonly workspace: WorkspaceManager;
  private readonly modelName: string;
  private readonly MAX_TURNS = 10;  // Maximum number of tool use turns

  private client!: Ollama;

  static getInfo(): LLMProviderInfo {
    return {
      name: "Ollama",
      description: "Run open-source large language models locally on your own hardware",
      website: "https://ollama.ai/",
      configValues: [
        {
          caption: "Ollama host",
          key: "OLLAMA_HOST",
          default: "http://127.0.0.1:11434"
        }
      ]
    };
  }

  constructor(modelName: string, workspace: WorkspaceManager) {
    this.modelName = modelName;
    this.workspace = workspace;
    
    try {
      const host = this.workspace.getProviderSettingsValue(LLMType.Ollama, 'OLLAMA_HOST') ?? 'http://127.0.0.1:11434';
      this.client = new Ollama({ host: host });
      log.info('Ollama LLM initialized successfully');
    } catch (error) {
      log.error('Failed to initialize Ollama LLM:', error);
      throw error;
    }
  }

  async getModels(): Promise<ILLMModel[]> {
    const modelList = await this.client.list();
    // log.info('Ollama models:', modelList.models);
    return modelList.models.map((model) => ({
      provider: LLMType.Ollama,
      id: model.model,
      name: model.name,
      modelSource: model.details?.family ?? "Unknown"
    }));
  }

  async generateResponse(messages: ChatMessage[]): Promise<ModelReply> {
    const modelReply: ModelReply = {
      timestamp: Date.now(),
      turns: []
    }

    try {
      log.info('Generating response with Ollama');

      // Convert our tools into an array of whatever Ollama expects 
      const tools: OllamaTool[] = this.workspace.mcpManager.getAllTools().map((tool: Tool) => {
        const properties: Record<string, any> = {};
        
        // Convert properties safely with type checking
        if (tool.inputSchema.properties && Array.isArray(tool.inputSchema.properties)) {
          tool.inputSchema.properties.forEach((property: any) => {
            if (property && property.name) {
              properties[property.name] = {
                type: property.type,
                description: property.description
              };
            }
          });
        }
        
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description ?? '',
            parameters: {
              type: 'object',
              properties: properties,
              required: Array.isArray(tool.inputSchema.required) ? tool.inputSchema.required : []
            }
          }
        };
      });

      // Turn our ChatMessage[] into an proper Ollama message array
      //
      // Note: Ollama doesn't use a tool call id, nor do they accept any information about the tool call in the tool call results
      //       messsage.  As far as I can tell, they way they correlate them (if they do) is by the order of the tool call and tool
      //       result messages.  So both here, and in the response processing later, we just add the simple tool results message
      //       immediately after the tool call message.
      //
      const turnMessages: Message[] = [];
      for (const message of messages) {
        if ('modelReply' in message) {
          // Process each turn in the LLM reply
          for (const turn of message.modelReply.turns) {
            // Add the assistant's message (including any tool calls)
            if (turn.message) {
              turnMessages.push({
                role: 'assistant' as const,
                content: turn.message ?? turn.error
              });
            }
            // Add the tool calls, if any
            if (turn.toolCalls && turn.toolCalls.length > 0) {
              for (const toolCall of turn.toolCalls) {
                // Push the tool call
                turnMessages.push({
                  role: 'assistant' as const,
                  content: '',
                  tool_calls: [
                    {
                      function: {
                        name: toolCall.serverName + '_' + toolCall.toolName,
                        arguments: toolCall.args ?? {},
                      }
                    }
                  ]
                });
                // Push the tool call result
                turnMessages.push({
                  role: 'tool' as const,
                  content: toolCall.output,
                });
              }
            }
          }
        } else {
          // Handle regular messages (including system prompt message)
          turnMessages.push({
            role: message.role,
            content: message.content
          });
        }
      }

      let currentResponse: ChatResponse | null = null;
 
      let turnCount = 0;
      while (turnCount < this.MAX_TURNS) {
        const turn: Turn = {};
        turnCount++;
        let hasToolUse = false;

        currentResponse = await this.client.chat({
          model: this.modelName,
          messages: turnMessages,
          tools: tools
        });
    
        // log.info('Ollama response:', JSON.stringify(currentResponse, null, 2));

        turn.inputTokens = currentResponse.prompt_eval_count ?? 0;
        turn.outputTokens = currentResponse.eval_count ?? 0;

        // process the current response
        const content = currentResponse.message.content;
        const toolCalls = currentResponse.message.tool_calls;

        if (content) {
          turn.message = content;
        }

        if (toolCalls) {
          log.info('Ollama tool calls:', toolCalls);

          // Process tool calls from the response
          for (const tool of toolCalls) {
            const toolName = tool.function.name;
            const toolArgs = tool.function.arguments;

            log.info('Calling function:', toolName);
            log.info('Arguments:', toolArgs);

            // Record the tool use request in the message context
            turnMessages.push({
              role: 'assistant' as const,
              content: '',
              tool_calls: [
                {
                  function: {
                      name: toolName,
                      arguments: toolArgs ?? {},
                  }
                }
              ]
            });
            
            // Call the tool  
            const result = await this.workspace.mcpManager.callTool(toolName, toolArgs);
            log.info('Tool result:', result);
  
            const toolResultContent = result.content[0];
            if (toolResultContent && toolResultContent.type === 'text') {
              turnMessages.push({
                role: 'tool',
                content: toolResultContent.text,
              });

              if (!turn.toolCalls) {
                turn.toolCalls = [];
              }

              turn.toolCalls.push({
                serverName: this.workspace.mcpManager.getToolServerName(toolName),
                toolName: this.workspace.mcpManager.getToolName(toolName),
                args: toolArgs ?? {},
                toolCallId: Math.random().toString(16).slice(2, 10), // Random ID, since Ollama doesn't provide one
                output: toolResultContent?.text ?? '',
                elapsedTimeMs: result.elapsedTimeMs,
                error: undefined
              });
            }

            hasToolUse = true;
          }
        }
        
        modelReply.turns.push(turn);

        // Break if no tool uses in this turn
        if (!hasToolUse) break;  
      }
      
      if (turnCount >= this.MAX_TURNS) {
        modelReply.turns.push({
          error: 'Maximum number of tool uses reached'
        });
      }

      log.info('Ollama response generated successfully');
      return modelReply;
    } catch (error: any) {
      log.error('Ollama API error:', error.message);
      modelReply.turns.push({
        error: `Error: Failed to generate response from Ollama - ${error.message}`
      });
      return modelReply;
    }
  }
}