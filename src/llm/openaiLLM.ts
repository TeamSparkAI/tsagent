import { ILLM } from './types';
import OpenAI from 'openai';
import { AppState } from '../state/AppState';
import { Tool } from "@modelcontextprotocol/sdk/types";
import log from 'electron-log';
import { ChatMessage } from '../types/ChatSession';
import { LlmReply, Turn } from '../types/LlmReply';
import { ChatCompletionMessageParam } from 'openai/resources/chat';

export class OpenAILLM implements ILLM {
  private readonly appState: AppState;
  private readonly modelName: string;
  private client!: OpenAI;
  private readonly MAX_TURNS = 5;

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

  // Note: The OpenAI API is stateless, so we need to establish the initial state using our ChatMessage[] context (passed in
  //       as messages).  Then as we are processing turns, we also need to add any reponses we receive from the model, as well as
  //       any replies we make (such as tool call results), to this state.
  //
  constructor(modelName: string, appState: AppState) {
    this.modelName = modelName;
    this.appState = appState;
    
    try {
      const apiKey = this.appState.getConfigManager().getConfigValue('OPENAI_API_KEY');
      this.client = new OpenAI({ apiKey });
      log.info('OpenAI LLM initialized successfully');
    } catch (error) {
      log.error('Failed to initialize OpenAI LLM:', error);
      throw error;
    }
  }

  async generateResponse(messages: ChatMessage[]): Promise<LlmReply> {
    const llmReply: LlmReply = {
      inputTokens: 0,
      outputTokens: 0,
      timestamp: Date.now(),
      turns: []
    }

    try {
      log.info('Generating response with OpenAI');

      // Turn our ChatMessage[] into a OpenAPI API ChatCompletionMessageParam[]
      let currentMessages: OpenAI.ChatCompletionMessageParam[] = [];
      for (const message of messages) {
        if ('llmReply' in message) {
          // Process each turn in the LLM reply
          for (const turn of message.llmReply.turns) {
            // Add the assistant's message (including any tool calls)
            const reply: ChatCompletionMessageParam = {
              role: "assistant" as const,
              content: turn.message ?? undefined,
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
                    name: toolCall.toolName,
                    arguments: JSON.stringify(toolCall.args ?? {}),
                  },
                });
              }
            }
            // !!! Validate that this is the same as what we got from the model
            currentMessages.push(reply);

            // Add the tool call results, if any
            if (turn.toolCalls && turn.toolCalls.length > 0) {
              for (const toolCall of turn.toolCalls) {
                // Push the tool call result
                currentMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.toolCallId!,
                  content: toolCall.output
                });
              }
            }
          }
        } else {
          // Handle regular messages
          currentMessages.push({
            // Convert to a role that OpenAI API accepts (user or assistant)
            role: message.role === 'error' ? 'assistant' : message.role,
            content: message.content,
          });
      }
      }

      log.info('Starting OpenAI LLM with messages:', currentMessages);

      const tools = this.appState.getMCPManager().getAllTools();
      const functions = tools.map(tool => this.convertMCPToolToOpenAIFunction(tool));

      let turnCount = 0;
      while (turnCount < this.MAX_TURNS) {
        const turn: Turn = {};
        let hasToolUse = false;
        turnCount++;
        log.info(`Processing turn ${turnCount}`);

        const completion = await this.client.chat.completions.create({
          model: this.modelName,
          messages: currentMessages,
          tools: functions.length > 0 ? functions.map(fn => ({ type: 'function', function: fn })) : undefined,
          tool_choice: functions.length > 0 ? 'auto' : undefined
        });

        const response = completion.choices[0]?.message;
        if (!response) {
          throw new Error('No response from OpenAI');
        }

        if (response.content) {
          turn.message = (turn.message || '') + response.content;
        }
        
        if (response.tool_calls && response.tool_calls.length > 0) {
          log.info('tool_calls', response.tool_calls);
          hasToolUse = true;
          // Add the assistant's message with the tool calls (we add it here because we only need it in the state if we're calling
          // a tool and then doing another turn that relies on that state).
          currentMessages.push(response);

          // Process all tool calls
          for (const toolCall of response.tool_calls) {
            if (toolCall.type === 'function') {
              log.info('Processing function call:', toolCall.function);

              // Call the tool
              const toolResult = await this.appState.getMCPManager().callTool(
                toolCall.function.name,
                JSON.parse(toolCall.function.arguments)
              );
              log.info('Tool result:', toolResult);

              if (toolResult.content[0]?.type === 'text') {
                const resultText = toolResult.content[0].text;
                if (!turn.toolCalls) {
                  turn.toolCalls = [];
                }
  
                // Record the function call and result
                turn.toolCalls.push({
                  serverName: this.appState.getMCPManager().getToolServerName(toolCall.function.name),
                  toolName: this.appState.getMCPManager().getToolName(toolCall.function.name),
                  args: JSON.parse(toolCall.function.arguments),
                  output: resultText,
                  toolCallId: toolCall.id,
                  elapsedTimeMs: toolResult.elapsedTimeMs,
                });
  
                // Add the tool result to messages
                currentMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: resultText
                });
              }
            }
          }
        }
        llmReply.turns.push(turn);
          
        // Break if no tool uses in this turn
        if (!hasToolUse) break;
      }

      if (turnCount >= this.MAX_TURNS) {
        llmReply.turns.push({
          error: 'Maximum number of tool uses reached'
        });
      }

      log.info('OpenAI response generated successfully');
      return llmReply;
    } catch (error: any) {
      log.error('OpenAI API error:', error);
      llmReply.turns.push({
        error: `Error: Failed to generate response from OpenAI - ${error.message}`
      });
      return llmReply;            
    }
  }
} 