export const MAX_CHAT_TURNS_KEY = 'maxChatTurns';
export const MAX_OUTPUT_TOKENS_KEY = 'maxOutputTokens';
export const TEMPERATURE_KEY = 'temperature';
export const TOP_P_KEY = 'topP';
export const SYSTEM_PATH_KEY = 'systemPath';
export const MOST_RECENT_MODEL_KEY = 'mostRecentModel';
export const THEME_KEY = 'theme';

// Tool Permission Settings
export type SessionToolPermission = 'always' | 'never' | 'tool';

// Constants for session-level permissions
export const SESSION_TOOL_PERMISSION_KEY = 'toolPermission';
export const SESSION_TOOL_PERMISSION_ALWAYS: SessionToolPermission = 'always';
export const SESSION_TOOL_PERMISSION_NEVER: SessionToolPermission = 'never';
export const SESSION_TOOL_PERMISSION_TOOL: SessionToolPermission = 'tool';
export const SESSION_TOOL_PERMISSION_DEFAULT: SessionToolPermission = SESSION_TOOL_PERMISSION_TOOL;

export const MAX_CHAT_TURNS_DEFAULT = 20;
export const MAX_OUTPUT_TOKENS_DEFAULT = 1000;
export const TEMPERATURE_DEFAULT = 0.5;
export const TOP_P_DEFAULT = 0.5;

export interface WorkspaceMetadata {
    name: string;
    created: string;
    lastAccessed: string;
    version: string;
}

export interface WorkspaceConfig {
    metadata: WorkspaceMetadata;
    settings: {
        [MAX_CHAT_TURNS_KEY]: string;
        [MAX_OUTPUT_TOKENS_KEY]: string;
        [TEMPERATURE_KEY]: string;
        [TOP_P_KEY]: string;
        [THEME_KEY]: string;
        [SESSION_TOOL_PERMISSION_KEY]?: SessionToolPermission;
    };
}
