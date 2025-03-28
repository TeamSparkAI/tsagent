import { ILLM } from './types';
import { GoogleGenerativeAI, Tool as GeminiTool, SchemaType, ModelParams } from '@google/generative-ai';
import { Tool } from "@modelcontextprotocol/sdk/types";
import log from 'electron-log';
import { ChatMessage } from '../types/ChatSession';
import { AppState } from '../state/AppState';
import { LlmReply, Turn } from '../types/LlmReply';

export class GeminiLLM implements ILLM {
  private readonly appState: AppState;
  private readonly modelName: string;
  private genAI: GoogleGenerativeAI;
  private model: any;
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
      // Split messages into history and current prompt
      const history = messages.slice(0, -1).map(message => ({
        role: message.role === 'system' ? 'user' : message.role === 'error' ? 'assistant' : message.role,
        parts: [{ 
          text: message.role === 'assistant' 
            ? message.llmReply.turns[message.llmReply.turns.length - 1].message ?? ''
            : message.content 
        }]
      }));

      // For the current prompt check
      const lastMessage = messages[messages.length - 1];
      var currentPrompt = lastMessage.role === 'assistant'
        ? lastMessage.llmReply.turns[lastMessage.llmReply.turns.length - 1].message ?? ''
        : lastMessage.content;

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
        let hasFunctionCalls = false;
        const toolResults: string[] = [];
        
        const candidates = response.candidates?.[0];
        if (candidates?.content?.parts) {
          for (const part of candidates.content.parts) {
            // Handle text parts
            if (part.text) {
              turn.message = (turn.message || '') + part.text.replace(/\\n/g, '\n');
            }
            
            // Handle function calls
            if (part.functionCall?.name && part.functionCall?.args) {
              hasFunctionCalls = true;
              const { name: toolName, args } = part.functionCall;
              log.info('Function call detected:', part.functionCall);

              // Call the tool
              const toolResult = await this.appState.getMCPManager().callTool(
                toolName,
                args as Record<string, unknown>
              );
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
                  args: args ?? {},
                  output: resultText,
                  elapsedTimeMs: 0,
                  error: undefined
                });
              }
            }
          }

          llmReply.turns.push(turn);
          
          // If there were function calls, continue the conversation with all results
          if (hasFunctionCalls) {
            currentPrompt = `The functions returned:\n${toolResults.join('\n')}`;
            continue;
          }
        }
        break;
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