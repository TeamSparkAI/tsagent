import { ILLM, ILLMModel, LLMType, LLMProviderInfo } from '../../shared/llm';
import { Tool } from '@modelcontextprotocol/sdk/types';
import log from 'electron-log';
import { ChatMessage, TOOL_CALL_DECISION_ALLOW_ONCE, TOOL_CALL_DECISION_ALLOW_SESSION, TOOL_CALL_DECISION_DENY } from '../../shared/ChatSession';
import { ModelReply, Turn } from '../../shared/ModelReply';
import { ChatResponse, Message, Ollama, Tool as OllamaTool } from 'ollama'
import { WorkspaceManager } from '../state/WorkspaceManager';
import { ChatSession } from '../state/ChatSession';

export class OllamaLLM implements ILLM {
  private readonly workspace: WorkspaceManager;
  private readonly modelName: string;

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

  static async validateConfiguration(workspace: WorkspaceManager): Promise<{ isValid: boolean, error?: string }> {
    const host = workspace.getProviderSettingsValue(LLMType.Ollama, 'OLLAMA_HOST') ?? 'http://127.0.0.1:11434';
    try {
      const client = new Ollama({ host: host });
      await client.list();
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Failed to validate Ollama configuration: ' + (error instanceof Error && error.message ? ': ' + error.message : '') };
    }
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

  async generateResponse(session: ChatSession, messages: ChatMessage[]): Promise<ModelReply> {
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
          if (message.modelReply.turns.length == 0) {
            // This is the case where the LLM returns a tool call approval, but no other response
            continue;
          }

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
        const turn: Turn = { toolCalls: [] };
        for (const toolCallApproval of lastChatMessage.toolCallApprovals) {
          log.info('Model processing tool call approval', JSON.stringify(toolCallApproval, null, 2));
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
            const toolResult = await this.workspace.mcpManager.callTool(functionName, toolCallApproval.args, session);
            if (toolResult.content[0]?.type === 'text') {
              const resultText = toolResult.content[0].text;
              turn.toolCalls!.push({
                serverName: toolCallApproval.serverName,
                toolName: toolCallApproval.toolName,
                args: toolCallApproval.args,
                toolCallId: toolCallApproval.toolCallId,
                output: resultText,
                elapsedTimeMs: toolResult.elapsedTimeMs,
                error: undefined
              });
              // Add the tool call (executed) result to the context history
              turnMessages.push({
                role: 'tool' as const,
                content: resultText,
              });
            }
          } else if (toolCallApproval.decision === TOOL_CALL_DECISION_DENY) {
            // Record the tool call and "denied" result
            turn.toolCalls!.push({
              serverName: toolCallApproval.serverName,
              toolName: toolCallApproval.toolName,
              args: toolCallApproval.args,
              toolCallId: toolCallApproval.toolCallId,
              output: 'Tool call denied',
              elapsedTimeMs: 0,
              error: 'Tool call denied'
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
 
      let turnCount = 0;
      while (turnCount < session.maxChatTurns) {
        const turn: Turn = {};
        turnCount++;
        let hasToolUse = false;

        // log.info('Ollama turn messages:', turnMessages);

        currentResponse = await this.client.chat({
          model: this.modelName,
          messages: turnMessages,
          tools: tools,
          options: {
            num_predict: session.maxOutputTokens,
            temperature: session.temperature,
            top_p: session.topP
          }
        });
    
        // log.info('Ollama response:', JSON.stringify(currentResponse, null, 2));

        turn.inputTokens = currentResponse.prompt_eval_count ?? 0;
        turn.outputTokens = currentResponse.eval_count ?? 0;

        if (currentResponse.done_reason === 'length') {
          log.warn('Maximum number of tokens reached for this response');
          turn.error = 'Maximum number of tokens reached for this response.  Increase the Maximum Output Tokens setting if desired.';
        }

        // process the current response
        const content = currentResponse.message.content;
        const toolCalls = currentResponse.message.tool_calls;

        if (content) {
          turn.message = content;
          // !!! Does this need to be added to the turnMessages so that the LLM had the context for subsequent turns?
        }

        if (toolCalls) {
          log.info('Ollama tool calls:', toolCalls);

          // Process tool calls from the response
          for (const tool of toolCalls) {
            const toolName = tool.function.name;
            const toolArgs = tool.function.arguments;

            const toolServerName = this.workspace.mcpManager.getToolServerName(toolName);
            const toolToolName = this.workspace.mcpManager.getToolName(toolName);
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
              const toolResult = await this.workspace.mcpManager.callTool(toolName, toolArgs, session);
              if (toolResult.content[0]?.type === 'text') {
                const resultText = toolResult.content[0].text;
                if (!turn.toolCalls) {
                  turn.toolCalls = [];
                }
    
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
  
                turn.toolCalls.push({
                  serverName: toolServerName,
                  toolName: toolToolName,
                  args: toolArgs ?? {},
                  toolCallId: toolCallId,
                  output: resultText,
                  elapsedTimeMs: toolResult.elapsedTimeMs,
                  error: undefined
                });
              }
  
              hasToolUse = true;  
            }
          }
        }
        
        if (turn.message || turn.toolCalls) {
          modelReply.turns.push(turn);
        }

        // Break if no tool uses in this turn, or if there are pending tool calls (requiring approval)
        if (!hasToolUse || (modelReply.pendingToolCalls && modelReply.pendingToolCalls.length > 0)) break;
      }
      
      if (turnCount >= session.maxChatTurns) {
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