import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as log from 'electron-log';
import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { Agent, Logger } from 'agent-api';
import { ElectronLoggerAdapter } from '../logger-adapter';

// Electron-specific interface for window management
export interface WorkspaceWindow {
    windowId: string;
    workspacePath: string;
    browserWindow?: BrowserWindow;
}

export class WorkspacesManager extends EventEmitter {
    private windowIdToAgentMap = new Map<string, Agent>(); // Indexed by windowId
    private logger: Logger;

    private recentWorkspaces: string[];
    private lastActiveWorkspace: string | null;
    private readonly maxRecentWorkspaces = 10;
    private readonly workspacesPath: string;

    constructor(logger?: Logger) {
        super();
        this.logger = logger || new ElectronLoggerAdapter();
        this.recentWorkspaces = [];
        this.lastActiveWorkspace = null;
        this.workspacesPath = path.join(app.getPath('userData'), 'workspaces.json');
        this.logger.info(`Workspaces file path: ${this.workspacesPath}`);
    }

    public async initialize(): Promise<void> {
        await this.loadState();
        this.logger.info('WorkspacesManager initialized');
    }

    private async loadState(): Promise<void> {
        try {
            this.logger.info(`Checking if workspaces file exists at: ${this.workspacesPath}`);
            if (fs.existsSync(this.workspacesPath)) {
                this.logger.info(`Loading workspaces from: ${this.workspacesPath}`);
                const data = await fs.promises.readFile(this.workspacesPath, 'utf-8');
                const { recentWorkspaces, lastActiveWorkspace } = JSON.parse(data);
                this.recentWorkspaces = recentWorkspaces;
                this.lastActiveWorkspace = lastActiveWorkspace;
            } else {
                this.logger.info(`Workspaces file does not exist at: ${this.workspacesPath}`);
            }
        } catch (error) {
            this.logger.error('Failed to load recent workspaces:', error);
        }
    }

    private async saveState(): Promise<void> {
        try {
            this.logger.info(`Saving workspaces to: ${this.workspacesPath}`);
            const data = JSON.stringify({
                recentWorkspaces: this.recentWorkspaces,
                lastActiveWorkspace: this.lastActiveWorkspace
            }, null, 2);
            await fs.promises.writeFile(this.workspacesPath, data);
        } catch (error) {
            this.logger.error('Failed to save recent workspaces:', error);
        }
    }

    public getAgentForWindow(windowId: string): Agent | null {
        return this.windowIdToAgentMap.get(windowId) || null;
    }

    public getActiveWindows(): WorkspaceWindow[] {
        // Get all agents (get keys and values from map and map to WorkspaceWindow)
        const agents = Array.from(this.windowIdToAgentMap.entries()).map(([windowId, agent]) => ({
            windowId,
            workspacePath: agent.path
        }));
        return agents;
    }

    private async addRecentWorkspace(workspacePath: string): Promise<void> {
        // Remove if already exists
        this.recentWorkspaces = this.recentWorkspaces.filter(path => path !== workspacePath);
        // Add to front
        this.recentWorkspaces.unshift(workspacePath);
        // Trim to max size
        if (this.recentWorkspaces.length > this.maxRecentWorkspaces) {
            this.recentWorkspaces = this.recentWorkspaces.slice(0, this.maxRecentWorkspaces);
        }
        await this.saveState();
    }

    public getRecentWorkspaces(): string[] {
        return this.recentWorkspaces;
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
            
            // Update last active workspace
            this.lastActiveWorkspace = agent.path;
            
            // Add to recent workspaces
            await this.addRecentWorkspace(agent.path);
            
            // Save the state
            await this.saveState();
                        
            // Get the window
            const window = BrowserWindow.fromId(parseInt(windowId));
            if (window) {                
                // Send the event to all windows, but include targetWindowId to indicate which window should update its content
                this.logger.info(`[AGENT REGISTER] Sending workspace:switched event to all windows with targetWindowId ${windowId}`);
                BrowserWindow.getAllWindows().forEach(win => {
                    this.logger.info(`[AGENT REGISTER] Sending workspace:switched event to window ${win.id}`);
                    win.webContents.send('workspace:switched', { 
                        windowId, 
                        workspacePath: agent.path,
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
    public async switchWorkspace(windowId: string, newAgent: Agent | null): Promise<void> {
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
                this.logger.info(`[AGENT SWITCH] Sending workspace:switched event to all windows with targetWindowId ${windowId}`);
                BrowserWindow.getAllWindows().forEach(win => {
                    this.logger.info(`[AGENT SWITCH] Sending workspace:switched event to window ${win.id}`);
                    win.webContents.send('workspace:switched', {
                        windowId,
                        workspacePath: newAgent ? newAgent.path : null,
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