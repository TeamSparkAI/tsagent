import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { Agent, Logger } from '@tsagent/core';
import { ElectronLoggerAdapter } from './logger-adapter';

// Electron-specific interface for window management
export interface AgentWindow {
    windowId: string;
    agentPath: string;
    browserWindow?: BrowserWindow;
}

export class AgentsManager extends EventEmitter {
    private windowIdToAgentMap = new Map<string, Agent>(); // Indexed by windowId
    private logger: Logger;

    private recentAgents: string[];
    private lastActiveAgent: string | null;
    private readonly maxRecentAgents = 10;
    private readonly agentsPath: string;

    constructor(logger?: Logger) {
        super();
        this.logger = logger || new ElectronLoggerAdapter();
        this.recentAgents = [];
        this.lastActiveAgent = null;
        this.agentsPath = path.join(app.getPath('userData'), 'agents.json');
        this.logger.info(`Agents file path: ${this.agentsPath}`);
    }

    public async initialize(): Promise<void> {
        await this.loadState();
        this.logger.info('AgentsManager initialized');
    }

    private async loadState(): Promise<void> {
        try {
            this.logger.info(`Checking if agents file exists at: ${this.agentsPath}`);
            if (fs.existsSync(this.agentsPath)) {
                this.logger.info(`Loading agents from: ${this.agentsPath}`);
                const data = await fs.promises.readFile(this.agentsPath, 'utf-8');
                const { recentAgents, lastActiveAgent } = JSON.parse(data);
                this.recentAgents = recentAgents || [];
                this.lastActiveAgent = lastActiveAgent || null;
            } else {
                this.logger.info(`Agents file does not exist at: ${this.agentsPath}`);
            }
        } catch (error) {
            this.logger.error('Failed to load recent agents:', error);
        }
    }

    private async saveState(): Promise<void> {
        try {
            this.logger.info(`Saving agents to: ${this.agentsPath}`);
            const data = JSON.stringify({
                recentAgents: this.recentAgents,
                lastActiveAgent: this.lastActiveAgent
            }, null, 2);
            await fs.promises.writeFile(this.agentsPath, data);
        } catch (error) {
            this.logger.error('Failed to save recent agents:', error);
        }
    }

    public getAgentForWindow(windowId: string): Agent | null {
        return this.windowIdToAgentMap.get(windowId) || null;
    }

    public getActiveWindows(): AgentWindow[] {
        // Get all agents (get keys and values from map and map to AgentWindow)
        const agents = Array.from(this.windowIdToAgentMap.entries()).map(([windowId, agent]) => ({
            windowId,
            agentPath: agent.path
        }));
        return agents;
    }

    private async addRecentAgent(agentPath: string): Promise<void> {
        // Remove if already exists
        this.recentAgents = this.recentAgents.filter(path => path !== agentPath);
        // Add to front
        this.recentAgents.unshift(agentPath);
        // Trim to max size
        if (this.recentAgents.length > this.maxRecentAgents) {
            this.recentAgents = this.recentAgents.slice(0, this.maxRecentAgents);
        }
        await this.saveState();
    }

    public getRecentAgents(): string[] {
        return this.recentAgents;
    }

    /**
     * Registers a window with an agent
     * @param windowId The ID of the window
     * @param agent The agent to register
     */
    public async registerWindow(windowId: string, agent: Agent): Promise<void> {
        try {
            this.logger.info(`[AGENT REGISTER] Registering window ${windowId} with agent ${agent.path}`);

            const currentAgent = this.windowIdToAgentMap.get(windowId);
            if (currentAgent) {
                this.logger.info(`[AGENT REGISTER] Window ${windowId} is already registered with agent ${currentAgent.path}`);

                // If the window is already registered with this agent, do nothing
                if (currentAgent === agent) {
                    this.logger.info(`[AGENT REGISTER] Window ${windowId} is already registered with agent ${agent.path}, no action needed`);
                    return;
                }
                
                // If the window is registered with a different agent, unregister it first
                this.logger.info(`[AGENT REGISTER] Window ${windowId} is registered with a different agent, unregistering first`);
                this.unregisterWindow(windowId);        
            }
                                    
            // Add the window to the active windows map
            this.windowIdToAgentMap.set(windowId, agent);
            
            // Update last active agent
            this.lastActiveAgent = agent.path;
            
            // Add to recent agents
            await this.addRecentAgent(agent.path);
            
            // Save the state
            await this.saveState();
                        
            // Get the window
            const window = BrowserWindow.fromId(parseInt(windowId));
            if (window) {                
                // Send the event to all windows, but include targetWindowId to indicate which window should update its content
                this.logger.info(`[AGENT REGISTER] Sending agent:switched event to all windows with targetWindowId ${windowId}`);
                BrowserWindow.getAllWindows().forEach(win => {
                    this.logger.info(`[AGENT REGISTER] Sending agent:switched event to window ${win.id}`);
                    win.webContents.send('agent:switched', { 
                        windowId, 
                        agentPath: agent.path,
                        targetWindowId: windowId // This indicates which window should update its content
                    });
                });
                // Note: Agent doesn't have initializeListeners method, we'll handle this differently
            }
            
            this.logger.info(`[AGENT REGISTER] Window ${windowId} registered with agent ${agent.path}`);
        } catch (error) {
            this.logger.error(`[AGENT REGISTER] Error registering window ${windowId} with agent ${agent.path}:`, error);
            throw error;
        }
    }
    
    private unregisterWindow(windowId: string): void {
        const agent = this.windowIdToAgentMap.get(windowId);
        if (agent) {
            // Note: Agent doesn't have uninitializeListeners method, we'll handle this differently
            this.windowIdToAgentMap.delete(windowId);
            this.logger.info(`Unregistered window ${windowId}`);
        }
    }
        
    /**
     * Tracks agent switch and notifies all windows
     * @param windowId The ID of the window
     * @param newAgent The agent to switch to, or null for no agent
     */
    public async switchAgent(windowId: string, newAgent: Agent | null): Promise<void> {
        try {
            const currentAgent = this.windowIdToAgentMap.get(windowId);
            if (currentAgent) {
                this.logger.info(`[AGENT SWITCH] Unregistering window ${windowId} from agent ${currentAgent.path}`);
                this.unregisterWindow(windowId);
            }

            if (newAgent) {
                this.logger.info(`[AGENT SWITCH] Starting agent switch for window ${windowId} to agent ${newAgent.path}`);
                await this.registerWindow(windowId, newAgent);
            } else {
                this.logger.info(`[AGENT SWITCH] Starting agent switch for window ${windowId} to no agent`);
            }

            // Get the window
            const browserWindow = BrowserWindow.fromId(parseInt(windowId));
            if (browserWindow) {
                // Send the event to all windows, but include targetWindowId to indicate which window should update its content
                this.logger.info(`[AGENT SWITCH] Sending agent:switched event to all windows with targetWindowId ${windowId}`);
                BrowserWindow.getAllWindows().forEach(win => {
                    this.logger.info(`[AGENT SWITCH] Sending agent:switched event to window ${win.id}`);
                    win.webContents.send('agent:switched', {
                        windowId,
                        agentPath: newAgent ? newAgent.path : null,
                        targetWindowId: windowId // This indicates which window should update its content
                    });
                });
            } else {
                this.logger.warn(`[AGENT SWITCH] Could not find browser window with ID ${windowId}`);
            }
        } catch (error) {
            this.logger.error(`[AGENT SWITCH] Error switching window ${windowId} to agent ${newAgent ? newAgent.path : "no agent"}:`, error);
            throw error;
        }
    }
} 