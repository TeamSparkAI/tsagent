import { ILLM } from './types';
import { GoogleGenerativeAI, Tool as GeminiTool, SchemaType, ModelParams, GenerativeModel, Content, Part } from '@google/generative-ai';
import { Tool } from "@modelcontextprotocol/sdk/types";
import log from 'electron-log';
import { ChatMessage } from '../types/ChatSession';
import { AppState } from '../state/AppState';
import { LlmReply, Turn } from '../types/LlmReply';

export class GeminiLLM implements ILLM {
  private readonly appState: AppState;
  private readonly modelName: string;
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private readonly MAX_TURNS = 5;  // Maximum number of tool use turns

  private convertPropertyType(prop: any): { type: string; items?: { type: string } } {
    const baseType = (prop.type || "string").toUpperCase();
    if (baseType === "ARRAY") {
      return {
        type: baseType,
        items: {
          type: "STRING" // Default to STRING for array items
        }
      };
    }
    return { type: baseType };
  }

  private convertMCPToolsToGeminiTool(mcpTools: Tool[]): GeminiTool {
    return {
      functionDeclarations: mcpTools.map(mcpTool => {
        const properties = mcpTool.inputSchema.properties || {};
        const declaration: any = {
          name: mcpTool.name,
          description: mcpTool.description || ''
        };

        if (Object.keys(properties).length > 0) {
          declaration.parameters = {
            type: SchemaType.OBJECT,
            properties: Object.entries(properties).reduce((acc, [key, value]) => {
              const prop: any = {
                ...this.convertPropertyType(value)
              };
              
              const desc = (value as any).description;
              if (desc && desc.trim()) {
                prop.description = desc;
              }
              
              return {
                ...acc,
                [key]: prop
              };
            }, {})
          };
        }

        return declaration;
      })
    };
  }

  constructor(modelName: string, appState: AppState) {
    this.modelName = modelName;
    this.appState = appState;
    
    try {
      const apiKey = this.appState.getConfigManager().getConfigValue('GEMINI_API_KEY');
      this.genAI = new GoogleGenerativeAI(apiKey);
      const modelOptions: ModelParams = { model: this.modelName };
      const tools = this.appState.getMCPManager().getAllTools();
      if (tools.length > 0) {
        const modelTools = this.convertMCPToolsToGeminiTool(tools);
        modelOptions.tools = [modelTools];
      }
      this.model = this.genAI.getGenerativeModel(modelOptions);
      log.info('Gemini LLM initialized successfully');
    } catch (error) {
      log.error('Failed to initialize Gemini LLM:', error);
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
      // Note: The messages we actually get back from the API seem to use "model" as the role for the assistant's response.
      //
      // Vertex messages are in the format:
      // [
      //   {
      //     role: 'user',
      //     parts: [{ text: 'Hello, world!' }]
      //   },
      //   {
      //     role: 'model',
      //     parts: [
      //       { text: 'Hello, world!' },
      //       { functionCall: { name: 'my_function', args: { param1: 'value1', param2: 'value2' } } } 
      //     ]
      //   },
      //   {
      //     role: 'user',
      //     parts: [
      //       { functionResponse: { name: 'my_function', response: 'Hello, world!' } }
      //     ]
      //   }
      // ]

      // Turn our ChatMessage[] into a VertexAI Content[]
      const history: Content[] = [];
      for (const message of messages) {
        if ('llmReply' in message) {
          // Process each turn in the LLM reply
          for (const turn of message.llmReply.turns) {
            // Add the assistant's message (including any tool calls)
            if (turn.message) {
              history.push({
                role: 'assistant',
                parts: [{ text: turn.message ?? '' }]
              });
            }
            // Add the tool calls, if any
            if (turn.toolCalls && turn.toolCalls.length > 0) {
              for (const toolCall of turn.toolCalls) {
                // Push the tool call
                history.push({
                  role: 'assistant', // !!! Should this be "model" instead?
                  parts: [{
                    functionCall: {
                      name: toolCall.toolName,
                      args: toolCall.args ?? {} // !!! Verify this in the logs - make sure toolCall.args gets serilized as an object correctly
                    }
                  }]
                });
                // Push the tool call result
                history.push({
                  role: 'user',
                  parts: [{
                    functionResponse: {
                      name: toolCall.toolName,
                      response: {
                        text: toolCall.output
                      }
                    }
                  }]
                });
              }
            }
          }
        } else {
          // Handle regular messages
          history.push({
            role: message.role === 'system' ? 'user' : message.role === 'error' ? 'assistant' : message.role,
            parts: [{ text: message.content }]
          });
        }
      } 

      const lastMessage = history.pop()!;
      var currentPrompt: Part[] = lastMessage.parts;

      log.info('history', JSON.stringify(history, null, 2));
      log.info('currentPrompt', currentPrompt);

      const chat = this.model.startChat({
        history
      });

      let turnCount = 0;
      while (turnCount < this.MAX_TURNS) {
        const turn: Turn = {};
        turnCount++;
        log.info(`Sending message prompt "${currentPrompt}", turn count: ${turnCount}`);
        const result = await chat.sendMessage(currentPrompt);
        const response = result.response;

        log.info('response', JSON.stringify(response, null, 2));

        // Process all parts of the response
        let hasToolUse = false;
        const toolResults: string[] = [];

        currentPrompt = [];
        
        const candidates = response.candidates?.[0];
        if (candidates?.content?.parts) {
          for (const part of candidates.content.parts) {
            // Handle text parts
            if (part.text) {
              turn.message = (turn.message || '') + part.text.replace(/\\n/g, '\n');
            }
            
            // Handle function calls
            if (part.functionCall?.name && part.functionCall?.args) {
              hasToolUse = true;
              const { name: toolName, args } = part.functionCall;
              const toolArgs = args ? (args as Record<string, unknown>) : undefined;
              log.info('Function call detected:', part.functionCall);

              // Call the tool
              const toolResult = await this.appState.getMCPManager().callTool(toolName, toolArgs);
              log.info('Tool result:', toolResult);

              // Record the function call and result
              
              if (toolResult.content[0]?.type === 'text') {
                const resultText = toolResult.content[0].text;
                toolResults.push(resultText);
                if (!turn.toolCalls) {
                  turn.toolCalls = [];
                }
                turn.toolCalls.push({
                  serverName: this.appState.getMCPManager().getToolServerName(toolName),
                  toolName: this.appState.getMCPManager().getToolName(toolName),
                  args: toolArgs,
                  output: resultText,
                  elapsedTimeMs: toolResult.elapsedTimeMs,
                  error: undefined
                });
                currentPrompt.push({ functionResponse: { name: toolName, response: { text: resultText } } });
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

      return llmReply;
    } catch (error: any) {
      log.error('Gemini API error:', error);
      llmReply.turns.push({
        error: `Error: Failed to generate response from Gemini- ${error.message}`
      });
      return llmReply;
    }
  }
} 