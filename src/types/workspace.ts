export interface WorkspaceWindow {
    windowId: string;
    workspacePath: string;
    isMinimized: boolean;
    isActive: boolean;
}

export interface WorkspaceMetadata {
    name: string;
    created: string;
    lastAccessed: string;
    version: string;
}

export interface WorkspaceConfig {
    metadata: WorkspaceMetadata;
    references: {
        directory: string;
    };
    rules: {
        directory: string;
    };
} 