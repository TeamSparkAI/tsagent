import { BrowserWindow } from 'electron';

export const MAX_CHAT_TURNS_KEY = 'maxChatTurns';
export const MAX_OUTPUT_TOKENS_KEY = 'maxOutputTokens';
export const TEMPERATURE_KEY = 'temperature';
export const TOP_P_KEY = 'topP';
export const SYSTEM_PATH_KEY = 'systemPath';
export const MOST_RECENT_MODEL_KEY = 'mostRecentModel';
export const THEME_KEY = 'theme';

export const MAX_CHAT_TURNS_DEFAULT = 20;
export const MAX_OUTPUT_TOKENS_DEFAULT = 1000;
export const TEMPERATURE_DEFAULT = 0.5;
export const TOP_P_DEFAULT = 0.5;

export interface WorkspaceWindow {
    windowId: string;
    workspacePath: string;
    browserWindow?: BrowserWindow;
}

export interface WorkspaceMetadata {
    name: string;
    created: string;
    lastAccessed: string;
    version: string;
}

export interface WorkspaceConfig {
    metadata: WorkspaceMetadata;
}
