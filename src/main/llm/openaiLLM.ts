import { ILLM, ILLMModel, LLMType, LLMProviderInfo } from '../../shared/llm';
import OpenAI from 'openai';
import { Tool } from "@modelcontextprotocol/sdk/types";
import log from 'electron-log';
import { ChatMessage } from '../../shared/ChatSession';
import { ModelReply, Turn } from '../../shared/ModelReply';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { WorkspaceManager } from '../state/WorkspaceManager';
import { ChatSession } from '../state/ChatSession';

export class OpenAILLM implements ILLM {
  private readonly workspace: WorkspaceManager;
  private readonly modelName: string;
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

  static getInfo(): LLMProviderInfo {
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

  constructor(modelName: string, workspace: WorkspaceManager) {
    this.modelName = modelName;
    this.workspace = workspace;
    
    try {
      const apiKey = this.workspace.getProviderSettingsValue(LLMType.OpenAI, 'OPENAI_API_KEY')!;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is missing in the configuration. Please add it to your config.json file.');
      }
      this.client = new OpenAI({ apiKey });
      log.info('OpenAI LLM initialized successfully');
    } catch (error) {
      log.error('Failed to initialize OpenAI LLM:', error);
      throw error;
    }
  }

  async getModels(): Promise<ILLMModel[]> {
    const modelList = await this.client.models.list();
    const killwords = ["dall-e", "tts", "whisper", "embedding", "embed", "audio", "transcribe", "moderation", "babbage", "davinci"];
    const filteredModels = modelList.data.filter(model => 
      !killwords.some(word => model.id.toLowerCase().includes(word))
    );
    //log.info('OpenAI models:', filteredModels);
    return filteredModels.map((model) => ({
      provider: LLMType.OpenAI,
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
      log.info('Generating response with OpenAI');

      // Turn our ChatMessage[] into a OpenAPI API ChatCompletionMessageParam[]
      let currentMessages: OpenAI.ChatCompletionMessageParam[] = [];
      for (const message of messages) {
        if ('modelReply' in message) {
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

      // log.info('Starting OpenAI LLM with messages:', JSON.stringify(currentMessages, null, 2));

      const tools = this.workspace.mcpManager.getAllTools();
      const functions = tools.map(tool => this.convertMCPToolToOpenAIFunction(tool));

      let turnCount = 0;
      while (turnCount < session.maxChatTurns) {
        const turn: Turn = {};
        let hasToolUse = false;
        turnCount++;
        log.info(`Processing turn ${turnCount}`);

        const completion = await this.client.chat.completions.create({
          model: this.modelName,
          messages: currentMessages,
          tools: functions.length > 0 ? functions.map(fn => ({ type: 'function', function: fn })) : undefined,
          tool_choice: functions.length > 0 ? 'auto' : undefined,
          max_tokens: session.maxOutputTokens,
          temperature: session.temperature,
          top_p: session.topP,
        });

        const response = completion.choices[0]?.message;
        if (!response) {
          throw new Error('No response from OpenAI');
        }

        // log.info('OpenAIresponse', JSON.stringify(response, null, 2));

        turn.inputTokens = completion.usage?.prompt_tokens ?? 0;
        turn.outputTokens = completion.usage?.completion_tokens ?? 0;

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
              const toolResult = await this.workspace.mcpManager.callTool(
                toolCall.function.name,
                JSON.parse(toolCall.function.arguments),
                session
              );
              log.info('Tool result:', toolResult);

              if (toolResult.content[0]?.type === 'text') {
                const resultText = toolResult.content[0].text;
                if (!turn.toolCalls) {
                  turn.toolCalls = [];
                }
  
                // Record the function call and result
                turn.toolCalls.push({
                  serverName: this.workspace.mcpManager.getToolServerName(toolCall.function.name),
                  toolName: this.workspace.mcpManager.getToolName(toolCall.function.name),
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
        modelReply.turns.push(turn);
          
        // Break if no tool uses in this turn
        if (!hasToolUse) break;
      }

      if (turnCount >= session.maxChatTurns) {
        modelReply.turns.push({
          error: 'Maximum number of tool uses reached'
        });
      }

      log.info('OpenAI response generated successfully');
      return modelReply;
    } catch (error: any) {
      log.error('OpenAI API error:', error);
      modelReply.turns.push({
        error: `Error: Failed to generate response from OpenAI - ${error.message}`
      });
      return modelReply;            
    }
  }
} 