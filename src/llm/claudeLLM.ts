import { ILLM } from './types.js';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MessageParam } from '@anthropic-ai/sdk/resources/index.js';
import { LLMStateManager } from './stateManager.js';

export class ClaudeLLM implements ILLM {
  private client: Anthropic;
  private model: string;
  private stateManager: LLMStateManager;

  constructor(model: string = 'claude-3-7-sonnet-20250219', stateManager: LLMStateManager) {
    if (!config.anthropicKey) {
      throw new Error('ANTHROPIC_API_KEY must be provided');
    }
    console.log('Initializing Claude with model:', model);
    
    // Log key length to debug without exposing the key
    console.log('Anthropic key length:', config.anthropicKey.length);
    
    // Log key prefix to verify format without exposing key
    console.log('Anthropic key prefix:', config.anthropicKey.substring(0, 10) + '...');
    
    this.client = new Anthropic({
      apiKey: config.anthropicKey,
    });
    this.model = model;
    this.stateManager = stateManager;
  }

  async generateResponse(prompt: string): Promise<string> {
    try {
      // In order to maintain context, we need to pass the previous messages to each create call.  If we want
      // to allow subsequent calls to use tools, we need to pass the tools in those messages.  However, we do
      // not need to pass the tools in previous messages that have already been processed.  We do need to provide
      // all tool responses in the messages collection we send on each call.
      //
      const tools = this.stateManager.getAllTools().map((tool: Tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        }
      });

      const messages: MessageParam[] = [
        {
          role: "user",
          content: prompt,
        },
      ];
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages,
        system: this.stateManager.getSystemPrompt(), // Only need this on the first message in the context collection
        tools,
      });

      const finalText = [];
      const toolResults = [];
      const MAX_TOOL_TURNS = 5; // Prevent infinite loops
      let currentResponse = message;
      let turnCount = 0;

      while (turnCount < MAX_TOOL_TURNS) {
        turnCount++;
        let hasToolUse = false;

        for (const content of currentResponse.content) {
          if (content.type === 'text') {
            // Need to keep all of the text responses in the messages collection for context
            messages.push({
              role: "assistant",
              content: content.text,
            });
            finalText.push(content.text);
          } else if (content.type === 'tool_use') {
            hasToolUse = true;
            console.log('Tool use detected:', content);
            const toolName = content.name;
            const toolUseId = content.id;
            const toolArgs = content.input as { [x: string]: unknown } | undefined;
           
            // Record the tool use request in the message context
            messages.push({
              role: "assistant",
              content: `[Using tool ${toolName} with input: ${JSON.stringify(toolArgs)}]`
            });

            const result = await this.stateManager.callTool(toolName, toolArgs);
            console.log('Tool result:', result);
            toolResults.push(result);
            finalText.push(
              `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`
            );

            const toolResultContent = result.content[0];
            // Record the tool result in the message context
            if (toolResultContent && toolResultContent.type === 'text') {
              messages.push({
                role: "user",
                content: `[Tool ${toolName} returned: ${toolResultContent.text}]`,
              });
            }
      
            currentResponse = await this.client.messages.create({
              model: this.model,
              max_tokens: 1000,
              messages,
              tools,
            });
            console.log('Response from tool results message:', currentResponse);
          }
        }
       
        // Break if no tool uses in this turn
        if (!hasToolUse) break;
      }
      
      if (turnCount >= MAX_TOOL_TURNS) {
        finalText.push("\n[Maximum number of tool uses reached]");
      }

      // Log token usage for monitoring
      console.log('Tokens used:', {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens
      });

      return finalText.join('\n');
    } catch (error: any) {
      console.error('Claude API error:', error.message);
      return `Error: Failed to generate response from Claude - ${error.message}`;
    }
  }
} 