import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as log from 'electron-log';
import { WorkspaceWindow, WorkspaceConfig } from '../../shared/workspace';
import { ConfigManager } from './ConfigManager';
import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';

export class WorkspacesManager extends EventEmitter {
    private activeWindows: Map<string, WorkspaceWindow>;
    private recentWorkspaces: string[];
    private lastActiveWorkspace: string | null;
    private readonly maxRecentWorkspaces = 10;
    private readonly recentWorkspacesPath: string;

    constructor() {
        super();
        this.activeWindows = new Map();
        this.recentWorkspaces = [];
        this.lastActiveWorkspace = null;
        this.recentWorkspacesPath = path.join(app.getPath('userData'), 'workspaces.json');
        log.info(`Workspaces file path: ${this.recentWorkspacesPath}`);
    }

    public async initialize(): Promise<void> {
        await this.loadRecentWorkspaces();
        log.info('WorkspaceManager initialized');
    }

    private async loadRecentWorkspaces(): Promise<void> {
        try {
            log.info(`Checking if workspaces file exists at: ${this.recentWorkspacesPath}`);
            if (fs.existsSync(this.recentWorkspacesPath)) {
                log.info(`Loading workspaces from: ${this.recentWorkspacesPath}`);
                const data = await fs.promises.readFile(this.recentWorkspacesPath, 'utf-8');
                const { recentWorkspaces, lastActiveWorkspace } = JSON.parse(data);
                this.recentWorkspaces = recentWorkspaces;
                this.lastActiveWorkspace = lastActiveWorkspace;
            } else {
                log.info(`Workspaces file does not exist at: ${this.recentWorkspacesPath}`);
            }
        } catch (error) {
            log.error('Failed to load recent workspaces:', error);
        }
    }

    private async saveRecentWorkspaces(): Promise<void> {
        try {
            log.info(`Saving workspaces to: ${this.recentWorkspacesPath}`);
            const data = JSON.stringify({
                recentWorkspaces: this.recentWorkspaces,
                lastActiveWorkspace: this.lastActiveWorkspace
            }, null, 2);
            await fs.promises.writeFile(this.recentWorkspacesPath, data);
        } catch (error) {
            log.error('Failed to save recent workspaces:', error);
        }
    }

    /**
     * Registers a window with a workspace
     * @param windowId The ID of the window
     * @param workspacePath The path to the workspace
     */
    public async registerWindow(windowId: string, workspacePath: string): Promise<void> {
        try {
            log.info(`[WORKSPACE REGISTER] Registering window ${windowId} with workspace ${workspacePath}`);
            
            // Check if the window is already registered with a workspace
            const existingWindow = this.activeWindows.get(windowId);
            if (existingWindow) {
                log.info(`[WORKSPACE REGISTER] Window ${windowId} is already registered with workspace ${existingWindow.workspacePath}`);
                
                // If the window is already registered with this workspace, do nothing
                if (existingWindow.workspacePath === workspacePath) {
                    log.info(`[WORKSPACE REGISTER] Window ${windowId} is already registered with workspace ${workspacePath}, no action needed`);
                    return;
                }
                
                // If the window is registered with a different workspace, unregister it first
                log.info(`[WORKSPACE REGISTER] Window ${windowId} is registered with a different workspace, unregistering first`);
                this.unregisterWindow(windowId);
            }
                        
            // Add the window to the active windows map with only essential properties
            this.activeWindows.set(windowId, {
                windowId,
                workspacePath
            });
            
            // Update last active workspace
            this.lastActiveWorkspace = workspacePath;
            
            // Add to recent workspaces
            this.addRecentWorkspace(workspacePath);
            
            // Save the state
            await this.saveState();
                        
            // Get the window
            const window = BrowserWindow.fromId(parseInt(windowId));
            if (window) {
                // Notify the renderer process that configuration has changed
                window.webContents.send('configuration:changed');
                
                // Emit the workspace:switched event with the workspace path
                log.info(`[WORKSPACE REGISTER] Emitting workspace:switched event for window ${windowId} with workspace ${workspacePath}`);
                this.emit('workspace:switched', { windowId, workspacePath });
                
                // Send the event to all windows, but include targetWindowId to indicate which window should update its content
                log.info(`[WORKSPACE REGISTER] Sending workspace:switched event to all windows with targetWindowId ${windowId}`);
                BrowserWindow.getAllWindows().forEach(win => {
                    log.info(`[WORKSPACE REGISTER] Sending workspace:switched event to window ${win.id}`);
                    win.webContents.send('workspace:switched', { 
                        windowId, 
                        workspacePath,
                        targetWindowId: windowId // This indicates which window should update its content
                    });
                });
            }
            
            log.info(`[WORKSPACE REGISTER] Window ${windowId} registered with workspace ${workspacePath}`);
        } catch (error) {
            log.error(`[WORKSPACE REGISTER] Error registering window ${windowId} with workspace ${workspacePath}:`, error);
            throw error;
        }
    }

    public unregisterWindow(windowId: string): void {
        this.activeWindows.delete(windowId);
        log.info(`Unregistered window ${windowId}`);
    }

    public updateWindowState(windowId: string): void {
        const window = this.activeWindows.get(windowId);
        if (window) {
            const browserWindow = BrowserWindow.fromId(parseInt(windowId));
            if (browserWindow && browserWindow.isFocused()) {
                this.lastActiveWorkspace = window.workspacePath;
                this.saveRecentWorkspaces();
            }
        }
    }

    public isWorkspaceInUse(workspacePath: string): boolean {
        return Array.from(this.activeWindows.values()).some(window => 
            window.workspacePath === workspacePath
        );
    }

    public getLastActiveWorkspace(): string | null {
        return this.lastActiveWorkspace;
    }

    public getActiveWindows(): WorkspaceWindow[] {
        return Array.from(this.activeWindows.values());
    }

    public addRecentWorkspace(workspacePath: string): void {
        // Remove if already exists
        this.recentWorkspaces = this.recentWorkspaces.filter(path => path !== workspacePath);
        // Add to front
        this.recentWorkspaces.unshift(workspacePath);
        // Trim to max size
        if (this.recentWorkspaces.length > this.maxRecentWorkspaces) {
            this.recentWorkspaces = this.recentWorkspaces.slice(0, this.maxRecentWorkspaces);
        }
        this.saveRecentWorkspaces();
    }

    public getRecentWorkspaces(): string[] {
        return this.recentWorkspaces;
    }

    public async ensureInitialized(): Promise<void> {
        // This method can be called to ensure data is loaded
        await this.initialize();
    }

    /**
     * Saves the current state of the WorkspaceManager
     */
    private async saveState(): Promise<void> {
        try {
            log.info('Saving WorkspaceManager state');
            
            // Save recent workspaces
            await this.saveRecentWorkspaces();
            
            log.info('WorkspaceManager state saved successfully');
        } catch (error) {
            log.error('Error saving WorkspaceManager state:', error);
        }
    }

    /**
     * Switches a window to a different workspace
     * @param windowId The ID of the window
     * @param workspacePath The path to the workspace
     */
    // When we change the workspace in a window, we need to do two things:
    // 1. Update the workspace for thw window that is getting the new workspace, and trigger UX refresh to reflect the new workspace
    // 2. Update all other windows so they can update their Workspace tab to reflect the new workspace in the window, recents, etc.
    //
    public async switchWorkspace(windowId: string, workspacePath: string): Promise<void> {
        try {
            log.info(`[WORKSPACE SWITCH] Starting workspace switch for window ${windowId} to workspace ${workspacePath}`);
            
            // Update the window's workspace
            const window = this.activeWindows.get(windowId);
            if (!window) {
                log.error(`[WORKSPACE SWITCH] No window found with ID: ${windowId}`);
                throw new Error(`No window found with ID: ${windowId}`);
            }
            
            // Update the workspace path
            window.workspacePath = workspacePath;
            
            // Update last active workspace
            this.lastActiveWorkspace = workspacePath;
            
            // Add to recent workspaces
            this.addRecentWorkspace(workspacePath);
            
            // Save the state
            await this.saveState();
            
            // Get the window
            const browserWindow = BrowserWindow.fromId(parseInt(windowId));
            if (browserWindow) {
                // Notify the renderer process that configuration has changed
                browserWindow.webContents.send('configuration:changed');
                
                // Send the event to all windows, but include targetWindowId to indicate which window should update its content
                log.info(`[WORKSPACE SWITCH] Sending workspace:switched event to all windows with targetWindowId ${windowId}`);
                BrowserWindow.getAllWindows().forEach(win => {
                    log.info(`[WORKSPACE SWITCH] Sending workspace:switched event to window ${win.id}`);
                    win.webContents.send('workspace:switched', {
                        windowId,
                        workspacePath,
                        targetWindowId: windowId // This indicates which window should update its content
                    });
                });
                
                // Also emit the event for main process listeners
                log.info(`[WORKSPACE SWITCH] Emitting workspace:switched event for main process listeners`);
                this.emit('workspace:switched', { windowId, workspacePath });
            } else {
                log.warn(`[WORKSPACE SWITCH] Could not find browser window with ID ${windowId}`);
            }
        } catch (error) {
            log.error(`[WORKSPACE SWITCH] Error switching window ${windowId} to workspace ${workspacePath}:`, error);
            throw error;
        }
    }
} 