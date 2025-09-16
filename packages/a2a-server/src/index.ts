import { 
  AgentExecutor, 
  RequestContext, 
  ExecutionEventBus,
  DefaultRequestHandler,
  InMemoryTaskStore
} from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express';
import { AgentCard, Message } from '@a2a-js/sdk';
import { Agent } from 'agent-api';
import { loadAgent } from 'agent-api/runtime';
import { ConsoleLogger } from './logger';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';

export class SimpleAgentExecutor implements AgentExecutor {
  constructor(private agent: Agent, private logger: ConsoleLogger) {}

  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    const { contextId, userMessage } = requestContext;

    // Extract text content from the user message
    const messageText = userMessage.parts
      .filter((part: any) => part.kind === 'text')
      .map((part: any) => part.text)
      .join(' ');
    
    // Create a chat session for this task
    const chatSession = this.agent.createChatSession(contextId);
    
    // Handle the message
    const response = await chatSession.handleMessage(messageText);

    console.error('A2A Server response:', JSON.stringify(response, null, 2));

    /* Response example:
    {
      "updates": [
        {
          "role": "user",
          "content": "how much can bob bench"
        },
        {
          "role": "assistant",
          "modelReply": {
            "timestamp": 1757972459352,
            "turns": [
              {
                "inputTokens": 1910,
                "outputTokens": 41,
                "message": "Alright chief, let's see how much Bob can bench. Unfortunately, I don't have any information about Bob's bench press capabilities. Is there anything else I can help you with?\n"
              }
            ]
          }
        }
      ],
      "lastSyncId": 1,
      "references": [],
      "rules": []
    }
    */

    // Extract assistant response
    const assistantResponse = response.updates
      .filter((update: any) => update.role === 'assistant')
      .map((update: any) => {
        if (update.modelReply?.turns) {
          return update.modelReply.turns
            .map((turn: any) => turn.message || '')
            .join('');
        }
        return '';
      })
      .join('\n');

    // Create a direct message response
    const responseMessage: Message = {
      kind: "message",
      messageId: uuidv4(),
      role: "agent",
      parts: [{ kind: "text", text: assistantResponse }],
      contextId: contextId,
    };

    // Publish the message and signal that the interaction is finished
    eventBus.publish(responseMessage);
    eventBus.finished();
  }

  // cancelTask is not needed for this simple, non-stateful agent
  cancelTask = async (): Promise<void> => {};
}

export class A2AServer {
  private app!: A2AExpressApp;
  private agent!: Agent;
  private agentMetadata: any = null;
  private logger: ConsoleLogger;
  private isReady = false;

  constructor(agentPath: string, private port: number = 4000) {
    this.logger = new ConsoleLogger();
    this.initialize(agentPath);
  }

  private async initialize(agentPath: string): Promise<void> {
    try {
      this.logger.info(`Loading agent from: ${agentPath}`);
      this.agent = await loadAgent(agentPath, this.logger);
      this.logger.info(`Agent loaded successfully: ${this.agent.name}`);
      
      // Load agent metadata
      try {
        this.agentMetadata = this.agent.getMetadata();
        this.logger.info(`Agent metadata loaded:`, this.agentMetadata);
      } catch (metadataError) {
        this.logger.warn(`Failed to load agent metadata, using defaults:`, metadataError);
        this.agentMetadata = null;
      }
      
      this.setupApp();
      this.isReady = true;
    } catch (error) {
      this.logger.error(`Failed to load agent from ${agentPath}:`, error);
      throw error;
    }
  }

  private setupApp(): void {
    // Create agent card using metadata when available
    const agentCard: AgentCard = {
      name: this.agent.name,
      description: this.agentMetadata?.description || this.agent.description || 'Agent powered by agent-api',
      version: this.agentMetadata?.version || '1.0.0',
      protocolVersion: '1.0.0',
      url: `http://localhost:${this.port}`,
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['text/plain'],
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      skills: this.getAgentSkills()
    };

    // Add optional fields if they exist in metadata
    if (this.agentMetadata?.iconUrl) {
      agentCard.iconUrl = this.agentMetadata.iconUrl;
    }
    if (this.agentMetadata?.documentationUrl) {
      agentCard.documentationUrl = this.agentMetadata.documentationUrl;
    }
    if (this.agentMetadata?.provider) {
      agentCard.provider = this.agentMetadata.provider;
    }

    // Create executor and task store
    const executor = new SimpleAgentExecutor(this.agent, this.logger);
    const taskStore = new InMemoryTaskStore();

    // Create request handler
    const requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);

    // Create A2A Express app
    this.app = new A2AExpressApp(requestHandler);
  }

  private getAgentSkills(): any[] {
    // Use agent skills from metadata if available, otherwise use default chat skill
    if (this.agentMetadata?.skills && Array.isArray(this.agentMetadata.skills) && this.agentMetadata.skills.length > 0) {
      // Map agent skills to A2A protocol format
      return this.agentMetadata.skills.map((skill: any) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        inputModes: ['text/plain'],
        outputModes: ['text/plain'],
        tags: skill.tags || [],
        examples: skill.examples || []
      }));
    } else {
      // Default chat skill
      return [{
        id: 'chat',
        name: 'chat',
        description: 'General conversation and assistance',
        inputModes: ['text/plain'],
        outputModes: ['text/plain'],
        tags: ['conversation', 'assistance']
      }];
    }
  }

  public getApp(): A2AExpressApp {
    return this.app;
  }

  public async start(): Promise<void> {
    // Wait for initialization to complete
    while (!this.isReady) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Create Express app and set up A2A routes
    const expressApp = express();

    // Set up A2A routes
    this.app.setupRoutes(expressApp);

    expressApp.listen(this.port, () => {
      this.logger.info(`A2A Server running on port ${this.port}`);
      this.logger.info(`Agent card: http://localhost:${this.port}/.well-known/agent-card.json`);
    });
  }
}

export default A2AServer;