import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { ChatResponse, Message, Ollama, Tool as OllamaTool } from 'ollama';

import { Provider, ProviderModel, ProviderType, ProviderInfo } from './types.js';
import { ChatMessage, TOOL_CALL_DECISION_ALLOW_ONCE, TOOL_CALL_DECISION_ALLOW_SESSION, TOOL_CALL_DECISION_DENY, ChatSession } from '../types/chat.js';
import { ModelReply, Turn } from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { ProviderHelper } from './provider-helper.js';

export class OllamaProvider implements Provider {
  private readonly agent: Agent;
  private readonly modelName: string;
  private readonly logger: Logger;

  private client!: Ollama;

  static getInfo(): ProviderInfo {
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

  static async validateConfiguration(agent: Agent, config: Record<string, string>): Promise<{ isValid: boolean, error?: string }> {
    const host = config['OLLAMA_HOST'] ?? 'http://127.0.0.1:11434';
    try {
      const client = new Ollama({ host: host });
      await client.list();
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Failed to validate Ollama configuration: ' + (error instanceof Error && error.message ? ': ' + error.message : '') };
    }
  }

  constructor(modelName: string, agent: Agent, logger: Logger) {
    this.modelName = modelName;
    this.agent = agent;
    this.logger = logger;

    const config = this.agent.getInstalledProviderConfig(ProviderType.Ollama);
    if (!config) {
      throw new Error('Ollama configuration is missing.');
    }
    
    try {
      const host = config['OLLAMA_HOST'] ?? 'http://127.0.0.1:11434';
      this.client = new Ollama({ host: host });
      this.logger.info('Ollama Provider initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Ollama Provider:', error);
      throw error;
    }
  }

  async getModels(): Promise<ProviderModel[]> {
    const modelList = await this.client.list();
    // this.logger.info('Ollama models:', modelList.models);
    return modelList.models.map((model) => ({
      provider: ProviderType.Ollama,
      id: model.model,
      name: model.name,
      modelSource: model.details?.family ?? "Unknown"
    }));
  }

  async generateResponse(session: ChatSession, messages: ChatMessage[]): Promise<ModelReply> {
    const modelReply: ModelReply = {
      timestamp: Date.now(),
      turns: []
    }

    try {
      this.logger.info('Generating response with Ollama');

      // Convert our tools into an array of whatever Ollama expects 
      const tools: OllamaTool[] = (await ProviderHelper.getIncludedTools(this.agent, session)).map((tool: Tool) => {
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
          if (message.modelReply.turns.length == 0) {
            // This is the case where the LLM returns a tool call approval, but no other response
            continue;
          }

          // Process each turn in the LLM reply
          for (const turn of message.modelReply.turns) {
            // Add the assistant's message (including any tool calls)
            if (turn.results) {
              for (const result of turn.results) {
                if (result.type === 'text') {
                  turnMessages.push({
                    role: 'assistant' as const,
                    content: result.text
                  });
                } else if (result.type === 'toolCall') {
                  // Push the tool call
                  turnMessages.push({
                    role: 'assistant' as const,
                    content: '',
                    tool_calls: [
                      {
                        function: {
                          name: result.toolCall.serverName + '_' + result.toolCall.toolName,
                          arguments: result.toolCall.args ?? {},
                        }
                      }
                    ]
                  });
                  // Push the tool call result
                  turnMessages.push({
                    role: 'tool' as const,
                    content: result.toolCall.output,
                  });
                }
              }
            } else if (turn.error) {
              turnMessages.push({
                role: 'assistant' as const,
                content: turn.error
              });
            }
          }
        } else if (message.role != 'approval') {
          // Handle regular messages (including system prompt message)
          turnMessages.push({
            role: message.role,
            content: message.content
          });
        }
      } 

      // In processing tool call approvals, we need to do the following:
      // - Add the tool call result to the model reply, as a turn (generic)
      // - Add the tool call and result to the context history (LLM specific)

      // We're only going to process tool call approvals if it's the last message in the chat history
      const lastChatMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
      if (lastChatMessage && 'toolCallApprovals' in lastChatMessage) {
        // Handle tool call approvals        
        const turn: Turn = { results: [] };
        for (const toolCallApproval of lastChatMessage.toolCallApprovals) {
          this.logger.info('Model processing tool call approval', JSON.stringify(toolCallApproval, null, 2));
          const functionName = toolCallApproval.serverName + '_' + toolCallApproval.toolName;

          // Add the tool call to the context history
          turnMessages.push({
            role: 'assistant' as const,
            content: '',
            tool_calls: [
              {
                function: {
                  name: functionName,
                  arguments: toolCallApproval.args ?? {},
                }
              }
            ]
          });

          if (toolCallApproval.decision === TOOL_CALL_DECISION_ALLOW_SESSION) {
            session.toolIsApprovedForSession(toolCallApproval.serverName, toolCallApproval.toolName);
          }
          if (toolCallApproval.decision === TOOL_CALL_DECISION_ALLOW_SESSION || toolCallApproval.decision === TOOL_CALL_DECISION_ALLOW_ONCE) {
            // Run the tool
            const toolResult = await ProviderHelper.callTool(this.agent, functionName, toolCallApproval.args, session);
            if (toolResult.content[0]?.type === 'text') {
              const resultText = toolResult.content[0].text;
              turn.results!.push({
                type: 'toolCall',
                toolCall: {
                  serverName: toolCallApproval.serverName,
                  toolName: toolCallApproval.toolName,
                  args: toolCallApproval.args,
                  toolCallId: toolCallApproval.toolCallId,
                  output: resultText,
                  elapsedTimeMs: toolResult.elapsedTimeMs,
                  error: undefined
                }
              });
              // Add the tool call (executed) result to the context history
              turnMessages.push({
                role: 'tool' as const,
                content: resultText,
              });
            }
          } else if (toolCallApproval.decision === TOOL_CALL_DECISION_DENY) {
            // Record the tool call and "denied" result
            turn.results!.push({
              type: 'toolCall',
              toolCall: {
                serverName: toolCallApproval.serverName,
                toolName: toolCallApproval.toolName,
                args: toolCallApproval.args,
                toolCallId: toolCallApproval.toolCallId,
                output: 'Tool call denied',
                elapsedTimeMs: 0,
                error: 'Tool call denied'
              }
            });
            // Add the tool call (denied) result to the context history
            turnMessages.push({
              role: 'tool' as const,
              content: 'Tool call denied',
            });
          }
        }
        modelReply.turns.push(turn);    
      }

      let currentResponse: ChatResponse | null = null;
 
      const state = session.getState();

      let turnCount = 0;
      while (turnCount < state.maxChatTurns) {
        const turn: Turn = { results: [] };
        turnCount++;
        let hasToolUse = false;

        // this.logger.info('Ollama turn messages:', turnMessages);

        currentResponse = await this.client.chat({
          model: this.modelName,
          messages: turnMessages,
          tools: tools,
          options: {
            num_predict: state.maxOutputTokens,
            temperature: state.temperature,
            top_p: state.topP
          }
        });
    
        // this.logger.info('Ollama response:', JSON.stringify(currentResponse, null, 2));

        turn.inputTokens = currentResponse.prompt_eval_count ?? 0;
        turn.outputTokens = currentResponse.eval_count ?? 0;

        if (currentResponse.done_reason === 'length') {
          this.logger.warn('Maximum number of tokens reached for this response');
          turn.error = 'Maximum number of tokens reached for this response.  Increase the Maximum Output Tokens setting if desired.';
        }

        // process the current response
        const content = currentResponse.message.content;
        const toolCalls = currentResponse.message.tool_calls;

        if (content) {
          turn.results!.push({
            type: 'text',
            text: content
          });
          // !!! Does this need to be added to the turnMessages so that the LLM had the context for subsequent turns?
        }

        if (toolCalls) {
          this.logger.info('Ollama tool calls:', toolCalls);

          // Process tool calls from the response
          for (const tool of toolCalls) {
            const toolName = tool.function.name;
            const toolArgs = tool.function.arguments;

            const toolServerName = ProviderHelper.getToolServerName(toolName);
            const toolToolName = ProviderHelper.getToolName(toolName);
            const toolCallId = Math.random().toString(16).slice(2, 10); // Random ID, since VertexAI doesn't provide one

            if (await session.isToolApprovalRequired(toolServerName, toolToolName)) {
              // Process tool approval
              if (!modelReply.pendingToolCalls) {
                modelReply.pendingToolCalls = [];
              }
              modelReply.pendingToolCalls.push({
                serverName: toolServerName,
                toolName: toolToolName,
                args: toolArgs,
                toolCallId: toolCallId
              });
            } else {
              // Call the tool              
              const toolResult = await ProviderHelper.callTool(this.agent, toolName, toolArgs, session);
              if (toolResult.content[0]?.type === 'text') {
                const resultText = toolResult.content[0].text;
    
                // Record the tool use request and result in the message context
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

                turnMessages.push({
                  role: 'tool',
                  content: resultText,
                });
  
                turn.results!.push({
                  type: 'toolCall',
                  toolCall: {
                    serverName: toolServerName,
                    toolName: toolToolName,
                    args: toolArgs ?? {},
                    toolCallId: toolCallId,
                    output: resultText,
                    elapsedTimeMs: toolResult.elapsedTimeMs,
                    error: undefined
                  }
                });
              }
  
              hasToolUse = true;  
            }
          }
        }
        
        if (turn.results && turn.results.length > 0) {
          modelReply.turns.push(turn);
        }

        // Break if no tool uses in this turn, or if there are pending tool calls (requiring approval)
        if (!hasToolUse || (modelReply.pendingToolCalls && modelReply.pendingToolCalls.length > 0)) break;
      }
      
      if (turnCount >= state.maxChatTurns) {
        modelReply.turns.push({
          error: 'Maximum number of tool uses reached'
        });
      }

      this.logger.info('Ollama response generated successfully');
      return modelReply;
    } catch (error: unknown) {
      this.logger.error('Ollama API error:', error instanceof Error ? error.message : 'Unknown error');
      modelReply.turns.push({
        error: `Error: Failed to generate response from Ollama - ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return modelReply;
    }
  }
}