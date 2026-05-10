import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatBedrockConverse } from '@langchain/aws';
import { z } from 'zod';
import { BedrockRuntimeClient, ConverseCommand, ConverseCommandInput, Message, Tool as BedrockTool, ConversationRole, ConverseCommandOutput, ContentBlock } from '@aws-sdk/client-bedrock-runtime';
import { BedrockClient, ListFoundationModelsCommand, ListInferenceProfilesCommand, ListProvisionedModelThroughputsCommand } from '@aws-sdk/client-bedrock';

import { ProviderModel, ProviderId, ProviderInfo, Provider } from './types.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';
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

const DEFAULT_BEDROCK_REGION = 'us-east-1';

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

  protected async buildChatModel(
    _agent: Agent,
    _logger: Logger,
    finalConfig: Record<string, string>,
    modelName: string
  ): Promise<BaseChatModel> {
    const typedConfig = finalConfig as BedrockConfig;
    const accessKeyId = typedConfig.AWS_ACCESS_KEY_ID;
    const secretAccessKey = typedConfig.AWS_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for Bedrock');
    }
    return new ChatBedrockConverse({
      model: modelName,
      region: process.env.AWS_REGION || DEFAULT_BEDROCK_REGION,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
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
}