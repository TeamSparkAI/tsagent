import { ILLM, ILLMModel, LLMType, LLMProviderInfo } from '../../shared/llm';
import Anthropic from '@anthropic-ai/sdk';
import { Tool } from '@modelcontextprotocol/sdk/types';
import { MessageParam } from '@anthropic-ai/sdk/resources/index';
import log from 'electron-log';
import { ChatMessage } from '../../shared/ChatSession';
import { ModelReply, Turn } from '../../shared/ModelReply';
import { WorkspaceManager } from '../state/WorkspaceManager';
export class ClaudeLLM implements ILLM {
  private readonly workspace: WorkspaceManager;
  private readonly modelName: string;
  private client!: Anthropic;
  private readonly MAX_TURNS = 10;  // Maximum number of tool use turns

  static getInfo(): LLMProviderInfo {
    return {
      name: "Anthropic Claude",
      description: "Claude is a family of AI assistants created by Anthropic to be helpful, harmless, and honest",
      website: "https://www.anthropic.com/claude",
      requiresApiKey: true,
      configKeys: ['ANTHROPIC_API_KEY'],
      configValues: [
        {
          caption: "Anthropic API key",
          key: "ANTHROPIC_API_KEY",
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
      const apiKey = this.workspace.getProviderSettingsValue(LLMType.Claude, 'ANTHROPIC_API_KEY')!;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is missing in the configuration. Please add it to your config.json file.');
      }
      this.client = new Anthropic({ apiKey });
      log.info('Claude LLM initialized successfully');
    } catch (error) {
      log.error('Failed to initialize Claude LLM:', error);
      throw error;
    }
  }
  
  async getModels(): Promise<ILLMModel[]> {
    const modelList = await this.client.models.list();
    // log.info('Claude models:', modelList.data);
    const models: ILLMModel[] = modelList.data.map((model) => ({
      provider: LLMType.Claude,
      id: model.id!,
      name: model.display_name || model.id!,
      modelSource: 'Anthropic'
    }));
    return models;
  }

  // Note: The Anthropic API is stateless, so we need to establish the initial state using our ChatMessage[] context (passed in
  //       as messages).  Then as we are processing turns, we also need to add any reponses we receive from the model, as well as
  //       any replies we make (such as tool call results), to this state.
  //
  async generateResponse(messages: ChatMessage[]): Promise<ModelReply> {
    const modelReply: ModelReply = {
      timestamp: Date.now(),
      turns: []
    }

    try {
      log.info('Generating response with Claude');

      const tools = this.workspace.mcpManager.getAllTools().map((tool: Tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        }
      });

      // If the first message is the system prompt, we will to remove it from the messages array and we'll inject it as a 
      // system message using the specific property on the create call.  We originally did this by just sticking the system
      // prompt in the first position of the messages array as a user message and it seemed to work, but this is the more
      // explicit "Anthropic way" of doing it.
      //
      var systemPrompt = null;
      if (messages[0].role === 'system') {
        systemPrompt = messages[0].content;
        messages.shift();
      }

      // Turn our ChatMessage[] into an Anthropic API MessageParam[]
      const turnMessages: MessageParam[] = [];
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
                  content: [
                    {
                      type: 'tool_use',
                      id: toolCall.toolCallId!,
                      name: toolCall.serverName + '_' + toolCall.toolName,
                      input: toolCall.args,
                    }
                  ]
                });
                // Push the tool call result
                turnMessages.push({
                  role: 'user' as const,
                  content: [
                    {
                      type: 'tool_result',
                      tool_use_id: toolCall.toolCallId!,
                      content: toolCall.output,
                    }
                  ]
                });
              }
            }
          }
        } else {
          // Handle regular messages
          turnMessages.push({
            role: message.role === 'system' ? 'user' : message.role === 'error' ? 'assistant' : message.role,
            content: 'content' in message ? message.content : ''
          });
        }
      }

      let currentResponse = await this.client.messages.create({
        model: this.modelName,
        max_tokens: 1000,
        messages: turnMessages,
        system: systemPrompt || undefined,
        tools,
      });

      let turnCount = 0;
      while (turnCount < this.MAX_TURNS) {
        const turn: Turn = {};
        turnCount++;
        let hasToolUse = false;

        turn.inputTokens = currentResponse.usage?.input_tokens ?? 0;
        turn.outputTokens = currentResponse.usage?.output_tokens ?? 0;

        for (const content of currentResponse.content) {
          if (content.type === 'text') {
            // Need to keep all of the text responses in the messages collection for context
            turnMessages.push({
              role: "assistant",
              content: content.text,
            });
            turn.message = (turn.message || '') +content.text;
          } else if (content.type === 'tool_use') {
            hasToolUse = true;
            log.info('Tool use detected:', content);
            const toolName = content.name;
            const toolUseId = content.id;
            const toolArgs = content.input as { [x: string]: unknown } | undefined;
           
            // Record the tool use request in the message context
            turnMessages.push({
              role: "assistant",
              content: [
                {
                  type: 'tool_use',
                  id: toolUseId,
                  name: toolName,
                  input: toolArgs,
                }
              ]
            });

            const result = await this.workspace.mcpManager.callTool(toolName, toolArgs);
            log.info('Tool result:', result);

            const toolResultContent = result.content[0];
            if (toolResultContent && toolResultContent.type === 'text') {
              turnMessages.push({
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: toolUseId,
                    content: toolResultContent.text,
                  }
                ]
              });

              if (!turn.toolCalls) {
                turn.toolCalls = [];
              }

              turn.toolCalls.push({
                serverName: this.workspace.mcpManager.getToolServerName(toolName),
                toolName: this.workspace.mcpManager.getToolName(toolName),
                args: toolArgs ?? {},
                toolCallId: toolUseId,
                output: toolResultContent?.text ?? '',
                elapsedTimeMs: result.elapsedTimeMs,
                error: undefined
              });
            }
            currentResponse = await this.client.messages.create({
              model: this.modelName,
              max_tokens: 1000,
              messages: turnMessages,
              tools,
            });
            log.info('Response from tool results message:', currentResponse);
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

      log.info('Claude response generated successfully');
      return modelReply;
    } catch (error: any) {
      log.error('Claude API error:', error.message);
      modelReply.turns.push({
        error: `Error: Failed to generate response from Claude - ${error.message}`
      });
      return modelReply;
    }
  }
} 