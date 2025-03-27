import { ILLM } from './types';
import Anthropic from '@anthropic-ai/sdk';
import { Tool } from '@modelcontextprotocol/sdk/types';
import { MessageParam } from '@anthropic-ai/sdk/resources/index';
import { LLMStateManager } from './stateManager';
import { ConfigManager } from '../state/ConfigManager';
import log from 'electron-log';

export class ClaudeLLM implements ILLM {
  private client!: Anthropic;
  private readonly modelName: string;
  private readonly stateManager: LLMStateManager;
  private readonly configManager: ConfigManager;

  constructor(modelName: string, stateManager: LLMStateManager, configManager: ConfigManager) {
    this.modelName = modelName;
    this.stateManager = stateManager;
    this.configManager = configManager;
    
    try {
      const apiKey = this.configManager.getConfigValue('ANTHROPIC_API_KEY');
      this.client = new Anthropic({ apiKey });
      log.info('Claude LLM initialized successfully');
    } catch (error) {
      log.error('Failed to initialize Claude LLM:', error);
      throw error;
    }
  }

  async generateResponse(prompt: string): Promise<string> {
    try {
      log.info('Generating response with Claude');
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
        model: this.modelName,
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
            log.info('Tool use detected:', content);
            const toolName = content.name;
            const toolUseId = content.id;
            const toolArgs = content.input as { [x: string]: unknown } | undefined;
           
            // Record the tool use request in the message context
            messages.push({
              role: "assistant",
              content: `[Using tool ${toolName} with input: ${JSON.stringify(toolArgs)}]`
            });

            const result = await this.stateManager.callTool(toolName, toolArgs);
            log.info('Tool result:', result);
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
              model: this.modelName,
              max_tokens: 1000,
              messages,
              tools,
            });
            log.info('Response from tool results message:', currentResponse);
          }
        }
       
        // Break if no tool uses in this turn
        if (!hasToolUse) break;
      }
      
      if (turnCount >= MAX_TOOL_TURNS) {
        finalText.push("\n[Maximum number of tool uses reached]");
      }

      // Log token usage for monitoring
      log.info('Tokens used:', {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens
      });

      const response = finalText.join('\n');
      log.info('Claude response generated successfully');
      return response;
    } catch (error: any) {
      log.error('Claude API error:', error.message);
      return `Error: Failed to generate response from Claude - ${error.message}`;
    }
  }
} 