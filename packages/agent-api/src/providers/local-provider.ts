import { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { LlamaChatSession, type LLamaChatPromptOptions, Llama, LlamaModel, LlamaContext, getLlama, ChatModelFunctionCall, ChatHistoryItem } from 'node-llama-cpp';

import { ModelReply, Provider, ProviderModel, ProviderType, ProviderInfo, Turn } from './types.js';
import { ChatMessage, TOOL_CALL_DECISION_ALLOW_ONCE, TOOL_CALL_DECISION_ALLOW_SESSION, TOOL_CALL_DECISION_DENY, ChatSession } from '../types/chat.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { ProviderHelper } from './provider-helper.js';

export class LocalProvider implements Provider {
  private readonly agent: Agent;
  private readonly modelName: string;
  private readonly logger: Logger;
  private modelPath: string;
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

  constructor(modelName: string, agent: Agent, logger: Logger) {
    this.modelName = modelName || '';
    this.agent = agent;
    this.logger = logger;

    const config = this.agent.getInstalledProviderConfig(ProviderType.Local);
    if (!config) {
      throw new Error('Local configuration is missing.');
    }
    
    const modelDir = config['MODEL_DIRECTORY'];
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
    const config = this.agent.getInstalledProviderConfig(ProviderType.Local);
    if (!config) {
      return [];
    }
    
    const modelDir = config['MODEL_DIRECTORY'];
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
      const llamaCppTools: Record<string, any> = {};
      
      for (const tool of tools) {
        llamaCppTools[tool.name] = {
          description: tool.description || '',
          params: tool.inputSchema,
          handler: async (params: any) => {
            // Execute the tool directly
            this.logger.info('Tool called by model:', tool.name, params);
            
            try {
              const toolResult = await ProviderHelper.callTool(this.agent, tool.name, params, session);
              const resultText = toolResult.content[0]?.text || 'Tool executed successfully';
              
              this.logger.info('Tool result:', resultText);
              return resultText;
            } catch (error) {
              this.logger.error('Tool execution failed:', error);
              return `Tool execution failed: ${error}`;
            }
          }
        };
      }
      
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
            
            // Add the turn message text if any
            if (turn.message) {
              responseItems.push(turn.message);
            }
            
            // Add tool calls if any
            if (turn.toolCalls && turn.toolCalls.length > 0) {
              for (const toolCall of turn.toolCalls) {
                responseItems.push({
                  type: 'functionCall',
                  name: toolCall.serverName + '_' + toolCall.toolName,
                  description: '',
                  params: toolCall.args,
                  result: toolCall.output,
                  rawCall: undefined
                });
              }
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
          
          if (toolCallApproval.decision === TOOL_CALL_DECISION_ALLOW_SESSION) {
            session.toolIsApprovedForSession(toolCallApproval.serverName, toolCallApproval.toolName);
          }
          
          if (toolCallApproval.decision === TOOL_CALL_DECISION_ALLOW_SESSION || toolCallApproval.decision === TOOL_CALL_DECISION_ALLOW_ONCE) {
            // Run the tool
            const toolResult = await ProviderHelper.callTool(this.agent, toolCallApproval.serverName + '_' + toolCallApproval.toolName, toolCallApproval.args, session);
            if (toolResult.content[0]?.type === 'text') {
              const resultText = toolResult.content[0].text;
              turn.toolCalls = [{
                serverName: toolCallApproval.serverName,
                toolName: toolCallApproval.toolName,
                args: toolCallApproval.args,
                toolCallId: toolCallApproval.toolCallId,
                output: resultText,
                elapsedTimeMs: toolResult.elapsedTimeMs,
                error: undefined
              }];
              
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
          } else if (toolCallApproval.decision === TOOL_CALL_DECISION_DENY) {
            turn.toolCalls = [{
              serverName: toolCallApproval.serverName,
              toolName: toolCallApproval.toolName,
              args: toolCallApproval.args,
              toolCallId: toolCallApproval.toolCallId,
              output: 'Tool call denied',
              elapsedTimeMs: 0,
              error: 'Tool call denied'
            }];
            
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
          
          if (turn.toolCalls) {
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
        const turn: Turn = {};
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
          
          // Use promptWithMeta to get structured response with function calls
          const responseMeta = await chatSession.promptWithMeta(userPrompt, {
            temperature: state.temperature || 0.8,
            maxTokens: state.maxOutputTokens || 512,
            topP: state.topP || 0.9,
            functions: Object.keys(llamaCppTools).length > 0 ? llamaCppTools : undefined
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
          let responseText = '';
          const functionCalls: ChatModelFunctionCall[] = [];

          // A "turn" is basically a text response followed by one or more tool calls.  Given that this provider can call tools
          // and continue generation internally, we can get responses with any combination of interleaved text and tool calls.
          // To make it fit our model, we need to treat each text + tool calls (followed by another text) as its own turn.
          
          for (const item of responseMeta.response) {
            this.logger.info('Response item:', JSON.stringify(item, null, 2));
            if (typeof item === 'string') {
              responseText += item;
            } else if (item.type === 'functionCall') {
              functionCalls.push(item);
            }
          }

          if (responseText) {
            turn.message = responseText;
          }

          // Handle function calls from the structured response
          if (functionCalls.length > 0) {
            this.logger.info(`Found ${functionCalls.length} function calls:`, functionCalls);
            
            for (const functionCall of functionCalls) {
              const toolName = functionCall.name;
              const tool = tools.find(t => t.name === toolName);
              
              if (tool) {
                const toolServerName = ProviderHelper.getToolServerName(tool.name);
                const toolToolName = ProviderHelper.getToolName(tool.name);
                const toolCallId = Math.random().toString(16).slice(2, 10);
                
                if (await session.isToolApprovalRequired(toolServerName, toolToolName)) {
                  // Process tool approval
                  if (!modelReply.pendingToolCalls) {
                    modelReply.pendingToolCalls = [];
                  }
                  modelReply.pendingToolCalls.push({
                    serverName: toolServerName,
                    toolName: toolToolName,
                    args: functionCall.params || {},
                    toolCallId: toolCallId
                  });
                } else {
                  // Call the tool directly
                  const toolResult = await ProviderHelper.callTool(this.agent, tool.name, functionCall.params || {}, session);
                  if (toolResult.content[0]?.type === 'text') {
                    const resultText = toolResult.content[0].text;
                    if (!turn.toolCalls) {
                      turn.toolCalls = [];
                    }
                    turn.toolCalls.push({
                      serverName: toolServerName,
                      toolName: toolToolName,
                      args: functionCall.params || {},
                      toolCallId: toolCallId,
                      output: resultText,
                      elapsedTimeMs: toolResult.elapsedTimeMs,
                      error: undefined
                    });
                  }
                }
              } else {
                this.logger.warn(`Function call for unknown tool: ${toolName}`);
              }
            }
          }

          modelReply.turns.push(turn);
          
          // Break if no tool calls or if there are pending tool calls requiring approval
          //if (!turn.toolCalls || turn.toolCalls.length === 0 || (modelReply.pendingToolCalls && modelReply.pendingToolCalls.length > 0)) {
            break;
          //}

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
