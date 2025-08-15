import { Provider, ProviderModel, ProviderType, ProviderInfo } from './types';
import Anthropic from '@anthropic-ai/sdk';
import { Tool } from '@modelcontextprotocol/sdk/types';
import { MessageParam } from '@anthropic-ai/sdk/resources/index';
import { ChatMessage, TOOL_CALL_DECISION_ALLOW_ONCE, TOOL_CALL_DECISION_ALLOW_SESSION, TOOL_CALL_DECISION_DENY, ChatSession } from '../types/chat';
import { ModelReply, Turn } from './types';
import { Agent } from '../types/agent';
import { Logger } from '../types/common';

export class ClaudeProvider implements Provider {
  private readonly agent: Agent;
  private readonly modelName: string;
  private readonly logger: Logger;
  private client!: Anthropic;

  static getInfo(): ProviderInfo {
    return {
      name: "Anthropic Claude",
      description: "Claude is a family of AI assistants created by Anthropic to be helpful, harmless, and honest",
      website: "https://www.anthropic.com/claude",
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
  
  static async validateConfiguration(agent: Agent): Promise<{ isValid: boolean, error?: string }> {
    const apiKey = agent.providers.getSetting(ProviderType.Claude, 'ANTHROPIC_API_KEY');
    if (!apiKey) {
      return { isValid: false, error: 'ANTHROPIC_API_KEY is missing in the configuration. Please add it to your config.json file.' };
    }
    try {
      const client = new Anthropic({ apiKey });
      await client.models.list();
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Failed to validate Claude configuration: ' + (error instanceof Error && error.message ? ': ' + error.message : '') };
    }
  }

  constructor(modelName: string, agent: Agent, logger: Logger) {
    this.modelName = modelName;
    this.agent = agent;
    this.logger = logger;
    
    try {
      const apiKey = this.agent.providers.getSetting(ProviderType.Claude, 'ANTHROPIC_API_KEY')!;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is missing in the configuration. Please add it to your config.json file.');
      }
      this.client = new Anthropic({ apiKey });
      this.logger.info('Claude Provider initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Claude Provider:', error);
      throw error;
    }
  }
  
  async getModels(): Promise<ProviderModel[]> {
    const modelList = await this.client.models.list();
    //this.logger.info('Claude models:', modelList.data);
    const models: ProviderModel[] = modelList.data.map((model) => ({
      provider: ProviderType.Claude,
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
  async generateResponse(session: ChatSession, messages: ChatMessage[]): Promise<ModelReply> {
    const modelReply: ModelReply = {
      timestamp: Date.now(),
      turns: []
    }

    try {
      this.logger.info('Generating response with Claude');

      const tools = this.agent.mcpManager.getAllTools().map((tool: Tool) => {
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
        } else if (message.role != 'approval') {
          // Handle regular messages
          turnMessages.push({
            role: message.role === 'system' ? 'user' : message.role === 'error' ? 'assistant' : message.role,
            content: 'content' in message ? message.content : ''
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
          this.logger.info('Model processing tool call approval', JSON.stringify(toolCallApproval, null, 2));
          const functionName = toolCallApproval.serverName + '_' + toolCallApproval.toolName;

          // Add the tool call to the context history
          turnMessages.push({
            role: 'assistant' as const,
            content: [
              {
                type: 'tool_use',
                id: toolCallApproval.toolCallId!,
                name: functionName,
                input: toolCallApproval.args,
              }
            ]
          });

          if (toolCallApproval.decision === TOOL_CALL_DECISION_ALLOW_SESSION) {
            session.toolIsApprovedForSession(toolCallApproval.serverName, toolCallApproval.toolName);
          }
          if (toolCallApproval.decision === TOOL_CALL_DECISION_ALLOW_SESSION || toolCallApproval.decision === TOOL_CALL_DECISION_ALLOW_ONCE) {
            // Run the tool
            const toolResult = await this.agent.mcpManager.callTool(functionName, toolCallApproval.args, session);
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
                role: 'user' as const,
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: toolCallApproval.toolCallId!,
                    content: resultText,
                  }
                ]
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
              role: 'user' as const,
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: toolCallApproval.toolCallId!,
                  content: 'Tool call denied',
                }
              ]
            });
          }
        }
        modelReply.turns.push(turn);    
      }

      const state = session.getState();

      let turnCount = 0;
      while (turnCount < state.maxChatTurns) {
        const turn: Turn = {};
        turnCount++;
        let hasToolUse = false;

        let currentResponse = await this.client.messages.create({
          model: this.modelName,
          max_tokens: state.maxOutputTokens,
          temperature: state.temperature,
          top_p: state.topP,
          messages: turnMessages,
          system: systemPrompt || undefined, // !!! Is this different on subseqent calls?
          tools,
        });
  
        turn.inputTokens = currentResponse.usage?.input_tokens ?? 0;
        turn.outputTokens = currentResponse.usage?.output_tokens ?? 0;

        if (currentResponse.stop_reason === 'max_tokens') {
          this.logger.warn('Maximum number of tokens reached for this response');
          turn.error = 'Maximum number of tokens reached for this response.  Increase the Maximum Output Tokens setting if desired.';
        }

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
            this.logger.info('Tool use detected:', content);
            const toolName = content.name;
            const toolUseId = content.id;
            const toolArgs = content.input as { [x: string]: unknown } | undefined;

            const toolServerName = this.agent.mcpManager.getToolServerName(toolName);
            const toolToolName = this.agent.mcpManager.getToolName(toolName);

            if (await session.isToolApprovalRequired(toolServerName, toolToolName)) {
              // Process tool approval
              if (!modelReply.pendingToolCalls) {
                modelReply.pendingToolCalls = [];
              }
              modelReply.pendingToolCalls.push({
                serverName: toolServerName,
                toolName: toolToolName,
                args: toolArgs,
                toolCallId: toolUseId
              });
            } else {
              // Call the tool
              const toolResult = await this.agent.mcpManager.callTool(toolName, toolArgs, session);
              if (toolResult.content[0]?.type === 'text') {
                const resultText = toolResult.content[0].text;
                if (!turn.toolCalls) {
                  turn.toolCalls = [];
                }

                // Record the tool use request and ressult in the message context
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

                turnMessages.push({
                  role: 'user',
                  content: [
                    {
                      type: 'tool_result',
                      tool_use_id: toolUseId,
                      content: resultText,
                    }
                  ]
                });

                turn.toolCalls.push({
                  serverName: toolServerName,
                  toolName: toolToolName,
                  args: toolArgs ?? {},
                  toolCallId: toolUseId,
                  output: resultText,
                  elapsedTimeMs: toolResult.elapsedTimeMs,
                  error: undefined
                });
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

      this.logger.info('Claude response generated successfully');
      return modelReply;
    } catch (error: unknown) {
      this.logger.error('Claude API error:', error instanceof Error ? error.message : 'Unknown error');
      modelReply.turns.push({
        error: `Error: Failed to generate response from Claude - ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return modelReply;
    }
  }
}