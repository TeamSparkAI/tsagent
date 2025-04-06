import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as log from 'electron-log';
import { WorkspaceWindow, WorkspaceConfig } from '../types/workspace';
import { ConfigManager } from '../state/ConfigManager';
import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { RulesManager } from '../state/RulesManager';
import { ReferencesManager } from '../state/ReferencesManager';
import { AppState } from '../state/AppState';
import { MCPClientManager } from '../mcp/manager';
import { ChatSessionManager } from '../state/ChatSessionManager';
import { McpClient, McpConfig, McpConfigFileServerConfig } from '../mcp/types';
import { createMcpClientFromConfig } from '../mcp/client';

// Near the top with other state
const mcpClients = new Map<string, McpClient>();
let appState: AppState;

export class WorkspaceManager extends EventEmitter {
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
        super();
        this.activeWindows = new Map();
        this.recentWorkspaces = [];
        this.lastActiveWorkspace = null;
        this.recentWorkspacesPath = path.join(app.getPath('userData'), 'workspaces.json');
        log.info(`Workspaces file path: ${this.recentWorkspacesPath}`);
        // Initialize but don't await here
        this.initialize();
    }

    private async initialize(): Promise<void> {
        await this.loadRecentWorkspaces();
    }

    public static getInstance(): WorkspaceManager {
        if (!WorkspaceManager.instance) {
            WorkspaceManager.instance = new WorkspaceManager();
        }
        return WorkspaceManager.instance;
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
                await this.unregisterWindow(windowId);
            }
            
            // Validate the workspace
            await this.validateWorkspace(workspacePath);
            
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
            
            // Get the ConfigManager for this workspace
            const configManager = await this.getConfigManager(workspacePath);
            
            // Load configuration
            log.info(`[WORKSPACE REGISTER] Loading configuration for workspace ${workspacePath}`);
            await configManager.loadConfig();
            log.info(`[WORKSPACE REGISTER] Configuration loaded for workspace ${workspacePath}`);
            
            // Get the window
            const window = BrowserWindow.fromId(parseInt(windowId));
            if (window) {
                // Notify the renderer process that configuration has changed
                window.webContents.send('configuration:changed');
                
                // Emit the workspace:switched event with the workspace path
                log.info(`[WORKSPACE REGISTER] Emitting workspace:switched event for window ${windowId} with workspace ${workspacePath}`);
                this.emit('workspace:switched', { windowId, workspacePath });
                
                // Send the event to all windows
                log.info(`[WORKSPACE REGISTER] Sending workspace:switched event to all windows`);
                BrowserWindow.getAllWindows().forEach(win => {
                    log.info(`[WORKSPACE REGISTER] Sending workspace:switched event to window ${win.id}`);
                    win.webContents.send('workspace:switched');
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

    public async createWorkspace(workspacePath: string): Promise<void> {
        try {
            log.info(`Creating workspace at ${workspacePath}`);

            // Create workspace directory if it doesn't exist
            if (!fs.existsSync(workspacePath)) {
                fs.mkdirSync(workspacePath, { recursive: true });
                log.info(`Created workspace directory at ${workspacePath}`);
            }

            // Create workspace.json with default configuration
            const workspaceJsonPath = path.join(workspacePath, 'workspace.json');
            const defaultConfig: WorkspaceConfig = {
                metadata: {
                    name: path.basename(workspacePath),
                    created: new Date().toISOString(),
                    lastAccessed: new Date().toISOString(),
                    version: '1.0.0'
                },
                references: {
                    directory: 'references'
                },
                rules: {
                    directory: 'rules'
                }
            };

            // Write workspace.json
            await fs.promises.writeFile(
                workspaceJsonPath,
                JSON.stringify(defaultConfig, null, 2)
            );
            log.info(`Created workspace.json at ${workspaceJsonPath}`);

            // Create references directory
            const referencesDir = path.join(workspacePath, defaultConfig.references.directory);
            if (!fs.existsSync(referencesDir)) {
                fs.mkdirSync(referencesDir, { recursive: true });
                log.info(`Created references directory at ${referencesDir}`);
            }

            // Create rules directory
            const rulesDir = path.join(workspacePath, defaultConfig.rules.directory);
            if (!fs.existsSync(rulesDir)) {
                fs.mkdirSync(rulesDir, { recursive: true });
                log.info(`Created rules directory at ${rulesDir}`);
            }

            // Create config directory
            const configDir = path.join(workspacePath, 'config');
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
                log.info(`Created config directory at ${configDir}`);
            }

            // Validate the workspace to ensure everything is set up correctly
            await this.validateWorkspace(workspacePath);

            log.info(`Workspace created successfully at ${workspacePath}`);
        } catch (error) {
            log.error(`Error creating workspace at ${workspacePath}:`, error);
            throw error;
        }
    }

    public async validateWorkspace(workspacePath: string): Promise<void> {
        try {
            // Check if workspace.json exists
            const configPath = path.join(workspacePath, 'workspace.json');
            if (!fs.existsSync(configPath)) {
                log.warn(`No workspace.json found at ${workspacePath}, creating default configuration`);
                
                // Create default workspace configuration
                const defaultConfig: WorkspaceConfig = {
                    metadata: {
                        name: path.basename(workspacePath),
                        created: new Date().toISOString(),
                        lastAccessed: new Date().toISOString(),
                        version: '1.0.0'
                    },
                    references: {
                        directory: path.join(workspacePath, 'references')
                    },
                    rules: {
                        directory: path.join(workspacePath, 'rules')
                    }
                };
                
                // Ensure the workspace directory exists
                if (!fs.existsSync(workspacePath)) {
                    fs.mkdirSync(workspacePath, { recursive: true });
                }
                
                // Write the default configuration
                await fs.promises.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
                log.info(`Created default workspace.json at ${configPath}`);
            }

            // Read and parse workspace.json
            const configContent = await fs.promises.readFile(configPath, 'utf-8');
            let config: WorkspaceConfig = JSON.parse(configContent);
            
            // Ensure required sections exist
            if (!config.metadata) {
                log.warn(`Missing metadata section in workspace configuration at ${workspacePath}, adding default metadata`);
                config.metadata = {
                    name: path.basename(workspacePath),
                    created: new Date().toISOString(),
                    lastAccessed: new Date().toISOString(),
                    version: '1.0.0'
                };
                
                // Write the updated configuration
                await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
            }
            
            // Ensure references directory exists
            if (!config.references || !config.references.directory) {
                log.warn(`Missing references section in workspace configuration at ${workspacePath}, adding default references`);
                config.references = {
                    directory: path.join(workspacePath, 'references')
                };
                
                // Write the updated configuration
                await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
            }
            
            // Ensure rules directory exists
            if (!config.rules || !config.rules.directory) {
                log.warn(`Missing rules section in workspace configuration at ${workspacePath}, adding default rules`);
                config.rules = {
                    directory: path.join(workspacePath, 'rules')
                };
                
                // Write the updated configuration
                await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
            }
            
            // Create directories if they don't exist
            const referencesDir = config.references.directory;
            const rulesDir = config.rules.directory;
            
            if (!fs.existsSync(referencesDir)) {
                log.info(`Creating references directory: ${referencesDir}`);
                fs.mkdirSync(referencesDir, { recursive: true });
            }
            
            if (!fs.existsSync(rulesDir)) {
                log.info(`Creating rules directory: ${rulesDir}`);
                fs.mkdirSync(rulesDir, { recursive: true });
                
                // Only create default rule if the directory is completely empty
                const files = fs.readdirSync(rulesDir);
                if (files.length === 0) {
                    // Create a default rule
                    const defaultRulePath = path.join(rulesDir, 'default-rule.mdw');
                    const defaultRuleContent = `---\nname: default-rule\ndescription: Default rule for new workspace\npriorityLevel: 500\nenabled: true\n---\nThis is a default rule that was created when initializing the workspace. You can edit or delete this rule as needed.`;
                    
                    log.info(`Creating default rule at: ${defaultRulePath}`);
                    await fs.promises.writeFile(defaultRulePath, defaultRuleContent, 'utf-8');
                }
            } else {
                // Log existing rules for debugging
                const existingRules = fs.readdirSync(rulesDir).filter(file => file.endsWith('.mdw'));
                log.info(`Found ${existingRules.length} existing rules in ${rulesDir}: ${existingRules.join(', ')}`);
            }
            
            // Create config directory if it doesn't exist
            const configDir = path.join(workspacePath, 'config');
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
                log.info(`Created config directory at ${configDir}`);
            }

            // Create prompt.md file if it doesn't exist
            const promptFile = path.join(configDir, 'prompt.md');
            if (!fs.existsSync(promptFile)) {
                const defaultPrompt = "You are a helpful AI assistant that can use tools to help accomplish tasks.";
                await fs.promises.writeFile(promptFile, defaultPrompt, 'utf-8');
                log.info(`Created default prompt.md at ${promptFile}`);
            }
            
            log.info(`Workspace ${workspacePath} validated successfully`);
        } catch (error) {
            log.error(`Error validating workspace ${workspacePath}:`, error);
            throw error;
        }
    }

    public async readWorkspace(workspacePath: string): Promise<WorkspaceConfig> {
        try {
            const configPath = path.join(workspacePath, 'workspace.json');
            const configContent = await fs.promises.readFile(configPath, 'utf-8');
            let config: WorkspaceConfig = JSON.parse(configContent);
            
            // Ensure required sections exist
            if (!config.metadata) {
                log.warn(`Missing metadata section in workspace configuration at ${workspacePath}, adding default metadata`);
                config.metadata = {
                    name: path.basename(workspacePath),
                    created: new Date().toISOString(),
                    lastAccessed: new Date().toISOString(),
                    version: '1.0.0'
                };
            } else {
                // Update lastAccessed
                config.metadata.lastAccessed = new Date().toISOString();
            }
            
            // Ensure required sections exist
            if (!config.references) {
                config.references = { directory: 'references' };
            }
            
            if (!config.rules) {
                config.rules = { directory: 'rules' };
            }
            
            // Write the updated config back to the file
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
            
            // Read the existing config if it exists
            let existingConfig: WorkspaceConfig | null = null;
            if (fs.existsSync(configPath)) {
                try {
                    const configContent = await fs.promises.readFile(configPath, 'utf-8');
                    existingConfig = JSON.parse(configContent);
                    log.info(`Read existing workspace configuration from ${configPath}`);
                } catch (error) {
                    log.warn(`Error reading existing workspace configuration: ${error}`);
                }
            }
            
            // Ensure required fields are preserved
            if (existingConfig && existingConfig.metadata) {
                // Preserve metadata if it exists
                config.metadata = {
                    ...existingConfig.metadata,
                    ...config.metadata,
                    lastAccessed: new Date().toISOString() // Always update lastAccessed
                };
                log.info(`Preserved metadata from existing configuration`);
            } else if (!config.metadata) {
                // Create default metadata if none exists
                config.metadata = {
                    name: path.basename(workspacePath),
                    created: new Date().toISOString(),
                    lastAccessed: new Date().toISOString(),
                    version: '1.0.0'
                };
                log.info(`Created default metadata for workspace`);
            }
            
            // Ensure required sections exist
            if (!config.references) {
                config.references = { directory: 'references' };
            }
            
            if (!config.rules) {
                config.rules = { directory: 'rules' };
            }
            
            // Write the updated config
            await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
            log.info(`Updated workspace configuration at ${workspacePath}`);
        } catch (error) {
            log.error(`Error writing workspace at ${workspacePath}:`, error);
            throw error;
        }
    }

    private validateSchema(config: any): boolean {
        // Basic schema validation
        if (!config.metadata) {
            throw new Error('Missing required metadata section in workspace configuration');
        }

        if (!config.references) {
            throw new Error('Missing required references section in workspace configuration');
        }

        if (!config.rules) {
            throw new Error('Missing required rules section in workspace configuration');
        }

        if (!config.metadata.name) {
            throw new Error('Missing required name in workspace metadata');
        }

        if (!config.metadata.created) {
            throw new Error('Missing required created timestamp in workspace metadata');
        }

        if (!config.metadata.version) {
            throw new Error('Missing required version in workspace metadata');
        }

        // Optional fields
        if (!config.metadata.lastAccessed) {
            config.metadata.lastAccessed = new Date().toISOString();
        }

        // Optional directory paths with defaults
        if (!config.references.directory) {
            config.references.directory = 'references';
        }

        if (!config.rules.directory) {
            config.rules.directory = 'rules';
        }

        return true;
    }

    public async ensureInitialized(): Promise<void> {
        // This method can be called to ensure data is loaded
        await this.initialize();
    }

    /**
     * Gets a ConfigManager instance for a specific workspace
     * @param workspacePath The path to the workspace
     * @returns A ConfigManager instance for the workspace
     */
    public async getConfigManager(workspacePath: string): Promise<ConfigManager> {
        log.info(`[WORKSPACE MANAGER] Getting ConfigManager for workspace: ${workspacePath}`);
        
        // Create a config path for this workspace
        const configPath = path.join(workspacePath, 'config');
        log.info(`[WORKSPACE MANAGER] Using config directory: ${configPath}`);
        
        // Get the ConfigManager instance
        const configManager = ConfigManager.getInstance(app.isPackaged);
        
        // Set the config path for this workspace
        await configManager.setConfigPath(configPath);
        
        return configManager;
    }

    /**
     * Reloads configuration for a specific window when its workspace is activated
     * @param windowId The ID of the window to reload configuration for
     */
    public async reloadConfigurationForWindow(windowId: string): Promise<void> {
        try {
            log.info(`Reloading configuration for window ${windowId}`);
            
            // Get the workspace path for this window
            const window = Array.from(this.activeWindows.values()).find(w => w.windowId === windowId);
            if (!window) {
                log.error(`No window found with ID: ${windowId}`);
                return;
            }
            
            // Get the ConfigManager for this workspace
            const configManager = await this.getConfigManager(window.workspacePath);
            
            // Instead of using ipcMain.emit, we'll use a different approach
            // The main process will call this method directly when needed
            
            log.info(`Configuration reloaded for window ${windowId} with workspace ${window.workspacePath}`);
        } catch (error) {
            log.error(`Error reloading configuration for window ${windowId}:`, error);
        }
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
    public async switchWorkspace(windowId: string, workspacePath: string): Promise<void> {
        try {
            log.info(`[WORKSPACE SWITCH] Starting workspace switch for window ${windowId} to workspace ${workspacePath}`);
            await this.validateWorkspace(workspacePath);
            
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
            
            // Get the ConfigManager for this workspace
            const configManager = await ConfigManager.getInstance(app.isPackaged);
            
            // Get the config directory for this workspace
            const configDir = configManager.getConfigDir();
            log.info(`[WORKSPACE SWITCH] Using config directory: ${configDir}`);

            // Initialize RulesManager and ReferencesManager with the config directory
            const rulesManager = new RulesManager(configDir);
            const referencesManager = new ReferencesManager(configDir);

            // Create a temporary MCPClientManager
            const tempMcpManager = new MCPClientManager(null as any, new Map());

            // Create AppState with temporary MCPClientManager
            log.info(`[WORKSPACE MANAGER] Creating new AppState with ConfigManager for path: ${configDir}`);
            appState = new AppState(configManager, rulesManager, referencesManager, tempMcpManager);
            
            // Initialize MCP clients
            const mcpServers: Record<string, McpConfig> = await configManager.getMcpConfig();
            if (mcpServers && Object.keys(mcpServers).length > 0) {
                for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
                    try {
                        if (!serverConfig || !serverConfig.config) {
                            log.error(`Invalid server configuration for ${serverName}: missing config property`);
                            continue;
                        }
                        
                        const client = createMcpClientFromConfig(appState, serverConfig);      
                        if (client) {
                            await client.connect();
                            mcpClients.set(serverName, client);
                            log.info(`Reconnected MCP client: ${serverName}`);
                        }
                    } catch (error) {
                        log.error(`Failed to reconnect MCP client ${serverName}:`, error);
                    }
                }
            }

            // Initialize ChatSessionManager with the new AppState
            const chatSessionManager = new ChatSessionManager(appState);

            // Initialize MCP client manager with the connected clients
            const mcpClientManager = new MCPClientManager(appState, mcpClients);
            
            // Set MCP client manager in AppState
            appState.setMCPManager(mcpClientManager);

            // Get the window
            const browserWindow = BrowserWindow.fromId(parseInt(windowId));
            if (browserWindow) {
                // Notify the renderer process that configuration has changed
                browserWindow.webContents.send('configuration:changed');
                
                // Send the event to all windows
                log.info(`[WORKSPACE SWITCH] Sending workspace:switched event to all windows`);
                BrowserWindow.getAllWindows().forEach(window => {
                    log.info(`[WORKSPACE SWITCH] Sending workspace:switched event to window ${window.id}`);
                    window.webContents.send('workspace:switched', {
                        windowId,
                        workspacePath
                    });
                });
            } else {
                log.warn(`[WORKSPACE SWITCH] Could not find browser window with ID ${windowId}`);
            }
        } catch (error) {
            log.error(`[WORKSPACE SWITCH] Error switching window ${windowId} to workspace ${workspacePath}:`, error);
            throw error;
        }
    }
} 