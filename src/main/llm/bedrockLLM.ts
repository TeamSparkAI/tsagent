import { ILLM, ILLMModel, LLMType, LLMProviderInfo } from '../../shared/llm';
import { Tool } from '@modelcontextprotocol/sdk/types';
import { BedrockRuntimeClient, ConverseCommand, ConverseCommandInput, Message, Tool as BedrockTool, ConversationRole, ConverseCommandOutput, ContentBlock } from '@aws-sdk/client-bedrock-runtime';
import log from 'electron-log';
import { ChatMessage } from '../../shared/ChatSession';
import { ModelReply, Turn } from '../../shared/ModelReply';
import { BedrockClient, ListFoundationModelsCommand, ListInferenceProfilesCommand, ListProvisionedModelThroughputsCommand } from '@aws-sdk/client-bedrock';
import { WorkspaceManager } from '../state/WorkspaceManager';

export class BedrockLLM implements ILLM {
  private readonly workspace: WorkspaceManager;
  private readonly modelName: string;
  private readonly MAX_TURNS = 10;  // Maximum number of tool use turns

  private client!: BedrockRuntimeClient;

  static getInfo(): LLMProviderInfo {
    return {
      name: "Amazon Bedrock",
      description: "Amazon Bedrock is a fully managed service that offers a choice of high-performing foundation models from leading AI companies.",
      website: "https://aws.amazon.com/bedrock/",
      requiresApiKey: true,
      configKeys: ['BEDROCK_ACCESS_KEY_ID', 'BEDROCK_SECRET_ACCESS_KEY']
    };
  }

  constructor(modelName: string, workspace: WorkspaceManager) {
    this.modelName = modelName;
    this.workspace = workspace;
    
    try {
      const accessKey = this.workspace.getProviderSettingsValue(LLMType.Bedrock, 'BEDROCK_SECRET_ACCESS_KEY');
      const accessKeyId = this.workspace.getProviderSettingsValue(LLMType.Bedrock, 'BEDROCK_ACCESS_KEY_ID');
      if (!accessKey || !accessKeyId) {
        throw new Error('BEDROCK_SECRET_ACCESS_KEY and BEDROCK_ACCESS_KEY_ID are missing in the configuration. Please add them to your workspace configuration.');
      }
      this.client = new BedrockRuntimeClient({ 
        region: 'us-east-1', 
        credentials: {
            secretAccessKey: accessKey,
            accessKeyId: accessKeyId
        }
      });
      log.info('Bedrock LLM initialized successfully');
    } catch (error) {
      log.error('Failed to initialize Bedrock LLM:', error);
      throw error;
    }
  }

  async getModels(): Promise<ILLMModel[]> {
		const bedrockClient = new BedrockClient({
			region: 'us-east-1',
			credentials: {
				secretAccessKey: this.workspace.getProviderSettingsValue(LLMType.Bedrock, 'BEDROCK_SECRET_ACCESS_KEY')!,
				accessKeyId: this.workspace.getProviderSettingsValue(LLMType.Bedrock, 'BEDROCK_ACCESS_KEY_ID')!
			}
		});
		// To support inferece types othet than ON_DEMAND, we will need to list them specifically, and use the returned ARNs to create the models
		// !!! LATER
		// const inferenceProfiles = await bedrockClient.send(new ListInferenceProfilesCommand({}));
		// const provisionedModels = await bedrockClient.send(new ListProvisionedModelThroughputsCommand({}));
    //
		const command = new ListFoundationModelsCommand({});
    const modelList = await bedrockClient.send(command);

		// Many Bedrock models do not support tools (or even chat generally)
  	// https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-supported-models-features.html
    //
		const killterms = [
			"titan",
			"instruct", // Mistral AI Instruct, Jamba Instruct, Llama Instruct, etc.
			"cohere.command-text",
			"cohere.command-light-text",
			"embed",
		]
		const filteredModels = modelList.modelSummaries?.filter(model => 
			// Check for ACTIVE status (we don't want LEGACY models)
			model.modelLifecycle?.status === 'ACTIVE' && 
			// Check for ON_DEMAND inference type (we don't want PROVISIONED or INFERENCE_PROFILE models, we have to handle those separately)
			model.inferenceTypesSupported?.includes('ON_DEMAND') &&
			// Exclude models that match any of the kill terms
			!killterms.some(term => model.modelId?.toLowerCase().includes(term))
		) || [];
		//log.info('Bedrock filtered models:', filteredModels);
		const models: ILLMModel[] = filteredModels.map(model => ({
			provider: LLMType.Bedrock,
			id: model.modelId || '',
			name: model.modelName || model.modelId!,
			modelSource: model.providerName || 'Unknown'
		}));
		return models;
  }

  async generateResponse(messages: ChatMessage[]): Promise<ModelReply> {
    const modelReply: ModelReply = {
      timestamp: Date.now(),
      turns: []
    }

    try {
      log.info('Generating response with Bedrock');

			// Build the Bedrock tools array from the MCP tools
      const tools: BedrockTool[] = this.workspace.mcpManager.getAllTools().map((tool: Tool) => {
        const properties: Record<string, any> = {};
        
        // Convert properties safely with type checking
        if (tool.inputSchema && tool.inputSchema.properties && typeof tool.inputSchema.properties === 'object') {
          Object.keys(tool.inputSchema.properties).forEach(key => {
            properties[key] = tool.inputSchema.properties![key];
          });
        }
        
        return {
          toolSpec: {
            name: tool.name,
            description: tool.description,
            inputSchema: { 
              json: {
                type: "object",
                properties: properties,
                required: Array.isArray(tool.inputSchema.required) ? tool.inputSchema.required : []
              }
            },
          },
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

      // Turn our ChatMessage[] into an proper Bedrock message array
      const turnMessages: Message[] = [];
      for (const message of messages) {
        if ('modelReply' in message) {
          // Process each turn in the LLM reply
          for (const turn of message.modelReply.turns) {
						// Push the assistant's message (including any tool calls)
						const messageContent: ContentBlock[] = [];
						messageContent.push({ text: turn.message ?? turn.error! });
						if (turn.toolCalls && turn.toolCalls.length > 0) {
							for (const toolCall of turn.toolCalls) {
								messageContent.push({ toolUse: {
									toolUseId: toolCall.toolCallId,
									name: toolCall.serverName + '_' + toolCall.toolName,
									input: toolCall.args as Record<string, any>
								} });
							}
						}
            turnMessages.push({
              role: ConversationRole.ASSISTANT,
              content: messageContent
            });
						// Push the tool call results (if multiple tool calls, we push the results in a single message)
						if (turn.toolCalls && turn.toolCalls.length > 0) {
							const toolResults: ContentBlock[] = [];
							for (const toolCall of turn.toolCalls) {
								toolResults.push({
									toolResult: {
										toolUseId: toolCall.toolCallId,
										content: [ { text: toolCall.output } ]
									}
								});
							}
							turnMessages.push({
								role: ConversationRole.USER,
								content: toolResults
							});
						}
          }
        } else {
          // Handle regular messages
          turnMessages.push({
            role: message.role == 'user' ? ConversationRole.USER : ConversationRole.ASSISTANT,
            content: [ { text: message.content } ]
          });
        }
      }
 
			let currentResponse: ConverseCommandOutput | null = null;

      let turnCount = 0;
      while (turnCount < this.MAX_TURNS) {
        const turn: Turn = {};
        turnCount++;
        let hasToolUse = false;

        const converseCommand: ConverseCommandInput = {
					modelId: this.modelName,
					messages: turnMessages,
					toolConfig: {
						tools: tools,
					}
				}

				if (systemPrompt) {
					converseCommand.system = [
						{
							text: systemPrompt
						}
					]
				}
    
				currentResponse = await this.client.send(new ConverseCommand(converseCommand));
				turn.inputTokens = currentResponse.usage?.inputTokens ?? 0;
				turn.outputTokens = currentResponse.usage?.outputTokens ?? 0;

				// We're going to push the response message here so that any tool results added in the processing of this call are added after this message
				turnMessages.push(currentResponse.output?.message!);
    
				// log.info('Bedrock send response:', JSON.stringify(currentResponse));

        const content = currentResponse.output?.message?.content;
				if (content && content.length > 0) {
					for (const part of content) {
						if (part.text) {
							turn.message = (turn.message || '') + part.text;
						}

						if (part.toolUse) {
							hasToolUse = true;

							const toolCall = part.toolUse;
							const toolName = toolCall.name!;
							const toolUseId = toolCall.toolUseId;
							const toolArgs = toolCall.input as Record<string, any>;

							const toolResult = await this.workspace.mcpManager.callTool(toolName, toolArgs);

              if (toolResult.content[0]?.type === 'text') {
                const resultText = toolResult.content[0].text;

								// For Bedrock, we push the toolResult as a new user message (we could be smarter and push multiple tool results in a single user message)
								turnMessages.push({
									role: ConversationRole.USER,
									content: [
										{
											toolResult: {
												toolUseId: toolUseId,
												content: [ { text: resultText } ]
											}
										}
									]
								})

                if (!turn.toolCalls) {
                  turn.toolCalls = [];
                }
  
                // Record the function call and result
                turn.toolCalls.push({
                  serverName: this.workspace.mcpManager.getToolServerName(toolName),
                  toolName: this.workspace.mcpManager.getToolName(toolName),
                  args: toolArgs,
                  output: resultText,
                  toolCallId: toolUseId,
                  elapsedTimeMs: toolResult.elapsedTimeMs,
                });  
              }
						}
					}
        }

        modelReply.turns.push(turn);

        // Break if no tool uses in this turn
        if (!hasToolUse) break;
      }
      
      if (turnCount >= this.MAX_TURNS) {
        modelReply.turns.push({
          error: 'Maximum number of tool uses reached'
        });
      }

      log.info('Bedrock response generated successfully');
      return modelReply;
    } catch (error: any) {
      log.error('Bedrock API error:', error.message);
      modelReply.turns.push({
        error: `Error: Failed to generate response from Bedrock - ${error.message}`
      });
      return modelReply;
    }
  }
} 