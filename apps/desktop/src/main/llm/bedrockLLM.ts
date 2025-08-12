import { ILLM, ILLMModel, LLMType, LLMProviderInfo } from '../../shared/llm';
import { Tool } from '@modelcontextprotocol/sdk/types';
import { BedrockRuntimeClient, ConverseCommand, ConverseCommandInput, Message, Tool as BedrockTool, ConversationRole, ConverseCommandOutput, ContentBlock } from '@aws-sdk/client-bedrock-runtime';
import log from 'electron-log';
import { ChatMessage, TOOL_CALL_DECISION_ALLOW_SESSION, TOOL_CALL_DECISION_ALLOW_ONCE, TOOL_CALL_DECISION_DENY } from '../../shared/ChatSession';
import { ModelReply, Turn } from '../../shared/ModelReply';
import { BedrockClient, ListFoundationModelsCommand, ListInferenceProfilesCommand, ListProvisionedModelThroughputsCommand } from '@aws-sdk/client-bedrock';
import { WorkspaceManager } from '../state/WorkspaceManager';
import { ChatSession } from '../state/ChatSession';

export class BedrockLLM implements ILLM {
  private readonly workspace: WorkspaceManager;
  private readonly modelName: string;

  private client!: BedrockRuntimeClient;

  static getInfo(): LLMProviderInfo {
    return {
      name: "Amazon Bedrock",
      description: "Amazon Bedrock is a fully managed service that offers a choice of high-performing foundation models from leading AI companies.",
      website: "https://aws.amazon.com/bedrock/",
      configValues: [
        {
          caption: "Bedrock API access key ID",
          key: "BEDROCK_ACCESS_KEY_ID",
          secret: false,
          required: true,
        },
        {
          caption: "Bedrock API access key secret",
          key: "BEDROCK_SECRET_ACCESS_KEY",
          secret: true,
          required: true,
        }
      ]
    };
  }

  static async validateConfiguration(workspace: WorkspaceManager): Promise<{ isValid: boolean, error?: string }> {
    const accessKey = workspace.getProviderSettingsValue(LLMType.Bedrock, 'BEDROCK_SECRET_ACCESS_KEY');
    const accessKeyId = workspace.getProviderSettingsValue(LLMType.Bedrock, 'BEDROCK_ACCESS_KEY_ID');
    if (!accessKey || !accessKeyId) {
      return { isValid: false, error: 'BEDROCK_SECRET_ACCESS_KEY and BEDROCK_ACCESS_KEY_ID are missing in the configuration. Please add them to your workspace configuration.' };
    }
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
      log.error('Failed to validate Bedrock configuration:', error);
      return { isValid: false, error: 'Failed to validate Bedrock configuration' + (error instanceof Error && error.message ? ': ' + error.message : '') };
    }
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

  async generateResponse(session: ChatSession, messages: ChatMessage[]): Promise<ModelReply> {
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
          if (message.modelReply.turns.length == 0) {
            // This is the case where the LLM returns a tool call approval, but no other response
            continue;
          }

          // Process each turn in the LLM reply
          for (const turn of message.modelReply.turns) {
						// Push the assistant's message (including any tool calls)
						const messageContent: ContentBlock[] = [];
						messageContent.push({ text: turn.message ?? turn.error! });
						if (turn.toolCalls && turn.toolCalls.length > 0) {
							for (const toolCall of turn.toolCalls) {
								messageContent.push({ 
                  toolUse: {
                    toolUseId: toolCall.toolCallId,
                    name: toolCall.serverName + '_' + toolCall.toolName,
                    input: toolCall.args as Record<string, any>
                  } 
                });
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
        const turn: Turn = { toolCalls: [] };
        for (const toolCallApproval of lastChatMessage.toolCallApprovals) {
          log.info('Model processing tool call approval', JSON.stringify(toolCallApproval, null, 2));
          const functionName = toolCallApproval.serverName + '_' + toolCallApproval.toolName;

          // Add the tool call to the context history
          toolCallsContent.push({ 
            toolUse: {
              toolUseId: toolCallApproval.toolCallId,
              name: functionName,
              input: toolCallApproval.args as Record<string, any>
            }
          });

          if (toolCallApproval.decision === TOOL_CALL_DECISION_ALLOW_SESSION) {
            session.toolIsApprovedForSession(toolCallApproval.serverName, toolCallApproval.toolName);
          }
          if (toolCallApproval.decision === TOOL_CALL_DECISION_ALLOW_SESSION || toolCallApproval.decision === TOOL_CALL_DECISION_ALLOW_ONCE) {
            // Run the tool
            const toolResult = await this.workspace.mcpManager.callTool(functionName, toolCallApproval.args, session);
            if (toolResult.content[0]?.type === 'text') {
              const resultText = toolResult.content[0].text;
              turn.toolCalls!.push({
                serverName: toolCallApproval.serverName,
                toolName: toolCallApproval.toolName,
                args: toolCallApproval.args,
                toolCallId: toolCallApproval.toolCallId,
                output: resultText,
                elapsedTimeMs: toolResult.elapsedTimeMs,
                error: undefined
              });
              // Add the tool call (executed) result to the context history
              toolCallsResults.push({
                toolResult: {
                  toolUseId: toolCallApproval.toolCallId,
                  content: [ { text: resultText } ]
                }
              });
            }
          } else if (toolCallApproval.decision === TOOL_CALL_DECISION_DENY) {
            // Record the tool call and "denied" result
            turn.toolCalls!.push({
              serverName: toolCallApproval.serverName,
              toolName: toolCallApproval.toolName,
              args: toolCallApproval.args,
              toolCallId: toolCallApproval.toolCallId,
              output: 'Tool call denied',
              elapsedTimeMs: 0,
              error: 'Tool call denied'
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

      let turnCount = 0;
      while (turnCount < session.maxChatTurns) {
        const turn: Turn = {};
        turnCount++;
        let hasToolUse = false;

        const converseCommand: ConverseCommandInput = {
					modelId: this.modelName,
          inferenceConfig: {
            maxTokens: session.maxOutputTokens,
            temperature: session.temperature,
            topP: session.topP
          },
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

        if (currentResponse.stopReason === 'max_tokens') {
          log.warn('Maximum number of tokens reached for this response');
          turn.error = 'Maximum number of tokens reached for this response.  Increase the Maximum Output Tokens setting if desired.';
        }

				// We're going to push the response message here so that any tool results added in the processing of this call are added after this message
				turnMessages.push(currentResponse.output?.message!);

        const toolCallsResults: ContentBlock[] = []
    
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

              const toolServerName = this.workspace.mcpManager.getToolServerName(toolName);
              const toolToolName = this.workspace.mcpManager.getToolName(toolName);

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
                const toolResult = await this.workspace.mcpManager.callTool(toolName, toolArgs, session);
                if (toolResult.content[0]?.type === 'text') {
                  const resultText = toolResult.content[0].text;
                  if (!turn.toolCalls) {
                    turn.toolCalls = [];
                  }

                  // For Bedrock, we need to push multiple tool call results into the same user message (or it will complain), so we aggregate them here
                  // and push the message below (assuming any tool call results are present).
                  toolCallsResults.push({
                    toolResult: {
                      toolUseId: toolUseId,
                      content: [ { text: resultText } ]
                    }
                  })
      
                  // Record the function call and result
                  turn.toolCalls.push({
                    serverName: toolServerName,
                    toolName: toolToolName,
                    args: toolArgs,
                    output: resultText,
                    toolCallId: toolUseId,
                    elapsedTimeMs: toolResult.elapsedTimeMs,
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

        if (turn.message || turn.toolCalls) {
          modelReply.turns.push(turn);
        }

        // Break if no tool uses in this turn, or if there are pending tool calls (requiring approval)
        if (!hasToolUse || (modelReply.pendingToolCalls && modelReply.pendingToolCalls.length > 0)) break;
      }
      
      if (turnCount >= session.maxChatTurns) {
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