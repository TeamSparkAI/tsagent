import { ILLM } from './types';
import Anthropic from '@anthropic-ai/sdk';
import { Tool } from '@modelcontextprotocol/sdk/types';
import { MessageParam } from '@anthropic-ai/sdk/resources/index';
import { AppState } from '../state/AppState';
import log from 'electron-log';
import { ChatMessage } from '../types/ChatSession';

export class ClaudeLLM implements ILLM {
  private readonly appState: AppState;
  private readonly modelName: string;
  private client!: Anthropic;

  constructor(modelName: string, appState: AppState) {
    this.modelName = modelName;
    this.appState = appState;
    
    try {
      const apiKey = this.appState.getConfigManager().getConfigValue('ANTHROPIC_API_KEY');
      this.client = new Anthropic({ apiKey });
      log.info('Claude LLM initialized successfully');
    } catch (error) {
      log.error('Failed to initialize Claude LLM:', error);
      throw error;
    }
  }

  async generateResponse(messages: ChatMessage[]): Promise<string> {
    try {
      log.info('Generating response with Claude');
      // In order to maintain context, we need to pass the previous messages to each create call.  If we want
      // to allow subsequent calls to use tools, we need to pass the tools in those messages.  However, we do
      // not need to pass the tools in previous messages that have already been processed.  We do need to provide
      // all tool responses in the messages collection we send on each call.
      //
      const tools = this.appState.getMCPManager().getAllTools().map((tool: Tool) => {
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

      // Turn our ChatMessage[] into a Anthropic API MessageParam[]
      const turnMessages: MessageParam[] = messages.map(message => {
        return {
          // Conver to a role that Anthropic API accepts (user or assistant)
          role: message.role === 'system' || message.role === 'error' ? 'assistant' : message.role,
          content: message.content,
        }
      });

      // We could check to see if the first message is the system prompt and inject it as a system message, but we'll just
      const message = await this.client.messages.create({
        model: this.modelName,
        max_tokens: 1000,
        messages: turnMessages,
        system: systemPrompt || undefined,
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
            turnMessages.push({
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
            turnMessages.push({
              role: "assistant",
              content: `[Using tool ${toolName} with input: ${JSON.stringify(toolArgs)}]`
            });

            const result = await this.appState.getMCPManager().callTool(toolName, toolArgs);
            log.info('Tool result:', result);
            toolResults.push(result);
            finalText.push(
              `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`
            );

            const toolResultContent = result.content[0];
            // Record the tool result in the message context
            if (toolResultContent && toolResultContent.type === 'text') {
              turnMessages.push({
                role: "user",
                content: `[Tool ${toolName} returned: ${toolResultContent.text}]`,
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