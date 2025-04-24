import { GoogleGenAI, Tool as GeminiTool, Content, Part, Type as SchemaType } from '@google/genai';
import log from 'electron-log';

import { ILLM, ILLMModel, LLMType, LLMProviderInfo } from '../../shared/llm';
import { Tool } from "@modelcontextprotocol/sdk/types";
import { ChatMessage } from '../../shared/ChatSession';
import { ModelReply, Turn } from '../../shared/ModelReply';
import { WorkspaceManager } from '../state/WorkspaceManager';
import { ChatSession } from '../state/ChatSession';

export class GeminiLLM implements ILLM {
  private readonly workspace: WorkspaceManager;
  private readonly modelName: string;
  private genAI: GoogleGenAI;

  private convertPropertyType(prop: any): { type: SchemaType; items?: { type: SchemaType; properties?: Record<string, any>; required?: string[] }; description?: string } {
    const baseType = (prop.type || "string").toUpperCase() as SchemaType;
    if (baseType === SchemaType.ARRAY) {
      const itemSchema = prop.items;
      if (itemSchema.type === 'object') {
        // Handle array of objects
        const properties: Record<string, any> = {};
        const required: string[] = [];

        Object.entries(itemSchema.properties || {}).forEach(([key, value]: [string, any]) => {
          properties[key] = this.convertPropertyType(value);
          if (itemSchema.required?.includes(key)) {
            required.push(key);
          }
        });

        return {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties,
            required
          }
        };
      } else {
        // Handle array of primitives
        return {
          type: SchemaType.ARRAY,
          items: {
            type: (itemSchema.type || "string").toUpperCase() as SchemaType
          }
        };
      }
    }
    
    // For non-array types, include an empty items field to satisfy the schema
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
              const prop = this.convertPropertyType(value);
              
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

  static getInfo(): LLMProviderInfo {
    return {
      name: "Google Gemini",
      description: "Google's Gemini models are multimodal AI systems that can understand and combine different types of information",
      website: "https://deepmind.google/technologies/gemini/",
      configValues: [
        {
          caption: "Google API key",
          key: "GOOGLE_API_KEY",
          secret: true,
          required: true,
        }
      ]
    };
  }

  static async validateConfiguration(workspace: WorkspaceManager): Promise<{ isValid: boolean, error?: string }> {
    const apiKey = workspace.getProviderSettingsValue(LLMType.Gemini, 'GOOGLE_API_KEY');
    if (!apiKey) {
      return { isValid: false, error: 'GEMINI_API_KEY is missing in the configuration. Please add it to your config.json file.' };
    }
    try {
      const genAI = new GoogleGenAI({ apiKey });
      await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: 'ping'
      });
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Failed to validate Gemini configuration: ' + (error instanceof Error && error.message ? ': ' + error.message : '') };
    }
  }

  constructor(modelName: string, workspace: WorkspaceManager) {
    this.modelName = modelName;
    this.workspace = workspace;

    try {
      const apiKey = this.workspace.getProviderSettingsValue(LLMType.Gemini, 'GOOGLE_API_KEY')!;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is missing in the configuration. Please add it to your config.json file.');
      }
      this.genAI = new GoogleGenAI({ apiKey });
      log.info('Gemini LLM initialized successfully');
    } catch (error) {
      log.error('Failed to initialize Gemini LLM:', error);
      throw error;
    }
  }

  async getModels(): Promise<ILLMModel[]> {
    // Currently no support for listModels in the Node SDK - may be coming: https://github.com/google-gemini/generative-ai-js/issues/54
    // For now we're going to make a hardcoded list of current models.
    // This seems like the best source for models and description: https://ai.google.dev/gemini-api/docs/
    const models: ILLMModel[] = [
    {
      provider: LLMType.Gemini,
      id: "gemini-2.5-pro-preview-03-25",
      name: "Gemini 2.5 Pro Preview",
      description: "Enhanced thinking and reasoning, multimodal understanding, advanced coding, and more",
      modelSource: "Google"
    },
    {
      provider: LLMType.Gemini,
      id: "gemini-2.5-flash-preview-04-17",
      name: "Gemini 2.5 Flash Preview",
      description: "Our best model in terms of price-performance, offering well-rounded capabilities.",
      modelSource: "Google"
    },
    {
      provider: LLMType.Gemini,
      id: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      description: "Next generation features, speed, thinking, realtime streaming, and multimodal generation",
      modelSource: "Google"
    },
    {
      provider: LLMType.Gemini,
      id: "gemini-2.0-flash-lite",
      name: "Gemini 2.0 Flash-Lite",
      description: "Cost efficiency and low latency",
      modelSource: "Google"
    },
    {
      provider: LLMType.Gemini,
      id: "gemini-2.0-flash-live-001",
      name: "Gemini 2.0 Flash Live",
      description: "Low-latency bidirectional voice and video interactions",
      modelSource: "Google"
    },
    {
      provider: LLMType.Gemini,
      id: "gemini-1.5-flash",
      name: "Gemini 1.5 Flash",
      description: "Fast and versatile performance across a diverse variety of tasks",
      modelSource: "Google"
    },
    {
      provider: LLMType.Gemini,
      id: "gemini-1.5-flash-8b",
      name: "Gemini 1.5 Flash-8B",
      description: "High volume and lower intelligence tasks",
      modelSource: "Google"
    },
    {
      provider: LLMType.Gemini,
      id: "gemini-1.5-pro",
      name: "Gemini 1.5 Pro",
      description: "Complex reasoning tasks requiring more intelligence",
      modelSource: "Google"
    }];
    // log.info('Gemini models', JSON.stringify(models, null, 2));

    return models;
  }

  async generateResponse(session: ChatSession, messages: ChatMessage[]): Promise<ModelReply> {
    const modelReply: ModelReply = {
      timestamp: Date.now(),
      turns: []
    }

    var modelTools: GeminiTool | undefined = undefined;
    const tools = this.workspace.mcpManager.getAllTools();
    if (tools.length > 0) {
      modelTools = this.convertMCPToolsToGeminiTool(tools);
    }

    try {
      // Turn our ChatMessage[] into a VertexAI Content[]
      const history: Content[] = [];
      function addMessageToHistory(message: Content) {
        // The new Google API is SUPER strict about the history format, in that it needs to be interleaved user/model messages.
        // If you provide a series of user messages in a row (like prompts, refs, rules, etc), it appears to just ignore the whole thing.
        // So we ensure this interleaving with the code below...
        if (history.length > 0 && history[history.length - 1].role === message.role) {
          history[history.length - 1].parts!.push(...message.parts!);
        } else {
          history.push(message);
        }
      }

      for (const message of messages) {
        if ('modelReply' in message) {
          // Process each turn in the LLM reply
          for (const turn of message.modelReply.turns) {
            // Add the assistant's message (including any tool calls)
            const replyContent: Content = {
              role: 'model',
              parts: []
            };

            if (turn.message) {
              replyContent.parts!.push({ text: turn.message ?? turn.error });
            }
            // Add the tool calls, if any
            if (turn.toolCalls && turn.toolCalls.length > 0) {
              for (const toolCall of turn.toolCalls) {
                // Push the tool call
                replyContent.parts!.push({
                  functionCall: {
                    name: toolCall.serverName + '_' + toolCall.toolName,
                    args: toolCall.args ?? {}
                  }
                });
              }
            }
            addMessageToHistory(replyContent);

            // Add the tool call results, if any
            if (turn.toolCalls && turn.toolCalls.length > 0) {
              const toolResultsContent: Content = {
                role: 'user', // New API doesn't accept 'function' role
                parts: []
              };

              for (const toolCall of turn.toolCalls) {
                toolResultsContent.parts!.push({
                  functionResponse: {
                    name: toolCall.serverName + '_' + toolCall.toolName,
                    response: {
                      text: toolCall.output
                    }
                  }
                });
              }
              addMessageToHistory(toolResultsContent);
            }
          }
        } else { 
          // Handle user messages
          const messageContent: Content = {
            role: 'user',
            parts: [{ text: message.content }]
          };
          addMessageToHistory(messageContent);
        }
      } 
      
      // log.info('Gemini message history', JSON.stringify(history, null, 2));

      const lastMessage = history.pop()!;
      var currentPrompt: Part[] = lastMessage.parts!;

      // log.info('history', JSON.stringify(history, null, 2));
      // log.info('currentPrompt', currentPrompt);

      const chat = this.genAI.chats.create({
        model: this.modelName,
        history,
        config: {
          maxOutputTokens: session.maxOutputTokens,
          temperature: session.temperature,
          topP: session.topP,
          tools: modelTools ? [modelTools] : []
        }
      });

      let turnCount = 0;
      while (turnCount < session.maxChatTurns) {
        const turn: Turn = {};
        turnCount++;
        log.debug(`Sending message prompt "${JSON.stringify(currentPrompt, null, 2)}", turn count: ${turnCount}`);
        const response = await chat.sendMessage({ message: currentPrompt });

        log.debug('response', JSON.stringify(response, null, 2));

        turn.inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
        turn.outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

        // Process all parts of the response
        let hasToolUse = false;
        const toolResults: string[] = [];

        currentPrompt = [];
        
        const candidates = response.candidates?.[0];
        if (candidates?.content?.parts) {
          for (const part of candidates.content.parts) {

            if (candidates.finishReason === 'MAX_TOKENS') {
              log.warn('Maximum number of tokens reached for this response');
              turn.error = 'Maximum number of tokens reached for this response.  Increase the Maximum Output Tokens setting if desired.';
            }

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
              const toolResult = await this.workspace.mcpManager.callTool(toolName, toolArgs, session);
              log.info('Tool result:', toolResult);

              // Record the function call and result
              if (toolResult.content[0]?.type === 'text') {
                const resultText = toolResult.content[0].text;
                toolResults.push(resultText);
                if (!turn.toolCalls) {
                  turn.toolCalls = [];
                }
                turn.toolCalls.push({
                  serverName: this.workspace.mcpManager.getToolServerName(toolName),
                  toolName: this.workspace.mcpManager.getToolName(toolName),
                  args: toolArgs,
                  toolCallId: Math.random().toString(16).slice(2, 10), // Random ID, since VertexAI doesn't provide one
                  output: resultText,
                  elapsedTimeMs: toolResult.elapsedTimeMs,
                  error: undefined
                });
                currentPrompt.push({ functionResponse: { name: toolName, response: { text: resultText } } });
              }
            }
          }
        }
        modelReply.turns.push(turn);
          
        // Break if no tool uses in this turn
        if (!hasToolUse) break;
      }

      if (turnCount >= session.maxChatTurns) {
        modelReply.turns.push({
          error: 'Maximum number of tool uses reached'
        });
      }

      return modelReply;
    } catch (error: any) {
      log.error('Gemini API error:', error);
      modelReply.turns.push({
        error: `Error: Failed to generate response from Gemini- ${error.message}`
      });
      return modelReply;
    }
  }
} 