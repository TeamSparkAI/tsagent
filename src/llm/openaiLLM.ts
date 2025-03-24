import { ILLM } from './types.js';
import OpenAI from 'openai';
import { config } from '../config.js';
import { LLMStateManager } from './stateManager.js';
import { Tool } from "@modelcontextprotocol/sdk/types";

export class OpenAILLM implements ILLM {
  private client: OpenAI;
  private model: string;
  private stateManager: LLMStateManager;
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

  constructor(model: string, stateManager: LLMStateManager) {
    if (!config.openaiKey) {
      throw new Error('OPENAI_API_KEY must be provided');
    }
    this.client = new OpenAI({
      apiKey: config.openaiKey,
    });
    this.model = model;
    this.stateManager = stateManager;
  }

  async generateResponse(prompt: string): Promise<string> {
    try {
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
        console.log(`Processing turn ${turnCount}`);

        const completion = await this.client.chat.completions.create({
          model: this.model,
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
          console.log('tool_calls', response.tool_calls);
          // Add the assistant's message with the tool calls
          currentMessages.push(response);

          // Process all tool calls
          for (const toolCall of response.tool_calls) {
            if (toolCall.type === 'function') {
              console.log('Processing function call:', toolCall.function);

              // Call the tool
              const toolResult = await this.stateManager.callTool(
                toolCall.function.name,
                JSON.parse(toolCall.function.arguments)
              );
              console.log('Tool result:', toolResult);

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

      return finalText.join('\n');

    } catch (error: any) {
      console.error('OpenAI API error:', error);
      const errorMessage = error.message || 'Unknown error';
      return `Error: Failed to generate response from OpenAI - ${errorMessage}`;
    }
  }
} 