import { Tool } from "../mcp/types.js";
import { z } from 'zod';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat';

import { ProviderModel, ProviderId, ProviderInfo, Provider } from './types.js';
import { ChatMessage, ChatSession } from '../types/chat.js';
import { ModelReply, Turn } from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { ProviderHelper } from './provider-helper.js';
import { BaseProvider } from './base-provider.js';
import { ProviderDescriptor } from './provider-descriptor.js';

const OpenAIConfigSchema = z.object({
  OPENAI_API_KEY: z.string().default('env://OPENAI_API_KEY'),
});

// Internal type (not exported - provider details stay encapsulated)
type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;

// Provider Descriptor
export default class OpenAIProviderDescriptor extends ProviderDescriptor {
  readonly providerId = 'openai';
  readonly iconPath = 'assets/providers/openai.png';
  
  readonly info: ProviderInfo = {
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
  
  readonly configSchema = OpenAIConfigSchema;
  
  constructor(packageRoot: string) {
    super(packageRoot);
  }
  
  getDefaultModelId(): string {
    return 'gpt-3.5-turbo';
  }
  
  // Override for API connectivity check
  protected async validateProvider(
    agent: Agent,
    config: Record<string, string>
  ): Promise<{ isValid: boolean, error?: string } | null> {
    // Cast to typed config for internal use
    const typedConfig = config as OpenAIConfig;
    const apiKey = typedConfig.OPENAI_API_KEY;
    
    if (!apiKey) {
      return { isValid: false, error: 'OPENAI_API_KEY is missing or could not be resolved' };
    }
    
    // Live API check
    try {
      const client = new OpenAI({ apiKey });
      await client.models.list();
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Failed to validate OpenAI configuration: ' + (error instanceof Error ? error.message : 'Unknown error') };
    }
  }
  
  protected async createProvider(
    modelName: string,
    agent: Agent,
    logger: Logger,
    config: Record<string, string>
  ): Promise<Provider> {
    // Cast to typed config for internal use
    const typedConfig = config as OpenAIConfig;
    return new OpenAIProvider(modelName, agent, logger, typedConfig, this.providerId);
  }
}


// Provider implementation
class OpenAIProvider extends BaseProvider<OpenAIConfig> {
  private client: OpenAI;

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

  constructor(modelName: string, agent: Agent, logger: Logger, config: OpenAIConfig, providerId: ProviderId) {
    super(modelName, agent, logger, config, providerId);
    // config.OPENAI_API_KEY is typed and available
    this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    this.logger.info('OpenAI Provider initialized successfully');
  }

  async getModels(): Promise<ProviderModel[]> {
    const modelList = await this.client.models.list();
    const killwords = ["dall-e", "tts", "whisper", "embedding", "embed", "audio", "transcribe", "moderation", "babbage", "davinci"];
    const filteredModels = modelList.data.filter(model => 
      !killwords.some(word => model.id.toLowerCase().includes(word))
    );
    //this.logger.info('OpenAI models:', filteredModels);
    return filteredModels.map((model) => ({
      provider: this.providerId,
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
              content: '',
            };
            
            // Add the results, if any
            if (turn.results) {
              let textContent = '';
              const toolCalls: any[] = [];
              
              for (const result of turn.results) {
                if (result.type === 'text') {
                  textContent += result.text;
                } else if (result.type === 'toolCall') {
                  toolCalls.push({
                    type: 'function',
                    id: result.toolCall.toolCallId!,
                    function: {
                      name: result.toolCall.serverName + '_' + result.toolCall.toolName,
                      arguments: JSON.stringify(result.toolCall.args ?? {}),
                    },
                  });
                }
              }
              
              reply.content = textContent || turn.error || '';
              if (toolCalls.length > 0) {
                reply.tool_calls = toolCalls;
              }
            } else if (turn.error) {
              reply.content = turn.error;
            }
            
            turnMessages.push(reply);

            // Add the tool call results, if any
            if (turn.results) {
              for (const result of turn.results) {
                if (result.type === 'toolCall') {
                  // Push the tool call result
                  turnMessages.push({
                    role: 'tool',
                    tool_call_id: result.toolCall.toolCallId!,
                    content: result.toolCall.output
                  });
                }
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
        const turn: Turn = { results: [] };
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

          if (toolCallApproval.decision === 'allow-session') {
            session.toolIsApprovedForSession(toolCallApproval.serverName, toolCallApproval.toolName);
          }
          if (toolCallApproval.decision === 'allow-session' || toolCallApproval.decision === 'allow-once') {
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
              toolCallsResults.push({
                role: "tool",
                tool_call_id: toolCallApproval.toolCallId!,
                content: resultText
              });
            }
          } else if (toolCallApproval.decision === 'deny') {
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

      const tools = await ProviderHelper.getIncludedTools(this.agent, session);
      const functions = tools.map(tool => this.convertMCPToolToOpenAIFunction(tool));

      const state = session.getState();

      let turnCount = 0;
      while (turnCount < state.maxChatTurns) {
        const turn: Turn = { results: [] };
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
          turn.results!.push({
            type: 'text',
            text: response.content
          });
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
    
                  // Record the tool result in the message context
                  turnMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: resultText
                  });
                  
                  // Record the function call and result
                  turn.results!.push({
                    type: 'toolCall',
                    toolCall: {
                      serverName: ProviderHelper.getToolServerName(toolCall.function.name),
                      toolName: ProviderHelper.getToolName(toolCall.function.name),
                      args: JSON.parse(toolCall.function.arguments),
                      output: resultText,
                      toolCallId: toolCall.id,
                      elapsedTimeMs: toolResult.elapsedTimeMs,
                    }
                  });    
                }
              }
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