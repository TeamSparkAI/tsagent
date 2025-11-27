import { Tool } from '../mcp/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { LlamaChatSession, type LLamaChatPromptOptions, Llama, LlamaModel, LlamaContext, getLlama, ChatModelFunctionCall, ChatHistoryItem } from 'node-llama-cpp';

import { ModelReply, Provider, ProviderModel, ProviderType, ProviderInfo, Turn } from './types.js';
import { ChatMessage, ChatSession } from '../types/chat.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { ProviderHelper } from './provider-helper.js';

/**
 * LocalProvider: tool calling when approval is required
 *
 * Problem:
 * - node-llama-cpp can make multiple function calls in a single turn and/or advance multiple internal
 *   turns in one generation (incorporating function call results from one turn in subsequent turns).  
 *   When a call requires approval, we need to terminate generation so we can get approval from the user
 *   and continue in a subsequent turn.
 *
 * Solution:
 * - Limit to one concurrent function call (maxParallelFunctionCalls = 1).
 * - In the function callhandler:
 *   - If no approval required: execute immediately; record timing for correlation; return result.
 *   - If approval required: add to pending list; abort (stopOnAbortSignal) so generation halts.
 * - On generate call, if there are pending tool call approvals, we call the functions and append
 *   the calls with results to the context (history) - as we do with all other providers so that
 *   generation can continue with the tool call results incorporated into the context.
 */

export class LocalProvider implements Provider {
  private readonly agent: Agent;
  private readonly modelName: string;
  private readonly logger: Logger;
  private readonly config: Record<string, string>;
  private modelPath: string = '';
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;


  static getInfo(): ProviderInfo {
    return {
      name: "Local GGUF Models",
      description: "Run local GGUF models using node-llama-cpp for complete privacy and offline capability",
      configValues: [
        {
          caption: "Models directory",
          key: "MODEL_DIRECTORY",
          secret: false,
          required: true,
        }
      ]
    };
  }
  
  static async validateConfiguration(agent: Agent, config: Record<string, string>): Promise<{ isValid: boolean, error?: string }> {
    const modelDir = config['MODEL_DIRECTORY'];
    if (!modelDir) {
      return { isValid: false, error: 'MODEL_DIRECTORY is missing in the configuration. Please add it to your config.json file.' };
    }
    
    try {
      if (!fs.existsSync(modelDir)) {
        return { isValid: false, error: `Model directory does not exist: ${modelDir}` };
      }
      
      // Check for at least one .gguf file
      const files = fs.readdirSync(modelDir);
      const hasGguf = files.some(file => file.endsWith('.gguf'));
      
      if (!hasGguf) {
        return { isValid: false, error: `No .gguf files found in directory: ${modelDir}` };
      }
      
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `Failed to validate local configuration: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  constructor(modelName: string, agent: Agent, logger: Logger, resolvedConfig: Record<string, string>) {
    this.modelName = modelName || '';
    this.agent = agent;
    this.logger = logger;
    this.config = resolvedConfig;

    const modelDir = this.config['MODEL_DIRECTORY'];
    if (!modelDir) {
      throw new Error('MODEL_DIRECTORY is missing in the configuration.');
    }

    // Only set and validate model path if a modelName was provided
    if (this.modelName) {
      this.modelPath = path.join(modelDir, this.modelName);
      
      // Validate the model file exists if a specific model was requested
      if (!fs.existsSync(this.modelPath)) {
        throw new Error(`Model file not found: ${this.modelPath}`);
      }
    } else {
      // Empty string or undefined - this is fine for getModels() calls
      this.modelPath = '';
    }

    this.llama = null;
    this.model = null;
    this.logger.info('Local Provider initialized successfully');
  }

  private async initializeModel() {
    if (this.model) {
      return;
    }

    // This should not happen if a modelName was provided in constructor
    if (!this.modelName || !this.modelPath) {
      throw new Error('Cannot initialize model: No model specified');
    }

    try {
      this.logger.info('Loading local model:', this.modelPath);
      
       // Use static import
       this.llama = await getLlama();
       if (!this.llama) {
         throw new Error('Failed to initialize Llama instance');
       }
       
       this.model = await this.llama.loadModel({
         modelPath: this.modelPath
       });
       
       // Log model metadata
       this.logger.info('Local model loaded successfully');
       this.logger.info('Model metadata:', {
         size: this.model.size,
         trainContextSize: this.model.trainContextSize,
         tokenizer: this.model.tokenizer,
         // Log all available properties
         allProperties: Object.keys(this.model)
       });
    } catch (error) {
      this.logger.error('Failed to load local model:', error);
      throw new Error(`Failed to load local model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  async getModels(): Promise<ProviderModel[]> {
    const modelDir = this.config['MODEL_DIRECTORY'];
    if (!modelDir || !fs.existsSync(modelDir)) {
      return [];
    }
    
    try {
      const files = fs.readdirSync(modelDir).filter(file => file.endsWith('.gguf'));
      return files.map(file => ({
        provider: ProviderType.Local,
        id: file,
        name: file.replace('.gguf', ''),
        modelSource: 'Local GGUF'
      }));
    } catch (error) {
      this.logger.error('Error listing local models:', error);
      return [];
    }
  }

  async generateResponse(session: ChatSession, messages: ChatMessage[]): Promise<ModelReply> {
    // Queue to store tool execution data for correlation with response
    const toolExecutionQueue: Array<{
      result: string;
      elapsedTimeMs: number;
      toolName: string;
    }> = [];

    /**
     * Enqueue tool execution data for later correlation with response
     */
    const enqueueToolExecutionResult = (result: string, elapsedTimeMs: number, toolName: string): void => {
      toolExecutionQueue.push({
        result,
        elapsedTimeMs,
        toolName
      });
    };

    /**
     * Dequeue tool execution data by matching result content and tool name
     * Returns the first matching entry and removes it from the queue
     */
    const dequeueToolExecutionResult = (result: string, toolName: string): { elapsedTimeMs: number } | null => {
      const executionIndex = toolExecutionQueue.findIndex(
        exec => exec.result === result && exec.toolName === toolName
      );
      
      if (executionIndex !== -1) {
        const executionData = toolExecutionQueue.splice(executionIndex, 1)[0];
        return { elapsedTimeMs: executionData.elapsedTimeMs };
      }
      
      return null;
    };

    const modelReply: ModelReply = {
      timestamp: Date.now(),
      turns: []
    };

    try {
      await this.initializeModel();
      
      if (!this.model) {
        throw new Error('Model not initialized');
      }
      const context: LlamaContext = await this.model.createContext();
      
      // Get system message if any
      const systemMessage = messages.find(m => m.role === 'system' && 'content' in m);
      const systemPrompt = systemMessage && 'content' in systemMessage ? systemMessage.content : '';
      
      // Get tools for this session
      const tools = await ProviderHelper.getIncludedTools(this.agent, session);
      
      this.logger.info('Building conversation context:');
      this.logger.info(`- System prompt: "${systemPrompt}"`);
      this.logger.info(`- Total messages: ${messages.length}`);
      this.logger.info(`- Available tools: ${tools.length}`);
      
      // Build conversation history for node-llama-cpp
      const conversationHistory: ChatHistoryItem[] = [];
      
      for (const message of messages) {
        if (message.role === 'system') {
          continue; // System messages handled separately
        }
        
        if ('modelReply' in message) {
          // This is an assistant response with potential tool calls
          for (const turn of message.modelReply.turns) {
            const responseItems: Array<string | any> = [];
            
            // Add the turn results if any
            if (turn.results) {
              for (const result of turn.results) {
                if (result.type === 'text') {
                  responseItems.push(result.text);
                } else if (result.type === 'toolCall') {
                  responseItems.push({
                    type: 'functionCall',
                    name: result.toolCall.serverName + '_' + result.toolCall.toolName,
                    description: '',
                    params: result.toolCall.args,
                    result: result.toolCall.output,
                    rawCall: undefined
                  });
                }
              }
            } else if (turn.error) {
              responseItems.push(turn.error);
            }
            
            // Create a single model response with all items
            if (responseItems.length > 0) {
              conversationHistory.push({
                type: 'model',
                response: responseItems
              });
            }
          }
        } else if (message.role === 'user' && 'content' in message) {
          conversationHistory.push({
            type: 'user',
            text: message.content
          });
        }
      }

      // Process tool call approvals if this is the last message
      const lastChatMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
      if (lastChatMessage && 'toolCallApprovals' in lastChatMessage) {
        const responseItems: Array<string | any> = [];
        
        for (const toolCallApproval of lastChatMessage.toolCallApprovals) {
          const turn: Turn = {};
          
          if (toolCallApproval.decision === 'allow-session') {
            session.toolIsApprovedForSession(toolCallApproval.serverName, toolCallApproval.toolName);
          }

          this.logger.info('Processing tool call approval:', JSON.stringify(toolCallApproval, null, 2));
          
          if (toolCallApproval.decision === 'allow-session' || toolCallApproval.decision === 'allow-once') {
            // Run the tool
            const toolResult = await ProviderHelper.callTool(this.agent, toolCallApproval.serverName + '_' + toolCallApproval.toolName, toolCallApproval.args, session);
            if (toolResult.content[0]?.type === 'text') {
              const resultText = toolResult.content[0].text;
              if (!turn.results) {
                turn.results = [];
              }
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
              
              // Add function call to response items
              responseItems.push({
                type: 'functionCall',
                name: toolCallApproval.serverName + '_' + toolCallApproval.toolName,
                description: '',
                params: toolCallApproval.args,
                result: resultText,
                rawCall: undefined
              });
            }
          } else if (toolCallApproval.decision === 'deny') {
            if (!turn.results) {
              turn.results = [];
            }
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
            
            // Add denied function call to response items
            responseItems.push({
              type: 'functionCall',
              name: toolCallApproval.serverName + '_' + toolCallApproval.toolName,
              description: '',
              params: toolCallApproval.args,
              result: 'Tool call denied',
              rawCall: undefined
            });
          }
          
          if (turn.results && turn.results.length > 0) {
            modelReply.turns.push(turn);
          }
        }
        
        // Create a single model response with all approved/denied tool calls
        if (responseItems.length > 0) {
          conversationHistory.push({
            type: 'model',
            response: responseItems
          });
        }
      }

      const chatSession = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: systemPrompt || undefined,
        chatWrapper: 'auto'
      });
      
      this.logger.info('Chat session created with wrapper:', chatSession.chatWrapper);
      this.logger.info('Chat wrapper type:', chatSession.chatWrapper?.constructor.name);

      chatSession.setChatHistory(conversationHistory);
      
      // Log model metadata to understand wrapper selection
      if (this.model) {
        this.logger.info('Model filename:', this.model.filename);
        if (this.model.fileInfo?.metadata?.tokenizer?.chat_template) {
          this.logger.info('Model has Jinja template:', this.model.fileInfo.metadata.tokenizer.chat_template.substring(0, 200) + '...');
        }
      }
      
      const state = session.getState();
      let turnCount = 0;
      
      while (turnCount < state.maxChatTurns) {
        const turn: Turn = { results: [] };
        turnCount++;
        this.logger.debug(`Processing turn ${turnCount}`);

        try {
          // Get the last user message for this turn
          const lastUserMessage = messages.filter(m => m.role === 'user').pop();
          const userPrompt = lastUserMessage && 'content' in lastUserMessage ? lastUserMessage.content : '';
          
          if (!userPrompt) {
            throw new Error('No user message found');
          }

          const startTime = Date.now();
          this.logger.info('Starting generation...');
          
          // Build per-turn tools with approval-aware handlers and an abort controller
          const abortController = new AbortController();
          const llamaCppTools: Record<string, any> = {};
          for (const tool of tools) {
            llamaCppTools[tool.name] = {
              description: tool.description || '',
              params: tool.inputSchema,
              handler: async (params: any) => {
                this.logger.info('Tool called by model:', tool.name, params);
                // Check if tool requires approval
                const toolServerName = ProviderHelper.getToolServerName(tool.name);
                const toolToolName = ProviderHelper.getToolName(tool.name);
                const requiresApproval = await session.isToolApprovalRequired(toolServerName, toolToolName);

                if (requiresApproval) {
                  this.logger.info('Adding pending tool call to model reply:', tool.name);
                  if (!modelReply.pendingToolCalls) {
                    modelReply.pendingToolCalls = [];
                  }
                  const toolCallId = Math.random().toString(16).slice(2, 10);
                  modelReply.pendingToolCalls.push({
                    serverName: toolServerName,
                    toolName: toolToolName,
                    args: params || {},
                    toolCallId: toolCallId
                  });
                  this.logger.info('Tool requires approval, aborting generation:', tool.name);
                  abortController.abort();
                  return 'PENDING';
                }

                try {
                  const toolResult = await ProviderHelper.callTool(this.agent, tool.name, params, session);
                  const firstContent = toolResult.content[0];
                  const resultText = (firstContent && firstContent.type === 'text' && firstContent.text) 
                    ? firstContent.text 
                    : 'Tool executed successfully';
                  enqueueToolExecutionResult(resultText, typeof toolResult.elapsedTimeMs === 'number' ? toolResult.elapsedTimeMs : 0, String(tool.name));
                  this.logger.info('Tool result:', resultText);
                  return resultText;
                } catch (error) {
                  this.logger.error('Tool execution failed:', error);
                  const errorText = `Tool execution failed: ${error}`;
                  enqueueToolExecutionResult(errorText, 0, String(tool.name));
                  return errorText;
                }
              }
            };
          }

          // Use promptWithMeta to get structured response with function calls
          const responseMeta = await chatSession.promptWithMeta(userPrompt, {
            temperature: state.temperature || 0.8,
            maxTokens: state.maxOutputTokens || 512,
            topP: state.topP || 0.9,
            functions: Object.keys(llamaCppTools).length > 0 ? llamaCppTools : undefined,
            maxParallelFunctionCalls: 1,
            signal: abortController.signal,
            stopOnAbortSignal: true
          });

          this.logger.info('Chat history:', JSON.stringify(chatSession.getChatHistory(), null, 2));
          
          const endTime = Date.now();
          this.logger.info(`Generation completed in ${endTime - startTime}ms`);
          
          this.logger.info(`Raw response: "${responseMeta.responseText}"`);
          this.logger.info(`Response length: ${responseMeta.responseText.length} characters`);
          this.logger.info(`Stop reason: ${responseMeta.stopReason}`);

          // Token counting
          try {
            turn.inputTokens = chatSession.sequence.tokenMeter?.usedInputTokens || 0;
            turn.outputTokens = responseMeta.responseText.split(' ').length || 0;
          } catch (tokenError) {
            turn.inputTokens = 0;
            turn.outputTokens = responseMeta.responseText.split(' ').length || 0;
          }

          // Process the structured response
          const functionCalls: ChatModelFunctionCall[] = [];
          
          for (const item of responseMeta.response) {
            this.logger.info('Response item:', JSON.stringify(item, null, 2));
            if (typeof item === 'string') {
              turn.results!.push({
                type: 'text',
                text: item
              });
            } else if (item.type === 'functionCall') {
              const toolName = item.name;
              const tool = tools.find(t => t.name === toolName);

              if (tool) {
                const toolServerName = ProviderHelper.getToolServerName(tool.name);
                const toolToolName = ProviderHelper.getToolName(tool.name);
                const toolCallId = Math.random().toString(16).slice(2, 10);

                // Tool was called during generation, record the call and result
                this.logger.info('Adding tool call to turn results:', item.name);
                
                // Try to get the actual elapsed time from our execution queue
                const executionData = dequeueToolExecutionResult(item.result || '', toolName);
                const elapsedTimeMs = executionData?.elapsedTimeMs ?? 1;
                
                if (executionData) {
                this.logger.info(`Matched tool call ${toolName} with execution data: ${elapsedTimeMs}ms`);
                } else {
                this.logger.warn(`Could not find execution data for tool call ${toolName} with result: ${item.result}`);
                }
                
                turn.results!.push({
                type: 'toolCall',
                toolCall: {
                    serverName: toolServerName,
                    toolName: toolToolName,
                    args: item.params || {},
                    toolCallId: toolCallId,
                    output: item.result || '',
                    elapsedTimeMs: elapsedTimeMs,
                    error: undefined
                }
                });
              } else {
                this.logger.warn(`Function call for unknown tool: ${toolName}`);
              }
            }
          }

          modelReply.turns.push(turn);
          
          // Always break - either we're done or we have pending tool calls (requring approval), so either way we yeild back to the chat
          break;
        } catch (error) {
          this.logger.error('Error in turn:', error);
          turn.error = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
          modelReply.turns.push(turn);
          return modelReply;
        }
      }
      
      if (turnCount >= state.maxChatTurns) {
        modelReply.turns.push({
          error: 'Maximum number of chat turns reached'
        });
      }

      this.logger.info('Local Provider response generated successfully');
      return modelReply;

    } catch (error) {
      this.logger.error('Failed to generate response from local model:', error);
      throw new Error(`Failed to generate response from local model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
