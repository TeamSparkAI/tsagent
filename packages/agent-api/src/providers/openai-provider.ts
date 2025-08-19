import { Provider, ProviderModel, ProviderType, ProviderInfo } from './types';
import OpenAI from 'openai';
import { Tool } from "@modelcontextprotocol/sdk/types";
import { ChatMessage, TOOL_CALL_DECISION_ALLOW_ONCE, TOOL_CALL_DECISION_ALLOW_SESSION, TOOL_CALL_DECISION_DENY, ChatSession } from '../types/chat';
import { ModelReply, Turn } from './types';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { Agent } from '../types/agent';
import { Logger } from '../types/common';
import { ProviderHelper } from './provider-helper';

export class OpenAIProvider implements Provider {
  private readonly agent: Agent;
  private readonly modelName: string;
  private readonly logger: Logger;
  private client!: OpenAI;

  private convertMCPToolToOpenAIFunction(tool: Tool): OpenAI.ChatCompletionCreateParams.Function {
    return {
      name: tool.name,
      description: tool.description || undefined,
      parameters: {
        type: 'object',
        properties: tool.inputSchema.properties || {},
        required: tool.inputSchema.required || []
      }
    };
  }

  static getInfo(): ProviderInfo {
    return {
      name: "OpenAI",
      description: "OpenAI models including GPT-3.5, GPT-4, and other advanced language models",
      website: "https://openai.com",
      configValues: [
        {
          caption: "OpenAI API key",
          key: "OPENAI_API_KEY",
          secret: true,
          required: true,
        }
      ]
    };
  }

  static async validateConfiguration(agent: Agent, config: Record<string, string>): Promise<{ isValid: boolean, error?: string }> {
    const apiKey = config['OPENAI_API_KEY'];
    if (!apiKey) {
      return { isValid: false, error: 'OPENAI_API_KEY is missing in the configuration. Please add it to your config.json file.' };
    }
    try {
      const client = new OpenAI({ apiKey });
      await client.models.list();
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Failed to validate OpenAI configuration: ' + (error instanceof Error && error.message ? ': ' + error.message : '') };
    }
  }

  constructor(modelName: string, agent: Agent, logger: Logger) {
    this.modelName = modelName;
    this.agent = agent;
    this.logger = logger;

    const config = this.agent.getInstalledProviderConfig(ProviderType.OpenAI);
    if (!config) {
      throw new Error('OpenAI configuration is missing.');
    }
    
    try {
      const apiKey = config['OPENAI_API_KEY']!;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is missing in the configuration. Please add it to your config.json file.');
      }
      this.client = new OpenAI({ apiKey });
      this.logger.info('OpenAI Provider initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize OpenAI Provider:', error);
      throw error;
    }
  }

  async getModels(): Promise<ProviderModel[]> {
    const modelList = await this.client.models.list();
    const killwords = ["dall-e", "tts", "whisper", "embedding", "embed", "audio", "transcribe", "moderation", "babbage", "davinci"];
    const filteredModels = modelList.data.filter(model => 
      !killwords.some(word => model.id.toLowerCase().includes(word))
    );
    //this.logger.info('OpenAI models:', filteredModels);
    return filteredModels.map((model) => ({
      provider: ProviderType.OpenAI,
      id: model.id,
      name: model.id,
      modelSource: "OpenAI"
    }));
  }

  // Note: The OpenAI chat API is stateless, so we need to establish the initial state using our ChatMessage[] context (passed in
  //       as messages).  Then as we are processing turns, we also need to add any reponses we receive from the model, as well as
  //       any replies we make (such as tool call results), to this state.
  //
  async generateResponse(session: ChatSession, messages: ChatMessage[]): Promise<ModelReply> {
    const modelReply: ModelReply = {
      timestamp: Date.now(),
      turns: []
    }

    try {
      // Turn our ChatMessage[] into a OpenAPI API ChatCompletionMessageParam[]
      let turnMessages: OpenAI.ChatCompletionMessageParam[] = [];
      for (const message of messages) {
        if ('modelReply' in message) {
          if (message.modelReply.turns.length == 0) {
            // This is the case where the LLM returns a tool call approval, but no other response
            continue;
          }

          // Process each turn in the LLM reply
          for (const turn of message.modelReply.turns) {
            // Add the assistant's message (including any tool calls)
            const reply: ChatCompletionMessageParam = {
              role: "assistant" as const,
              content: turn.message ?? turn.error,
            };
            // Add the tool calls, if any
            if (turn.toolCalls && turn.toolCalls.length > 0) {
              reply.tool_calls = [];
              for (const toolCall of turn.toolCalls) {
                // Push the tool call
                reply.tool_calls.push({
                  type: 'function',
                  id: toolCall.toolCallId!,
                  function: {
                    name: toolCall.serverName + '_' + toolCall.toolName,
                    arguments: JSON.stringify(toolCall.args ?? {}),
                  },
                });
              }
            }
            turnMessages.push(reply);

            // Add the tool call results, if any
            if (turn.toolCalls && turn.toolCalls.length > 0) {
              for (const toolCall of turn.toolCalls) {
                // Push the tool call result
                turnMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.toolCallId!,
                  content: toolCall.output
                });
              }
            }
          }
        } else if (message.role != 'approval') {
          // Handle regular messages
          turnMessages.push({
            // Convert to a role that OpenAI API accepts (user or assistant)
            role: message.role === 'error' ? 'assistant' : message.role,
            content: message.content,
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
        const toolCallsContent: ChatCompletionMessageParam = {
          role: "assistant",
          tool_calls: []
        };
        const toolCallsResults: ChatCompletionMessageParam[] = [];
        const turn: Turn = { toolCalls: [] };
        for (const toolCallApproval of lastChatMessage.toolCallApprovals) {
          this.logger.info('Model processing tool call approval', JSON.stringify(toolCallApproval, null, 2));
          const functionName = toolCallApproval.serverName + '_' + toolCallApproval.toolName;

          // Add the tool call to the context history
          toolCallsContent.tool_calls!.push({
            type: 'function',
            id: toolCallApproval.toolCallId!,
            function: {
              name: functionName,
              arguments: JSON.stringify(toolCallApproval.args ?? {}),
            },
          });

          if (toolCallApproval.decision === TOOL_CALL_DECISION_ALLOW_SESSION) {
            session.toolIsApprovedForSession(toolCallApproval.serverName, toolCallApproval.toolName);
          }
          if (toolCallApproval.decision === TOOL_CALL_DECISION_ALLOW_SESSION || toolCallApproval.decision === TOOL_CALL_DECISION_ALLOW_ONCE) {
            // Run the tool
            const toolResult = await ProviderHelper.callTool(this.agent, functionName, toolCallApproval.args, session);
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
              toolCallsResults.push({
                role: "tool",
                tool_call_id: toolCallApproval.toolCallId!,
                content: resultText
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
            toolCallsResults.push({
              role: "tool",
              tool_call_id: toolCallApproval.toolCallId!,
              content: 'Tool call denied'
            });
          }
        }
        modelReply.turns.push(turn);    
        // Add the final resolved tool call approvals to the context history and the current prompt
        turnMessages.push(toolCallsContent);
        turnMessages.push(...toolCallsResults);
      }

      // this.logger.info('Starting OpenAI Provider with messages:', JSON.stringify(turnMessages, null, 2));

      const tools = await ProviderHelper.getAllTools(this.agent);
      const functions = tools.map(tool => this.convertMCPToolToOpenAIFunction(tool));

      const state = session.getState();

      let turnCount = 0;
      while (turnCount < state.maxChatTurns) {
        const turn: Turn = {};
        let hasToolUse = false;
        turnCount++;
        this.logger.debug(`Processing turn ${turnCount}`);

        const completion = await this.client.chat.completions.create({
          model: this.modelName,
          messages: turnMessages,
          tools: functions.length > 0 ? functions.map(fn => ({ type: 'function', function: fn })) : undefined,
          tool_choice: functions.length > 0 ? 'auto' : undefined,
          max_tokens: state.maxOutputTokens,
          temperature: state.temperature,
          top_p: state.topP,
        });

        const response = completion.choices[0]?.message;
        if (!response) {
          throw new Error('No response from OpenAI');
        }

        // this.logger.info('OpenAIresponse', JSON.stringify(response, null, 2));

        turn.inputTokens = completion.usage?.prompt_tokens ?? 0;
        turn.outputTokens = completion.usage?.completion_tokens ?? 0;

        if (completion.choices[0]?.finish_reason === 'length') {
          this.logger.warn('Maximum number of tokens reached for this response');
          turn.error = 'Maximum number of tokens reached for this response.  Increase the Maximum Output Tokens setting if desired.';
        }

        if (response.content) {
          turn.message = (turn.message || '') + response.content;
        }
        
        if (response.tool_calls && response.tool_calls.length > 0) {
          hasToolUse = true;
          // Add the assistant's message with the tool calls (we add it here because we only need it in the state if we're calling
          // a tool and then doing another turn that relies on that state).
          turnMessages.push(response);

          // Process all tool calls
          for (const toolCall of response.tool_calls) {
            if (toolCall.type === 'function') {
              this.logger.info('Processing function call:', toolCall.function);

              const toolServerName = ProviderHelper.getToolServerName(toolCall.function.name);
              const toolToolName = ProviderHelper.getToolName(toolCall.function.name);
  
              if (await session.isToolApprovalRequired(toolServerName, toolToolName)) {
                // Process tool approval
                if (!modelReply.pendingToolCalls) {
                  modelReply.pendingToolCalls = [];
                }
                modelReply.pendingToolCalls.push({
                  serverName: toolServerName,
                  toolName: toolToolName,
                  args: JSON.parse(toolCall.function.arguments),
                  toolCallId: toolCall.id
                });
              } else {
                // Call the tool
                const toolResult = await ProviderHelper.callTool(this.agent, toolCall.function.name, JSON.parse(toolCall.function.arguments), session);
                if (toolResult.content[0]?.type === 'text') {
                  const resultText = toolResult.content[0].text;
                  if (!turn.toolCalls) {
                    turn.toolCalls = [];
                  }
    
                  // Record the tool result in the message context
                  turnMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: resultText
                  });
                  
                  // Record the function call and result
                  turn.toolCalls.push({
                    serverName: ProviderHelper.getToolServerName(toolCall.function.name),
                    toolName: ProviderHelper.getToolName(toolCall.function.name),
                    args: JSON.parse(toolCall.function.arguments),
                    output: resultText,
                    toolCallId: toolCall.id,
                    elapsedTimeMs: toolResult.elapsedTimeMs,
                  });    
                }
              }
            }
          }
        }

        if (turn.message || turn.toolCalls) {
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

      this.logger.info('OpenAI response generated successfully');
      return modelReply;
    } catch (error: unknown) {
      this.logger.error('OpenAI API error:', error instanceof Error ? error.message : 'Unknown error');
      modelReply.turns.push({
        error: `Error: Failed to generate response from OpenAI - ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return modelReply;            
    }
  }
}