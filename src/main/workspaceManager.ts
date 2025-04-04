import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as log from 'electron-log';

interface WorkspaceMetadata {
    name: string;
    created: string;
    lastAccessed: string;
    version: string;
}

interface WorkspaceConfig {
    metadata: WorkspaceMetadata;
    references: {
        directory: string;
    };
    rules: {
        directory: string;
    };
}

interface WorkspaceWindow {
    windowId: string;
    workspacePath: string;
    isMinimized: boolean;
    isActive: boolean;
}

export class WorkspaceManager {
    private static instance: WorkspaceManager;
    private readonly workspaceSchema = {
        required: ['metadata', 'references', 'rules'],
        properties: {
            metadata: {
                required: ['name', 'created', 'lastAccessed', 'version'],
                type: 'object'
            },
            references: {
                required: ['directory'],
                type: 'object'
            },
            rules: {
                required: ['directory'],
                type: 'object'
            }
        }
    };

    private activeWindows: Map<string, WorkspaceWindow>;
    private recentWorkspaces: string[];
    private lastActiveWorkspace: string | null;
    private readonly maxRecentWorkspaces = 10;
    private readonly recentWorkspacesPath: string;

    private constructor() {
        this.activeWindows = new Map();
        this.recentWorkspaces = [];
        this.lastActiveWorkspace = null;
        this.recentWorkspacesPath = path.join(app.getPath('userData'), 'workspaces.json');
        this.loadRecentWorkspaces();
    }

    public static getInstance(): WorkspaceManager {
        if (!WorkspaceManager.instance) {
            WorkspaceManager.instance = new WorkspaceManager();
        }
        return WorkspaceManager.instance;
    }

    private async loadRecentWorkspaces(): Promise<void> {
        try {
            if (fs.existsSync(this.recentWorkspacesPath)) {
                const data = await fs.promises.readFile(this.recentWorkspacesPath, 'utf-8');
                const { recentWorkspaces, lastActiveWorkspace } = JSON.parse(data);
                this.recentWorkspaces = recentWorkspaces;
                this.lastActiveWorkspace = lastActiveWorkspace;
            }
        } catch (error) {
            log.error('Failed to load recent workspaces:', error);
        }
    }

    private async saveRecentWorkspaces(): Promise<void> {
        try {
            const data = JSON.stringify({
                recentWorkspaces: this.recentWorkspaces,
                lastActiveWorkspace: this.lastActiveWorkspace
            }, null, 2);
            await fs.promises.writeFile(this.recentWorkspacesPath, data);
        } catch (error) {
            log.error('Failed to save recent workspaces:', error);
        }
    }

    public registerWindow(windowId: string, workspacePath: string): void {
        this.activeWindows.set(windowId, {
            windowId,
            workspacePath,
            isMinimized: false,
            isActive: false
        });
        this.addRecentWorkspace(workspacePath);
        this.lastActiveWorkspace = workspacePath;
        this.saveRecentWorkspaces();
        log.info(`Registered window ${windowId} with workspace ${workspacePath}`);
    }

    public unregisterWindow(windowId: string): void {
        this.activeWindows.delete(windowId);
        log.info(`Unregistered window ${windowId}`);
    }

    public updateWindowState(windowId: string, isMinimized: boolean, isActive: boolean): void {
        const window = this.activeWindows.get(windowId);
        if (window) {
            window.isMinimized = isMinimized;
            window.isActive = isActive;
            if (isActive) {
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

    public async createWorkspace(workspacePath: string): Promise<void> {
        try {
            // Ensure directory exists
            if (!fs.existsSync(workspacePath)) {
                fs.mkdirSync(workspacePath, { recursive: true });
            }

            // Create workspace.json
            const workspaceConfig: WorkspaceConfig = {
                metadata: {
                    name: path.basename(workspacePath),
                    created: new Date().toISOString(),
                    lastAccessed: new Date().toISOString(),
                    version: app.getVersion()
                },
                references: {
                    directory: 'references'
                },
                rules: {
                    directory: 'rules'
                }
            };

            // Create workspace.json
            const configPath = path.join(workspacePath, 'workspace.json');
            await fs.promises.writeFile(configPath, JSON.stringify(workspaceConfig, null, 2));

            // Create required directories
            await fs.promises.mkdir(path.join(workspacePath, 'references'), { recursive: true });
            await fs.promises.mkdir(path.join(workspacePath, 'rules'), { recursive: true });

            log.info(`Created workspace at ${workspacePath}`);
        } catch (error) {
            log.error(`Failed to create workspace at ${workspacePath}:`, error);
            throw error;
        }
    }

    public async validateWorkspace(workspacePath: string): Promise<boolean> {
        try {
            // Check if workspace.json exists
            const configPath = path.join(workspacePath, 'workspace.json');
            if (!fs.existsSync(configPath)) {
                log.warn(`No workspace.json found at ${workspacePath}`);
                return false;
            }

            // Read and parse workspace.json
            const configContent = await fs.promises.readFile(configPath, 'utf-8');
            const config: WorkspaceConfig = JSON.parse(configContent);

            // Validate required directories exist
            const referencesDir = path.join(workspacePath, config.references.directory);
            const rulesDir = path.join(workspacePath, config.rules.directory);

            if (!fs.existsSync(referencesDir) || !fs.existsSync(rulesDir)) {
                log.warn(`Missing required directories in workspace ${workspacePath}`);
                return false;
            }

            // Basic schema validation
            if (!this.validateSchema(config)) {
                log.warn(`Invalid workspace configuration at ${workspacePath}`);
                return false;
            }

            return true;
        } catch (error) {
            log.error(`Error validating workspace at ${workspacePath}:`, error);
            return false;
        }
    }

    public async readWorkspace(workspacePath: string): Promise<WorkspaceConfig> {
        try {
            const configPath = path.join(workspacePath, 'workspace.json');
            const configContent = await fs.promises.readFile(configPath, 'utf-8');
            const config: WorkspaceConfig = JSON.parse(configContent);

            // Update lastAccessed
            config.metadata.lastAccessed = new Date().toISOString();
            await this.writeWorkspace(workspacePath, config);

            return config;
        } catch (error) {
            log.error(`Error reading workspace at ${workspacePath}:`, error);
            throw error;
        }
    }

    public async writeWorkspace(workspacePath: string, config: WorkspaceConfig): Promise<void> {
        try {
            const configPath = path.join(workspacePath, 'workspace.json');
            await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
            log.info(`Updated workspace configuration at ${workspacePath}`);
        } catch (error) {
            log.error(`Error writing workspace at ${workspacePath}:`, error);
            throw error;
        }
    }

    private validateSchema(config: any): boolean {
        // Basic schema validation
        if (!config.metadata || !config.references || !config.rules) {
            return false;
        }

        if (!config.metadata.name || !config.metadata.created || 
            !config.metadata.lastAccessed || !config.metadata.version) {
            return false;
        }

        if (!config.references.directory || !config.rules.directory) {
            return false;
        }

        return true;
    }
} 