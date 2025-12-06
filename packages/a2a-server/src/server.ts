import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import * as path from 'path';

import { 
  AgentExecutor, 
  RequestContext, 
  ExecutionEventBus,
  DefaultRequestHandler,
  InMemoryTaskStore
} from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express';
import { AgentCard, Message } from '@a2a-js/sdk';
import { Agent } from '@tsagent/core';
import { loadAndInitializeAgent } from '@tsagent/core/runtime';

import { ConsoleLogger } from './logger.js';
import { Logger } from '@tsagent/core';

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
    
    // Create an autonomous chat session for this task (A2A always uses autonomous sessions)
    const chatSession = this.agent.createChatSession(contextId, { autonomous: true });
    
    // Handle the message
    const response = await chatSession.handleMessage(messageText);

    console.error('@tsagent/server response:', JSON.stringify(response, null, 2));

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
            .map((turn: any) => {
              if (turn.results) {
                return turn.results
                  .filter((result: any) => result.type === 'text')
                  .map((result: any) => result.text)
                  .join('');
              }
              return '';
            })
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

interface A2AServerInstance {
  agent: Agent;
  a2aApp: A2AExpressApp;
  pathSegment: string;
  agentCard: AgentCard;
}

export class MultiA2AServer {
  private expressApp: express.Application;
  private agents: Map<string, A2AServerInstance> = new Map();
  private port: number;
  private logger: ConsoleLogger;
  private isReady = false;
  private actualPort: number | null = null;
  private server: any = null;
  private isShuttingDown = false;

  constructor(port: number = 4000, logger?: Logger) {
    this.port = port;
    this.logger = logger ?? new ConsoleLogger();
    this.expressApp = express();
    this.setupGlobalMiddleware();
    this.setupDiscoveryEndpoint();
  }

  private setupGlobalMiddleware(): void {
    this.expressApp.use(express.json());
    this.expressApp.use(express.urlencoded({ extended: true }));
  }

  private setupDiscoveryEndpoint(): void {
    this.expressApp.get('/agents', (req, res) => {
      const agentsList = Array.from(this.agents.entries()).map(([pathSegment, instance]) => ({
        id: pathSegment,
        name: instance.agent.name,
        description: instance.agent.getMetadata()?.description || instance.agent.description,
        path: `/agents/${pathSegment}`,
        url: `http://localhost:${this.port}/agents/${pathSegment}`,
        agentCard: `http://localhost:${this.port}/agents/${pathSegment}/.well-known/agent-card.json`
      }));
      
      res.json({
        agents: agentsList,
        count: agentsList.length
      });
    });
  }

  private generatePathSegment(agentPath: string, agentName: string): string {
    // Create a deterministic path segment based on the agent path
    // This ensures the same agent always gets the same URL path
    const normalizedPath = path.normalize(agentPath);
    const pathHash = crypto.createHash('md5').update(normalizedPath).digest('hex').substring(0, 8);
    
    // Use agent name if it's simple, otherwise use the hash
    const sanitizedName = this.sanitizePathSegment(agentName);
    if (sanitizedName && sanitizedName.length > 0 && sanitizedName !== '-') {
      return this.findUniquePathSegment(sanitizedName, agentPath);
    }
    
    // Fallback to hash-based segment
    return this.findUniquePathSegment(`agent-${pathHash}`, agentPath);
  }

  private findUniquePathSegment(baseSegment: string, agentPath: string): string {
    // First try the base segment
    if (!this.agents.has(baseSegment)) {
      return baseSegment;
    }

    // If there's a conflict, try appending numbers
    for (let i = 1; i <= 999; i++) {
      const candidateSegment = `${baseSegment}-${i}`;
      if (!this.agents.has(candidateSegment)) {
        this.logger.warn(`Agent name conflict detected. Using "${candidateSegment}" for agent at "${agentPath}"`);
        return candidateSegment;
      }
    }

    // If we still can't find a unique segment after 999 attempts, fall back to hash
    const normalizedPath = path.normalize(agentPath);
    const pathHash = crypto.createHash('md5').update(normalizedPath).digest('hex').substring(0, 8);
    const fallbackSegment = `agent-${pathHash}`;
    
    this.logger.warn(`Unable to find unique path segment after 999 attempts. Using hash-based fallback "${fallbackSegment}" for agent at "${agentPath}"`);
    return fallbackSegment;
  }

  private sanitizePathSegment(agentId: string): string {
    // Convert to URL-safe format: lowercase, replace spaces/special chars with hyphens
    return agentId
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private getAgentSkills(agent: Agent): any[] {
    const agentMetadata = agent.getMetadata();
    // Use agent skills from metadata if available, otherwise use default chat skill
    if (agentMetadata?.skills && Array.isArray(agentMetadata.skills) && agentMetadata.skills.length > 0) {
      // Map agent skills to A2A protocol format
      return agentMetadata.skills.map((skill: any) => ({
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

  private updateAgentCardUrls(actualPort: number): void {
    for (const [pathSegment, instance] of this.agents.entries()) {
      // Update the agent card URL with the actual port
      instance.agentCard.url = `http://localhost:${actualPort}/agents/${pathSegment}`;
    }
  }

  private async createA2AInstance(agent: Agent, pathSegment: string): Promise<A2AServerInstance> {
    const agentMetadata = agent.getMetadata();
    
    // Create agent card with updated URL
    const agentCard: AgentCard = {
      name: agent.name,
      description: agentMetadata?.description || agent.description || 'Agent powered by @tsagent/core',
      version: agentMetadata?.version || '1.0.0',
      protocolVersion: '1.0.0',
      url: `http://localhost:${this.port}/agents/${pathSegment}`,
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['text/plain'],
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      skills: this.getAgentSkills(agent)
    };

    // Add optional fields if they exist in metadata
    if (agentMetadata?.iconUrl) {
      agentCard.iconUrl = agentMetadata.iconUrl;
    }
    if (agentMetadata?.documentationUrl) {
      agentCard.documentationUrl = agentMetadata.documentationUrl;
    }
    if (agentMetadata?.provider) {
      agentCard.provider = agentMetadata.provider;
    }

    // Create executor and task store
    const executor = new SimpleAgentExecutor(agent, this.logger);
    const taskStore = new InMemoryTaskStore();
    const requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);
    const a2aApp = new A2AExpressApp(requestHandler);

    return { agent, a2aApp, pathSegment, agentCard };
  }

  private mountAgentRoutes(pathSegment: string, instance: A2AServerInstance): void {
    // Create a sub-app for this agent (A2A SDK expects Express app, not router)
    const agentApp = express();
    
    // Set up A2A routes on the sub-app
    instance.a2aApp.setupRoutes(agentApp);
    
    // Mount the sub-app on the main app
    this.expressApp.use(`/agents/${pathSegment}`, agentApp);
  }

  public async registerAgent(agentPath: string): Promise<void> {
    try {
      this.logger.info(`Loading agent from: ${agentPath}`);
      const agent = await loadAndInitializeAgent(agentPath, this.logger);
      this.logger.info(`Agent loaded successfully: ${agent.name}`);
      
      // Generate deterministic path segment based on agent path and name
      // This method handles conflicts automatically by appending numbers
      const pathSegment = this.generatePathSegment(agentPath, agent.name);
      
      // Create A2A server instance
      const a2aInstance = await this.createA2AInstance(agent, pathSegment);
      
      // Mount routes on /agents/{pathSegment}
      this.mountAgentRoutes(pathSegment, a2aInstance);
      
      // Store in agents Map
      this.agents.set(pathSegment, a2aInstance);
      
      this.logger.info(`Registered agent "${agent.name}" at /agents/${pathSegment}`);
    } catch (error) {
      this.logger.error(`Failed to register agent from ${agentPath}:`, error);
      throw error;
    }
  }

  public async start(): Promise<{ port: number; discoveryUrl: string; agents: Array<{ id: string; name: string; baseUrl: string }> }> {
    if (this.agents.size === 0) {
      throw new Error('No agents registered. Call registerAgent() at least once before starting the server.');
    }

    return new Promise((resolve, reject) => {
      this.server = this.expressApp.listen(this.port, () => {
        // Get the actual port (in case port 0 was used for dynamic assignment)
        const actualPort = (this.server.address() as any)?.port || this.port;
        this.actualPort = actualPort;
        
        // Update agent card URLs with the actual port
        this.updateAgentCardUrls(actualPort);
        
        const discoveryUrl = `http://localhost:${actualPort}/agents`;
        const agents = Array.from(this.agents.entries()).map(([pathSegment, instance]) => ({
          id: pathSegment,
          name: instance.agent.name,
          baseUrl: `http://localhost:${actualPort}/agents/${pathSegment}`
        }));

        this.logger.info(`@tsagent/server (multi) running on port ${actualPort}`);
        this.logger.info(`Discovery endpoint: ${discoveryUrl}`);
        
        // Log all registered agents
        for (const agent of agents) {
          this.logger.info(`Agent "${agent.name}" available at: ${agent.baseUrl}`);
          this.logger.info(`Agent card: ${agent.baseUrl}/.well-known/agent-card.json`);
        }
        
        resolve({ port: actualPort, discoveryUrl, agents });
      });

      this.server.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  public getAgents(): Map<string, A2AServerInstance> {
    return this.agents;
  }

  public getUrls(): { port: number; discoveryUrl: string; agents: Array<{ id: string; name: string; baseUrl: string }> } | null {
    if (!this.actualPort) {
      return null;
    }
    
    const discoveryUrl = `http://localhost:${this.actualPort}/agents`;
    const agents = Array.from(this.agents.entries()).map(([pathSegment, instance]) => ({
      id: pathSegment,
      name: instance.agent.name,
      baseUrl: `http://localhost:${this.actualPort}/agents/${pathSegment}`
    }));

    return { port: this.actualPort, discoveryUrl, agents };
  }

  public async shutdown(): Promise<void> {
    // Check if already shutting down or not running
    if (this.isShuttingDown) {
      this.logger.warn('Server is already shutting down, ignoring duplicate shutdown request');
      return;
    }
    
    if (!this.server) {
      this.logger.warn('Server is not running, nothing to shutdown');
      return;
    }

    // Set shutdown flag immediately to prevent race conditions
    this.isShuttingDown = true;

    return new Promise((resolve) => {
      this.logger.info('Shutting down @tsagent/server (multi)...');
      
      this.server.close(() => {
        this.logger.info('@tsagent/server (multi) shutdown complete');
        this.server = null;
        this.actualPort = null;
        this.isShuttingDown = false; // Reset flag for potential restart
        resolve();
      });
    });
  }
}

export class A2AServer {
  private app!: A2AExpressApp;
  private agent!: Agent;
  private agentMetadata: any = null;
  private logger: ConsoleLogger;
  private isReady = false;
  private actualPort: number | null = null;
  private server: any = null;
  private isShuttingDown = false;
  private agentCard!: AgentCard;

  constructor(agentPath: string, private port: number = 4000, logger?: Logger) {
    this.logger = logger ?? new ConsoleLogger();
    this.initialize(agentPath);
  }

  private async initialize(agentPath: string): Promise<void> {
    try {
      this.logger.info(`Loading agent from: ${agentPath}`);
      this.agent = await loadAndInitializeAgent(agentPath, this.logger);
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
    this.agentCard = {
      name: this.agent.name,
      description: this.agentMetadata?.description || this.agent.description || 'Agent powered by @tsagent/core',
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
      this.agentCard.iconUrl = this.agentMetadata.iconUrl;
    }
    if (this.agentMetadata?.documentationUrl) {
      this.agentCard.documentationUrl = this.agentMetadata.documentationUrl;
    }
    if (this.agentMetadata?.provider) {
      this.agentCard.provider = this.agentMetadata.provider;
    }

    // Create executor and task store
    const executor = new SimpleAgentExecutor(this.agent, this.logger);
    const taskStore = new InMemoryTaskStore();

    // Create request handler
    const requestHandler = new DefaultRequestHandler(this.agentCard, taskStore, executor);

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

  public async start(): Promise<{ port: number; baseUrl: string }> {
    // Wait for initialization to complete
    while (!this.isReady) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Create Express app and set up A2A routes
    const expressApp = express();

    // Set up A2A routes
    this.app.setupRoutes(expressApp);

    return new Promise((resolve, reject) => {
      this.server = expressApp.listen(this.port, () => {
        // Get the actual port (in case port 0 was used for dynamic assignment)
        const actualPort = (this.server.address() as any)?.port || this.port;
        this.actualPort = actualPort;
        
        // Update agent card URL with the actual port
        this.agentCard.url = `http://localhost:${actualPort}`;
        
        const baseUrl = `http://localhost:${actualPort}`;

        this.logger.info(`@tsagent/server (single) running on port ${actualPort}`);
        this.logger.info(`Base URL: ${baseUrl}`);
        this.logger.info(`Agent card: ${baseUrl}/.well-known/agent-card.json`);
        
        resolve({ port: actualPort, baseUrl });
      });

      this.server.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  public getUrls(): { port: number; baseUrl: string } | null {
    if (!this.actualPort) {
      return null;
    }
    
    return {
      port: this.actualPort,
      baseUrl: `http://localhost:${this.actualPort}`
    };
  }

  public async shutdown(): Promise<void> {
    // Check if already shutting down or not running
    if (this.isShuttingDown) {
      this.logger.warn('Server is already shutting down, ignoring duplicate shutdown request');
      return;
    }
    
    if (!this.server) {
      this.logger.warn('Server is not running, nothing to shutdown');
      return;
    }

    // Set shutdown flag immediately to prevent race conditions
    this.isShuttingDown = true;

    return new Promise((resolve) => {
      this.logger.info('Shutting down @tsagent/server (single)...');
      
      this.server.close(() => {
        this.logger.info('@tsagent/server (single) shutdown complete');
        this.server = null;
        this.actualPort = null;
        this.isShuttingDown = false; // Reset flag for potential restart
        resolve();
      });
    });
  }
}

export default A2AServer;