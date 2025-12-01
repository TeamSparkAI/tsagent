import { Tool } from "../mcp/types.js";
import { z } from 'zod';
import { GoogleGenAI, Tool as GeminiTool, Content, Part, Type as SchemaType } from '@google/genai';

import { ProviderModel, ProviderId, ProviderInfo, Provider } from './types.js';
import { ChatMessage, ChatSession } from '../types/chat.js';
import { ModelReply, Turn } from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { ProviderHelper } from './provider-helper.js';
import { BaseProvider } from './base-provider.js';
import { ProviderDescriptor } from './provider-descriptor.js';

const GeminiConfigSchema = z.object({
  GOOGLE_API_KEY: z.string().default('env://GOOGLE_API_KEY'),
});

// Internal type (not exported - provider details stay encapsulated)
type GeminiConfig = z.infer<typeof GeminiConfigSchema>;

// Provider Descriptor
export default class GeminiProviderDescriptor extends ProviderDescriptor {
  readonly providerId = 'gemini';
  readonly iconPath = 'assets/providers/gemini.png';
  
  readonly info: ProviderInfo = {
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
  
  readonly configSchema = GeminiConfigSchema;
  
  constructor(packageRoot: string) {
    super(packageRoot);
  }
  
  getDefaultModelId(): string {
    return 'gemini-2.0-flash';
  }
  
  // Override for API connectivity check
  protected async validateProvider(
    agent: Agent,
    config: Record<string, string>
  ): Promise<{ isValid: boolean, error?: string } | null> {
    // Cast to typed config for internal use
    const typedConfig = config as GeminiConfig;
    const apiKey = typedConfig.GOOGLE_API_KEY;
    
    if (!apiKey) {
      return { isValid: false, error: 'GOOGLE_API_KEY is missing or could not be resolved' };
    }
    
    // Live API check
    try {
      const genAI = new GoogleGenAI({ apiKey });
      await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: 'ping'
      });
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Failed to validate Gemini configuration: ' + (error instanceof Error ? error.message : 'Unknown error') };
    }
  }
  
  protected async createProvider(
    modelName: string,
    agent: Agent,
    logger: Logger,
    config: Record<string, string>
  ): Promise<Provider> {
    // Cast to typed config for internal use
    const typedConfig = config as GeminiConfig;
    return new GeminiProvider(modelName, agent, logger, typedConfig, this.providerId);
  }
}


// Provider implementation
class GeminiProvider extends BaseProvider<GeminiConfig> {
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

  constructor(modelName: string, agent: Agent, logger: Logger, config: GeminiConfig, providerId: ProviderId) {
    super(modelName, agent, logger, config, providerId);
    // config.GOOGLE_API_KEY is typed and available
    this.genAI = new GoogleGenAI({ apiKey: config.GOOGLE_API_KEY });
    this.logger.info('Gemini Provider initialized successfully');
  }

  async getModels(): Promise<ProviderModel[]> {
    const theModels = await this.genAI.models.list();

    // Convert async iterable to array and filter for models with supportedActions that include "generateContent"
    const modelsArray: any[] = [];
    for await (const model of theModels) {
      modelsArray.push(model);
    }
    const filteredModels = modelsArray.filter(model => model.supportedActions?.includes('generateContent'));

    // Models look like this:
    /*
    {
      "name": "models/gemini-2.5-flash-lite",
      "displayName": "Gemini 2.5 Flash-Lite",
      "description": "Stable verion of Gemini 2.5 Flash-Lite, released in July of 2025",
      "version": "001",
      "tunedModelInfo": {},
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 65536,
      "supportedActions": [
        "generateContent",
        "countTokens",
        "createCachedContent",
        "batchGenerateContent"
      ]
    }
    */

    const models: ProviderModel[] = filteredModels.map(model => ({
      provider: this.providerId,
      id: model.name.replace('models/', ''), // Extract just the model name from the full path
      name: model.displayName,
      description: model.description,
      modelSource: "Google"
    }));

    // this.logger.info('Gemini models', JSON.stringify(theModels, null, 2));

    return models;
  }

  async generateResponse(session: ChatSession, messages: ChatMessage[]): Promise<ModelReply> {
    const modelReply: ModelReply = {
      timestamp: Date.now(),
      turns: []
    }

    var modelTools: GeminiTool | undefined = undefined;
    const tools = await ProviderHelper.getIncludedTools(this.agent, session);
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
          if (message.modelReply.turns.length == 0) {
            // This is the case where the LLM returns a tool call approval, but no other response
            continue;
          }

          // Process each turn in the LLM reply
          for (const turn of message.modelReply.turns) {
            // Add the assistant's message (including any tool calls)
            const replyContent: Content = {
              role: 'model',
              parts: []
            };

            // Add the results, if any
            if (turn.results) {
              for (const result of turn.results) {
                if (result.type === 'text') {
                  replyContent.parts!.push({ text: result.text });
                } else if (result.type === 'toolCall') {
                  // Push the tool call
                  replyContent.parts!.push({
                    functionCall: {
                      name: result.toolCall.serverName + '_' + result.toolCall.toolName,
                      args: result.toolCall.args ?? {}
                    }
                  });
                }
              }
            } else if (turn.error) {
              replyContent.parts!.push({ text: turn.error });
            }
            addMessageToHistory(replyContent);

            // Add the tool call results, if any
            if (turn.results) {
              const toolResultsContent: Content = {
                role: 'user', // New API doesn't accept 'function' role
                parts: []
              };

              for (const result of turn.results) {
                if (result.type === 'toolCall') {
                  toolResultsContent.parts!.push({
                    functionResponse: {
                      name: result.toolCall.serverName + '_' + result.toolCall.toolName,
                      response: {
                        text: result.toolCall.output
                      }
                    }
                  });
                }
              }
              
              if (toolResultsContent.parts!.length > 0) {
                addMessageToHistory(toolResultsContent);
              }
            }
          }
        } else if (message.role != 'approval') {
          // Handle user messages
          const messageContent: Content = {
            role: 'user',
            parts: [{ text: message.content }]
          };
          addMessageToHistory(messageContent);
        }
      }

      // In processing tool call approvals, we need to do the following:
      // - Add the tool call result to the model reply, as a turn (generic)
      // - Add the tool call and result to the context history (LLM specific)

      // We're only going to process tool call approvals if it's the last message in the chat history
      const lastChatMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
      if (lastChatMessage && 'toolCallApprovals' in lastChatMessage) {
        // Handle tool call approvals  
        const toolCallsContent: Content = {
          role: 'model',
          parts: []
        };
        const toolCallsResults: Content = {
          role: 'user',
          parts: []
        };

        const turn: Turn = { results: [] };
        for (const toolCallApproval of lastChatMessage.toolCallApprovals) {
          this.logger.info('Model processing tool call approval', JSON.stringify(toolCallApproval, null, 2));
          const functionName = toolCallApproval.serverName + '_' + toolCallApproval.toolName;

          // Add tool call to the context history
          toolCallsContent.parts!.push({ functionCall: { name: functionName, args: toolCallApproval.args } });

          if (toolCallApproval.decision === 'allow-session') {
            session.toolIsApprovedForSession(toolCallApproval.serverName, toolCallApproval.toolName);
          }
          if (toolCallApproval.decision === 'allow-session' || toolCallApproval.decision === 'allow-once') {
            // Run the tool
            const toolResult = await ProviderHelper.callTool(this.agent, functionName, toolCallApproval.args, session);
            if (toolResult.content[0]?.type === 'text') {
              const resultText = toolResult.content[0].text;
              turn.results!.push({
                type: 'toolCall',
                toolCall: {
                  serverName: toolCallApproval.serverName,
                  toolName: toolCallApproval.toolName,
                  args: toolCallApproval.args,
                  toolCallId: toolCallApproval.toolCallId,
                  output: resultText,
                  elapsedTimeMs: toolResult.elapsedTimeMs,
                  error: undefined
                }
              });
              // Add the tool call (executed) result to the context history
              toolCallsResults.parts!.push({ functionResponse: { name: functionName, response: { text: resultText } } });
            }
          } else if (toolCallApproval.decision === 'deny') {
            // Record the tool call and "denied" result
            turn.results!.push({
              type: 'toolCall',
              toolCall: {
                serverName: toolCallApproval.serverName,
                toolName: toolCallApproval.toolName,
                args: toolCallApproval.args,
                toolCallId: toolCallApproval.toolCallId,
                output: 'Tool call denied',
                elapsedTimeMs: 0,
                error: 'Tool call denied'
              }
            });
            // Add the tool call (denied) result to the context history
            toolCallsResults.parts!.push({ functionResponse: { name: functionName, response: { text: 'Tool call denied' } } });
          }
        }
        
        addMessageToHistory(toolCallsContent);
        addMessageToHistory(toolCallsResults); // This will also add the tool call results to the current prompt (as it will be the last message)
        modelReply.turns.push(turn);    
      }
      
      // this.logger.info('Gemini message history', JSON.stringify(history, null, 2));

      const lastMessage = history.pop()!;
      var currentPrompt: Part[] = lastMessage.parts!;

      // this.logger.info('history', JSON.stringify(history, null, 2));
      // this.logger.info('currentPrompt', currentPrompt);

      const state = session.getState();

      const chat = this.genAI.chats.create({
        model: this.modelName,
        history,
        config: {
          maxOutputTokens: state.maxOutputTokens,
          temperature: state.temperature,
          topP: state.topP,
          tools: modelTools ? [modelTools] : []
        }
      });

      let turnCount = 0;
      while (turnCount < state.maxChatTurns) {
        const turn: Turn = { results: [] };
        turnCount++;
        this.logger.debug(`[GeminiProvider] Sending message prompt "${JSON.stringify(currentPrompt, null, 2)}", turn count: ${turnCount}`);
        const response = await chat.sendMessage({ message: currentPrompt });

        this.logger.debug('[GeminiProvider] Response received', JSON.stringify(response, null, 2));

        turn.inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
        turn.outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

        // Process all parts of the response
        let hasToolUse = false;

        currentPrompt = [];
        
        const candidates = response.candidates?.[0];
        if (candidates?.content?.parts) {
          for (const part of candidates.content.parts) {

            if (candidates.finishReason === 'MAX_TOKENS') {
              this.logger.warn('Maximum number of tokens reached for this response');
              turn.error = 'Maximum number of tokens reached for this response.  Increase the Maximum Output Tokens setting if desired.';
            }

            // Handle text parts
            if (part.text) {
              turn.results!.push({
                type: 'text',
                text: part.text.replace(/\\n/g, '\n')
              });
            }
            
            // Handle function calls
            if (part.functionCall?.name && part.functionCall?.args) {
              hasToolUse = true;
              const { name: toolName, args } = part.functionCall;
              const toolArgs = args ? (args as Record<string, unknown>) : undefined;
              this.logger.info('Function call detected:', part.functionCall);

              const toolServerName = ProviderHelper.getToolServerName(toolName);
              const toolToolName = ProviderHelper.getToolName(toolName);
              const toolCallId = Math.random().toString(16).slice(2, 10); // Random ID, since VertexAI doesn't provide one
  
              if (await session.isToolApprovalRequired(toolServerName, toolToolName)) {
                // Process tool approval
                if (!modelReply.pendingToolCalls) {
                  modelReply.pendingToolCalls = [];
                }
                modelReply.pendingToolCalls.push({
                  serverName: toolServerName,
                  toolName: toolToolName,
                  args: toolArgs,
                  toolCallId: toolCallId
                });
              } else {
                // Call the tool
                const toolResult = await ProviderHelper.callTool(this.agent, toolName, toolArgs, session);
                this.logger.info('Tool result:', toolResult);

                // Record the function call and result
                if (toolResult.content[0]?.type === 'text') {
                  const resultText = toolResult.content[0].text;
                  turn.results!.push({
                    type: 'toolCall',
                    toolCall: {
                      serverName: toolServerName,
                      toolName: toolToolName,
                      args: toolArgs,
                      toolCallId: toolCallId,
                      output: resultText,
                      elapsedTimeMs: toolResult.elapsedTimeMs,
                      error: undefined
                    }
                  });
                  currentPrompt.push({ functionResponse: { name: toolName, response: { text: resultText } } });
                }
              }
            }
          }
        }

        if (turn.results && turn.results.length > 0) {
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

      return modelReply;
    } catch (error: unknown) {
      this.logger.error('Gemini API error:', error instanceof Error ? error.message : 'Unknown error');
      modelReply.turns.push({
        error: `Error: Failed to generate response from Gemini- ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return modelReply;
    }
  }
}