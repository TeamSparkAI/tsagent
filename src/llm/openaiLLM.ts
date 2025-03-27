import { ILLM } from './types';
import OpenAI from 'openai';
import { LLMStateManager } from './stateManager';
import { ConfigManager } from '../state/ConfigManager';
import { Tool } from "@modelcontextprotocol/sdk/types";
import log from 'electron-log';

export class OpenAILLM implements ILLM {
  private client!: OpenAI;
  private readonly modelName: string;
  private readonly stateManager: LLMStateManager;
  private readonly configManager: ConfigManager;
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

  constructor(modelName: string, stateManager: LLMStateManager, configManager: ConfigManager) {
    this.modelName = modelName;
    this.stateManager = stateManager;
    this.configManager = configManager;
    
    try {
      const apiKey = this.configManager.getConfigValue('OPENAI_API_KEY');
      this.client = new OpenAI({ apiKey });
      log.info('OpenAI LLM initialized successfully');
    } catch (error) {
      log.error('Failed to initialize OpenAI LLM:', error);
      throw error;
    }
  }

  async generateResponse(prompt: string): Promise<string> {
    try {
      log.info('Generating response with OpenAI');
      const finalText = [];
      let turnCount = 0;
      let currentMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: this.stateManager.getSystemPrompt() },
        { role: 'user', content: prompt }
      ];

      const tools = this.stateManager.getAllTools();
      const functions = tools.map(tool => this.convertMCPToolToOpenAIFunction(tool));

      while (turnCount < this.MAX_TURNS) {
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

        // Check for function calls
        if (response.tool_calls && response.tool_calls.length > 0) {
          log.info('tool_calls', response.tool_calls);
          // Add the assistant's message with the tool calls
          currentMessages.push(response);

          // Process all tool calls
          for (const toolCall of response.tool_calls) {
            if (toolCall.type === 'function') {
              log.info('Processing function call:', toolCall.function);

              // Call the tool
              const toolResult = await this.stateManager.callTool(
                toolCall.function.name,
                JSON.parse(toolCall.function.arguments)
              );
              log.info('Tool result:', toolResult);

              // Record the function call and result
              finalText.push(
                `[Calling function ${toolCall.function.name} with args ${toolCall.function.arguments}]`
              );

              if (toolResult.content[0]?.type === 'text') {
                const resultText = toolResult.content[0].text;
                finalText.push(`[Function returned: ${resultText}]`);

                // Add the tool result to messages
                currentMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: resultText
                });
              }
            }
          }
          continue;  // Continue the conversation after processing all tool calls
        }

        // No function call, just add the response text
        finalText.push(response.content || '');
        break;
      }

      if (turnCount >= this.MAX_TURNS) {
        finalText.push("\n[Maximum number of function calls reached]");
      }

      const responseText = finalText.join('\n');
      log.info('OpenAI response generated successfully');
      return responseText;
    } catch (error: any) {
      log.error('OpenAI API error:', error);
      const errorMessage = error.message || 'Unknown error';
      return `Error: Failed to generate response from OpenAI - ${errorMessage}`;
    }
  }
} 