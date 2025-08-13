import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as log from 'electron-log';
import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { WorkspaceManager } from './WorkspaceManager';

// Electron-specific interface for window management
export interface WorkspaceWindow {
    windowId: string;
    workspacePath: string;
    browserWindow?: BrowserWindow;
}

export class WorkspacesManager extends EventEmitter {
    private windowIdToWorkspaceMap = new Map<string, WorkspaceManager>(); // Indexed by windowId

    private recentWorkspaces: string[];
    private lastActiveWorkspace: string | null;
    private readonly maxRecentWorkspaces = 10;
    private readonly workspacesPath: string;

    constructor() {
        super();
        this.recentWorkspaces = [];
        this.lastActiveWorkspace = null;
        this.workspacesPath = path.join(app.getPath('userData'), 'workspaces.json');
        log.info(`Workspaces file path: ${this.workspacesPath}`);
    }

    public async initialize(): Promise<void> {
        await this.loadState();
        log.info('WorkspaceManager initialized');
    }

    private async loadState(): Promise<void> {
        try {
            log.info(`Checking if workspaces file exists at: ${this.workspacesPath}`);
            if (fs.existsSync(this.workspacesPath)) {
                log.info(`Loading workspaces from: ${this.workspacesPath}`);
                const data = await fs.promises.readFile(this.workspacesPath, 'utf-8');
                const { recentWorkspaces, lastActiveWorkspace } = JSON.parse(data);
                this.recentWorkspaces = recentWorkspaces;
                this.lastActiveWorkspace = lastActiveWorkspace;
            } else {
                log.info(`Workspaces file does not exist at: ${this.workspacesPath}`);
            }
        } catch (error) {
            log.error('Failed to load recent workspaces:', error);
        }
    }

    private async saveState(): Promise<void> {
        try {
            log.info(`Saving workspaces to: ${this.workspacesPath}`);
            const data = JSON.stringify({
                recentWorkspaces: this.recentWorkspaces,
                lastActiveWorkspace: this.lastActiveWorkspace
            }, null, 2);
            await fs.promises.writeFile(this.workspacesPath, data);
        } catch (error) {
            log.error('Failed to save recent workspaces:', error);
        }
    }

    public getWorkspaceForWindow(windowId: string): WorkspaceManager | null {
        return this.windowIdToWorkspaceMap.get(windowId) || null;
    }

    public getActiveWindows(): WorkspaceWindow[] {
        // Get all workspaces (get keys and values from map and map to WorkspaceWindow)
        const workspaces = Array.from(this.windowIdToWorkspaceMap.entries()).map(([windowId, workspace]) => ({
            windowId,
            workspacePath: workspace.workspaceDir
        }));
        return workspaces;
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
     * Registers a window with a workspace
     * @param windowId The ID of the window
     * @param workspacePath The path to the workspace
     */
    public async registerWindow(windowId: string, workspace: WorkspaceManager): Promise<void> {
        try {
            log.info(`[WORKSPACE REGISTER] Registering window ${windowId} with workspace ${workspace.workspaceDir}`);

            const currentWorkspace = this.windowIdToWorkspaceMap.get(windowId);
            if (currentWorkspace) {
                log.info(`[WORKSPACE REGISTER] Window ${windowId} is already registered with workspace ${currentWorkspace.workspaceDir}`);

                // If the window is already registered with this workspace, do nothing
                if (currentWorkspace === workspace) {
                    log.info(`[WORKSPACE REGISTER] Window ${windowId} is already registered with workspace ${workspace.workspaceDir}, no action needed`);
                    return;
                }
                
                // If the window is registered with a different workspace, unregister it first
                log.info(`[WORKSPACE REGISTER] Window ${windowId} is registered with a different workspace, unregistering first`);
                this.unregisterWindow(windowId);        
            }
                                    
            // Add the window to the active windows map with only essential properties
            this.windowIdToWorkspaceMap.set(windowId, workspace);
            
            // Update last active workspace
            this.lastActiveWorkspace = workspace.workspaceDir;
            
            // Add to recent workspaces
            await this.addRecentWorkspace(workspace.workspaceDir);
            
            // Save the state
            await this.saveState();
                        
            // Get the window
            const window = BrowserWindow.fromId(parseInt(windowId));
            if (window) {                
                // Send the event to all windows, but include targetWindowId to indicate which window should update its content
                log.info(`[WORKSPACE REGISTER] Sending workspace:switched event to all windows with targetWindowId ${windowId}`);
                BrowserWindow.getAllWindows().forEach(win => {
                    log.info(`[WORKSPACE REGISTER] Sending workspace:switched event to window ${win.id}`);
                    win.webContents.send('workspace:switched', { 
                        windowId, 
                        workspacePath: workspace.workspaceDir,
                        targetWindowId: windowId // This indicates which window should update its content
                    });
                });
                workspace.initializeListeners(window);
            }
            
            log.info(`[WORKSPACE REGISTER] Window ${windowId} registered with workspace ${workspace.workspaceDir}`);
        } catch (error) {
            log.error(`[WORKSPACE REGISTER] Error registering window ${windowId} with workspace ${workspace.workspaceDir}:`, error);
            throw error;
        }
    }
    
    private unregisterWindow(windowId: string): void {
        const workspace = this.windowIdToWorkspaceMap.get(windowId);
        if (workspace) {
            workspace.uninitializeListeners();
            this.windowIdToWorkspaceMap.delete(windowId);
            log.info(`Unregistered window ${windowId}`);
        }
    }
        
    /**
     * Tracks workspace switch and notifies all windows
     * @param windowId The ID of the window
     * @param workspacePath The path to the workspace
     */
    public async switchWorkspace(windowId: string, newWorkspace: WorkspaceManager | null): Promise<void> {
        try {
            const currentWorkspace = this.windowIdToWorkspaceMap.get(windowId);
            if (currentWorkspace) {
                log.info(`[WORKSPACE SWITCH] Unregistering window ${windowId} from workspace ${currentWorkspace.workspaceDir}`);
                this.unregisterWindow(windowId);
            }

            if (newWorkspace) {
                log.info(`[WORKSPACE SWITCH] Starting workspace switch for window ${windowId} to workspace ${newWorkspace.workspaceDir}`);
                await this.registerWindow(windowId, newWorkspace);
            } else {
                log.info(`[WORKSPACE SWITCH] Starting workspace switch for window ${windowId} to no workspace`);
            }

            // Get the window
            const browserWindow = BrowserWindow.fromId(parseInt(windowId));
            if (browserWindow) {
                // Send the event to all windows, but include targetWindowId to indicate which window should update its content
                log.info(`[WORKSPACE SWITCH] Sending workspace:switched event to all windows with targetWindowId ${windowId}`);
                BrowserWindow.getAllWindows().forEach(win => {
                    log.info(`[WORKSPACE SWITCH] Sending workspace:switched event to window ${win.id}`);
                    win.webContents.send('workspace:switched', {
                        windowId,
                        workspacePath: newWorkspace ? newWorkspace.workspaceDir : null,
                        targetWindowId: windowId // This indicates which window should update its content
                    });
                });
            } else {
                log.warn(`[WORKSPACE SWITCH] Could not find browser window with ID ${windowId}`);
            }
        } catch (error) {
            log.error(`[WORKSPACE SWITCH] Error switching window ${windowId} to workspace ${newWorkspace ? newWorkspace.workspaceDir : "no workspace"}:`, error);
            throw error;
        }
    }
} 