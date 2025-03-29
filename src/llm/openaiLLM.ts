import { ILLM } from './types';
import OpenAI from 'openai';
import { AppState } from '../state/AppState';
import { Tool } from "@modelcontextprotocol/sdk/types";
import log from 'electron-log';
import { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { ChatMessage } from '../types/ChatSession';
import { LlmReply, Turn } from '../types/LlmReply';
import { CallToolResultWithElapsedTime } from '../mcp/types';

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
      let currentMessages: OpenAI.ChatCompletionMessageParam[] = messages.map(message => {
        const content = message.role === 'assistant'
          ? message.llmReply.turns[message.llmReply.turns.length - 1].message ?? ''
          : message.content;
        
        return {
          // Convert to a role that OpenAI API accepts (user or assistant)
          role: message.role === 'error' ? 'assistant' : message.role,
          content,
        }
      });

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
        } else if (response.tool_calls && response.tool_calls.length > 0) {
          log.info('tool_calls', response.tool_calls);
          hasToolUse = true;
          // Add the assistant's message with the tool calls
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