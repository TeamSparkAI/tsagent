import { Tool } from '../mcp/types.js';
import { z } from 'zod';
import { BedrockRuntimeClient, ConverseCommand, ConverseCommandInput, Message, Tool as BedrockTool, ConversationRole, ConverseCommandOutput, ContentBlock } from '@aws-sdk/client-bedrock-runtime';
import { BedrockClient, ListFoundationModelsCommand, ListInferenceProfilesCommand, ListProvisionedModelThroughputsCommand } from '@aws-sdk/client-bedrock';

import { ProviderModel, ProviderId, ProviderInfo, Provider } from './types.js';
import { ChatMessage, ChatSession } from '../types/chat.js';
import { ModelReply, Turn } from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
import { ProviderHelper } from './provider-helper.js';
import { BaseProvider } from './base-provider.js';
import { ProviderDescriptor } from './provider-descriptor.js';

// Schema defined outside class so we can use it for the type
const BedrockConfigSchema = z.object({
  AWS_ACCESS_KEY_ID: z.string().default('env://AWS_ACCESS_KEY_ID'),
  AWS_SECRET_ACCESS_KEY: z.string().default('env://AWS_SECRET_ACCESS_KEY'),
});

// Extract defaults from schema
const schemaDefaults = ProviderDescriptor.getSchemaDefaults(BedrockConfigSchema);

// Internal type (not exported - provider details stay encapsulated)  
type BedrockConfig = z.infer<typeof BedrockConfigSchema>;

// Provider Descriptor
export default class BedrockProviderDescriptor extends ProviderDescriptor {
  readonly providerId = 'bedrock';
  readonly iconPath = 'assets/providers/bedrock.png';
  
  readonly info: ProviderInfo = {
    name: "Amazon Bedrock",
    description: "Amazon Bedrock is a fully managed service that offers a choice of high-performing foundation models from leading AI companies.",
    website: "https://aws.amazon.com/bedrock/",
    configValues: [
      {
        caption: "AWS API access key ID to use for Bedrock",
        key: "AWS_ACCESS_KEY_ID",
        credential: true,
        required: true,
        default: schemaDefaults.AWS_ACCESS_KEY_ID,
      },
      {
        caption: "AWS secret access key to use for Bedrock",
        key: "AWS_SECRET_ACCESS_KEY",
        secret: true,
        required: true,
        default: schemaDefaults.AWS_SECRET_ACCESS_KEY,
      }
    ]
  };
  
  readonly configSchema = BedrockConfigSchema;
  
  constructor(packageRoot: string) {
    super(packageRoot);
  }
  
  getDefaultModelId(): string {
    return 'amazon.nova-pro-v1:0';
  }
  
  // Override for API connectivity check
  protected async validateProvider(
    agent: Agent,
    config: Record<string, string>
  ): Promise<{ isValid: boolean, error?: string } | null> {
    // Cast to typed config for internal use
    const typedConfig = config as BedrockConfig;
    const accessKey = typedConfig.AWS_SECRET_ACCESS_KEY;
    const accessKeyId = typedConfig.AWS_ACCESS_KEY_ID;
    
    if (!accessKey || !accessKeyId) {
      return { isValid: false, error: 'AWS_SECRET_ACCESS_KEY and AWS_ACCESS_KEY_ID are missing or could not be resolved' };
    }
    
    // Live API check
    try {
      const bedrockClient = new BedrockClient({
        region: 'us-east-1',
        credentials: {
          secretAccessKey: accessKey,
          accessKeyId: accessKeyId
        }
      });
      await bedrockClient.send(new ListFoundationModelsCommand({}));
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Failed to validate Bedrock configuration: ' + (error instanceof Error ? error.message : 'Unknown error') };
    }
  }
  
  protected async createProvider(
    modelName: string,
    agent: Agent,
    logger: Logger,
    config: Record<string, string>
  ): Promise<Provider> {
    // Cast to typed config for internal use
    const typedConfig = config as BedrockConfig;
    return new BedrockProvider(modelName, agent, logger, typedConfig, this.providerId);
  }
}


// Provider implementation
class BedrockProvider extends BaseProvider<BedrockConfig> {
  private client: BedrockRuntimeClient;

  constructor(modelName: string, agent: Agent, logger: Logger, config: BedrockConfig, providerId: ProviderId) {
    super(modelName, agent, logger, config, providerId);
    // config is typed and available
    this.client = new BedrockRuntimeClient({ 
      region: 'us-east-1', 
      credentials: {
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        accessKeyId: config.AWS_ACCESS_KEY_ID
      }
    });
    this.logger.info('Bedrock Provider initialized successfully');
  }

  async getModels(): Promise<ProviderModel[]> {
		const bedrockClient = new BedrockClient({
			region: 'us-east-1',
			credentials: {
				secretAccessKey: this.config['AWS_SECRET_ACCESS_KEY']!,
  			accessKeyId: this.config['AWS_ACCESS_KEY_ID']!
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
		//this.logger.info('Bedrock filtered models:', filteredModels);
		const models: ProviderModel[] = filteredModels.map(model => ({
			provider: this.providerId,
			id: model.modelId || '',
			name: model.modelName || model.modelId!,
			modelSource: model.providerName || 'Unknown'
		}));
		return models;
  }

  async generateResponse(session: ChatSession, messages: ChatMessage[]): Promise<ModelReply> {
    const modelReply: ModelReply = {
      timestamp: Date.now(),
      turns: []
    }

    try {
      this.logger.info('Generating response with Bedrock');

			// Build the Bedrock tools array from the MCP tools
      const tools: BedrockTool[] = (await ProviderHelper.getIncludedTools(this.agent, session)).map((tool: Tool) => {
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
          if (message.modelReply.turns.length == 0) {
            // This is the case where the LLM returns a tool call approval, but no other response
            continue;
          }

          // Process each turn in the LLM reply
          for (const turn of message.modelReply.turns) {
						// Push the assistant's message (including any tool calls)
						const messageContent: ContentBlock[] = [];
						if (turn.results) {
							for (const result of turn.results) {
								if (result.type === 'text') {
									messageContent.push({ text: result.text });
								} else if (result.type === 'toolCall') {
									messageContent.push({ 
										toolUse: {
											toolUseId: result.toolCall.toolCallId,
											name: result.toolCall.serverName + '_' + result.toolCall.toolName,
											input: result.toolCall.args as Record<string, any>
										} 
									});
								}
							}
						} else if (turn.error) {
							messageContent.push({ text: turn.error });
						}
            turnMessages.push({
              role: ConversationRole.ASSISTANT,
              content: messageContent
            });
						// Push the tool call results (if multiple tool calls, we push the results in a single message)
						if (turn.results) {
							const toolResults: ContentBlock[] = [];
							for (const result of turn.results) {
								if (result.type === 'toolCall') {
									toolResults.push({
										toolResult: {
											toolUseId: result.toolCall.toolCallId,
											content: [ { text: result.toolCall.output } ]
										}
									});
								}
							}
							if (toolResults.length > 0) {
								turnMessages.push({
									role: ConversationRole.USER,
									content: toolResults
								});
							}
						}
          }
        } else if (message.role != 'approval') {
          // Handle regular messages
          turnMessages.push({
            role: message.role == 'user' ? ConversationRole.USER : ConversationRole.ASSISTANT,
            content: [ { text: message.content } ]
          });
        }
      }
 
      // In processing tool call approvals, we need to do the following:
      // - Add the tool call result to the model reply, as a turn (generic)
      // - Add the tool call and result to the context history (LLM specific)

      // We're only going to process tool call approvals if it's the last message in the chat history
      const lastChatMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
      if (lastChatMessage && 'toolCallApprovals' in lastChatMessage) {
        // Handle tool call approvals
        const toolCallsContent: ContentBlock[] = [];
        const toolCallsResults: ContentBlock[] = [];
        const turn: Turn = { results: [] };
        for (const toolCallApproval of lastChatMessage.toolCallApprovals) {
          this.logger.info('Model processing tool call approval', JSON.stringify(toolCallApproval, null, 2));
          const functionName = toolCallApproval.serverName + '_' + toolCallApproval.toolName;

          // Add the tool call to the context history
          toolCallsContent.push({ 
            toolUse: {
              toolUseId: toolCallApproval.toolCallId,
              name: functionName,
              input: toolCallApproval.args as Record<string, any>
            }
          });

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
              toolCallsResults.push({
                toolResult: {
                  toolUseId: toolCallApproval.toolCallId,
                  content: [ { text: resultText } ]
                }
              });
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
            toolCallsResults.push({
              toolResult: {
                toolUseId: toolCallApproval.toolCallId,
                content: [ { text: 'Tool call denied' } ]
              }
            });
          }
        }
        modelReply.turns.push(turn);
        // Add the final resolved tool call approvals to the contexct history
        turnMessages.push({
          role: ConversationRole.ASSISTANT,
          content: toolCallsContent
        });
        turnMessages.push({
          role: ConversationRole.USER,
          content: toolCallsResults
        });
      }

			let currentResponse: ConverseCommandOutput | null = null;

      const state = session.getState();

      let turnCount = 0;
      while (turnCount < state.maxChatTurns) {
        const turn: Turn = { results: [] };
        turnCount++;
        let hasToolUse = false;

        const converseCommand: ConverseCommandInput = {
					modelId: this.modelName,
          inferenceConfig: {
            maxTokens: state.maxOutputTokens,
            temperature: state.temperature,
            topP: state.topP
          },
					messages: turnMessages,
					...(tools.length > 0 && {
						toolConfig: {
							tools: tools,
						}
					})
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

        if (currentResponse.stopReason === 'max_tokens') {
          this.logger.warn('Maximum number of tokens reached for this response');
          turn.error = 'Maximum number of tokens reached for this response.  Increase the Maximum Output Tokens setting if desired.';
        }

				// We're going to push the response message here so that any tool results added in the processing of this call are added after this message
				turnMessages.push(currentResponse.output?.message!);

        const toolCallsResults: ContentBlock[] = []
    
				// this.logger.info('Bedrock send response:', JSON.stringify(currentResponse));

        const content = currentResponse.output?.message?.content;
				if (content && content.length > 0) {
					for (const part of content) {
						if (part.text) {
							turn.results!.push({
                type: 'text',
                text: part.text
              });
						}

						if (part.toolUse) {
							hasToolUse = true;

							const toolCall = part.toolUse;
							const toolName = toolCall.name!;
							const toolUseId = toolCall.toolUseId;
							const toolArgs = toolCall.input as Record<string, any>;

              const toolServerName = ProviderHelper.getToolServerName(toolName);
              const toolToolName = ProviderHelper.getToolName(toolName);

              if (await session.isToolApprovalRequired(toolServerName, toolToolName)) {
                // Process tool approval
                if (!modelReply.pendingToolCalls) {
                  modelReply.pendingToolCalls = [];
                }
                modelReply.pendingToolCalls.push({
                  serverName: toolServerName,
                  toolName: toolToolName,
                  args: toolArgs,
                  toolCallId: toolUseId
                });
              } else {
                // Call the tool
                const toolResult = await ProviderHelper.callTool(this.agent, toolName, toolArgs, session);
                if (toolResult.content[0]?.type === 'text') {
                  const resultText = toolResult.content[0].text;

                  // For Bedrock, we need to push multiple tool call results into the same user message (or it will complain), so we aggregate them here
                  // and push the message below (assuming any tool call results are present).
                  toolCallsResults.push({
                    toolResult: {
                      toolUseId: toolUseId,
                      content: [ { text: resultText } ]
                    }
                  })
      
                  // Record the function call and result
                  turn.results!.push({
                    type: 'toolCall',
                    toolCall: {
                      serverName: toolServerName,
                      toolName: toolToolName,
                      args: toolArgs,
                      output: resultText,
                      toolCallId: toolUseId,
                      elapsedTimeMs: toolResult.elapsedTimeMs,
                    }
                  });  
                }
              }
						}
					}
        }

        // Add the tool call results to the context history
        if (toolCallsResults.length > 0) {
          turnMessages.push({
            role: ConversationRole.USER,
            content: toolCallsResults
          });
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

      this.logger.info('Bedrock response generated successfully');
      return modelReply;
    } catch (error: unknown) {
      this.logger.error('Bedrock API error:', error instanceof Error ? error.message : 'Unknown error');
      modelReply.turns.push({
        error: `Error: Failed to generate response from Bedrock - ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return modelReply;
    }
  }
}