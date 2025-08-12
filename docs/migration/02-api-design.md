# API Design Specification

## Overview

The API is designed around resources with proper REST conventions, supporting both direct method calls (for Electron) and HTTP access (for external clients).

## API Interfaces

### IElectronAPI (Electron-specific operations)
```typescript
interface IElectronAPI {
  // Window Management
  getActiveWindows: () => Promise<WorkspaceWindow[]>;
  getCurrentWindowId: () => Promise<string>;
  focusWindow: (windowId: string) => Promise<boolean>;
  openInNewWindow: (path: string) => Promise<void>;
  createWorkspaceInNewWindow: (path: string) => Promise<void>;
  
  // File System Operations
  showOpenDialog: (options: OpenDialogOptions) => Promise<{ canceled: boolean; filePaths: string[] }>;
  openWorkspace: (path: string) => Promise<void>;
  createWorkspace: (windowId: string, path: string) => Promise<void>;
  switchWorkspace: (windowId: string, workspacePath: string) => Promise<boolean>;
  cloneWorkspace: (sourcePath: string, targetPath: string) => Promise<CloneResult>;
  workspaceExists: (path: string) => Promise<boolean>;
  getRecentWorkspaces: () => Promise<string[]>;
  
  // UI Operations
  showChatMenu: (hasSelection: boolean, x: number, y: number) => Promise<void>;
  showEditControlMenu: (editFlags: EditControlFlags) => Promise<void>;
  showMessageBox: (options: MessageBoxOptions) => Promise<{ response: number }>;
  toggleDevTools: () => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  
  // App Information
  getAppDetails: () => Promise<{ isPackaged: boolean }>;
}
```

### IBackendAPI (General-purpose backend operations)
```typescript
interface IBackendAPI {
  // Workspaces
  getWorkspaces(): Promise<Workspace[]>;
  createWorkspace(data: CreateWorkspaceRequest): Promise<Workspace>;
  getWorkspace(workspaceId: string): Promise<Workspace>;
  updateWorkspace(workspaceId: string, data: UpdateWorkspaceRequest): Promise<Workspace>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  
  // Rules
  getRules(workspaceId: string): Promise<Rule[]>;
  createRule(workspaceId: string, data: CreateRuleRequest): Promise<Rule>;
  getRule(workspaceId: string, ruleId: string): Promise<Rule>;
  updateRule(workspaceId: string, ruleId: string, data: UpdateRuleRequest): Promise<Rule>;
  deleteRule(workspaceId: string, ruleId: string): Promise<void>;
  
  // References
  getReferences(workspaceId: string): Promise<Reference[]>;
  createReference(workspaceId: string, data: CreateReferenceRequest): Promise<Reference>;
  getReference(workspaceId: string, referenceId: string): Promise<Reference>;
  updateReference(workspaceId: string, referenceId: string, data: UpdateReferenceRequest): Promise<Reference>;
  deleteReference(workspaceId: string, referenceId: string): Promise<void>;
  
  // Chat Sessions
  getChatSessions(workspaceId: string): Promise<ChatSession[]>;
  createChatSession(workspaceId: string, data: CreateChatSessionRequest): Promise<ChatSession>;
  getChatSession(workspaceId: string, sessionId: string): Promise<ChatSession>;
  updateChatSession(workspaceId: string, sessionId: string, data: UpdateChatSessionRequest): Promise<ChatSession>;
  deleteChatSession(workspaceId: string, sessionId: string): Promise<void>;
  sendMessage(workspaceId: string, sessionId: string, data: SendMessageRequest): Promise<MessageResponse>;
  
  // Chat Tab Management (Legacy tab-based API)
  createChatTab(tabId: string, modelProvider?: LLMType, modelId?: string): Promise<ChatSessionResponse>;
  closeChatTab(tabId: string): Promise<void>;
  getChatState(tabId: string): Promise<ChatState>;
  clearModel(tabId: string): Promise<void>;
  switchModel(tabId: string, modelType: string, modelId?: string): Promise<void>;
  updateChatSettings(tabId: string, settings: ChatSettings): Promise<void>;
  
  // Chat Context Management
  addChatReference(tabId: string, referenceName: string): Promise<void>;
  removeChatReference(tabId: string, referenceName: string): Promise<void>;
  addChatRule(tabId: string, ruleName: string): Promise<void>;
  removeChatRule(tabId: string, ruleName: string): Promise<void>;
  
  // Settings
  getSettingsValue(key: string): Promise<string>;
  setSettingsValue(key: string, value: string): Promise<void>;
  getSystemPrompt(): Promise<string>;
  saveSystemPrompt(prompt: string): Promise<void>;
  
  // MCP Servers
  getMCPServers(workspaceId: string): Promise<MCPServer[]>;
  createMCPServer(workspaceId: string, data: CreateMCPServerRequest): Promise<MCPServer>;
  getMCPServer(workspaceId: string, serverId: string): Promise<MCPServer>;
  updateMCPServer(workspaceId: string, serverId: string, data: UpdateMCPServerRequest): Promise<MCPServer>;
  deleteMCPServer(workspaceId: string, serverId: string): Promise<void>;
  testMCPServer(workspaceId: string, serverId: string): Promise<MCPServerTestResult>;
  refreshMCPServer(workspaceId: string, serverId: string): Promise<MCPServerRefreshResult>;
  
  // Legacy MCP Methods (for backward compatibility)
  getServerConfigs(): Promise<MCPServer[]>;
  saveServerConfig(server: MCPServer): Promise<void>;
  reloadServerInfo(serverName: string): Promise<void>;
  deleteServerConfig(name: string): Promise<void>;
  pingServer(name: string): Promise<boolean>;
  getMCPClient(serverName: string): Promise<any>;
  callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  
  // LLM Providers
  getLLMProviders(workspaceId: string): Promise<LLMProvider[]>;
  createLLMProvider(workspaceId: string, data: CreateLLMProviderRequest): Promise<LLMProvider>;
  getLLMProvider(workspaceId: string, providerId: string): Promise<LLMProvider>;
  updateLLMProvider(workspaceId: string, providerId: string, data: UpdateLLMProviderRequest): Promise<LLMProvider>;
  deleteLLMProvider(workspaceId: string, providerId: string): Promise<void>;
  
  // Legacy LLM Methods (for backward compatibility)
  getProviderInfo(): Promise<Record<string, LLMProviderInfo>>;
  validateProviderConfig(provider: string): Promise<boolean>;
  getModelsForProvider(provider: string): Promise<ILLMModel[]>;
  getInstalledProviders(): Promise<string[]>;
  addProvider(provider: string): Promise<void>;
  removeProvider(provider: string): Promise<void>;
  getProviderConfig(provider: string, key: string): Promise<string>;
  setProviderConfig(provider: string, key: string, value: string): Promise<void>;
  
  // Event Listeners
  onRulesChanged(callback: () => void): () => void;
  offRulesChanged(listener: () => void): void;
  onReferencesChanged(callback: () => void): () => void;
  offReferencesChanged(listener: () => void): void;
  onWorkspaceSwitched(callback: (data: WorkspaceSwitchData) => void): () => void;
  offWorkspaceSwitched(listener: (data: WorkspaceSwitchData) => void): void;
  onProvidersChanged(callback: () => void): () => void;
  offProvidersChanged(listener: () => void): void;
}
```

## REST API Endpoints

### Workspaces
```
GET    /api/workspaces                    # List all workspaces
POST   /api/workspaces                    # Create workspace
GET    /api/workspaces/:workspaceId       # Get specific workspace
PUT    /api/workspaces/:workspaceId       # Update workspace
DELETE /api/workspaces/:workspaceId       # Delete workspace
```

### Rules
```
GET    /api/workspaces/:workspaceId/rules           # List rules
POST   /api/workspaces/:workspaceId/rules           # Create rule
GET    /api/workspaces/:workspaceId/rules/:ruleId   # Get specific rule
PUT    /api/workspaces/:workspaceId/rules/:ruleId   # Update rule
DELETE /api/workspaces/:workspaceId/rules/:ruleId   # Delete rule
```

### References
```
GET    /api/workspaces/:workspaceId/references              # List references
POST   /api/workspaces/:workspaceId/references              # Create reference
GET    /api/workspaces/:workspaceId/references/:referenceId # Get specific reference
PUT    /api/workspaces/:workspaceId/references/:referenceId # Update reference
DELETE /api/workspaces/:workspaceId/references/:referenceId # Delete reference
```

### Chat Sessions
```
GET    /api/workspaces/:workspaceId/chat-sessions           # List sessions
POST   /api/workspaces/:workspaceId/chat-sessions           # Create session
GET    /api/workspaces/:workspaceId/chat-sessions/:sessionId # Get session
PUT    /api/workspaces/:workspaceId/chat-sessions/:sessionId # Update session
DELETE /api/workspaces/:workspaceId/chat-sessions/:sessionId # Delete session
POST   /api/workspaces/:workspaceId/chat-sessions/:sessionId/messages # Send message
```

### Chat Tabs (Legacy API)
```
POST   /api/chat-tabs                                    # Create chat tab
DELETE /api/chat-tabs/:tabId                            # Close chat tab
GET    /api/chat-tabs/:tabId/state                      # Get chat state
POST   /api/chat-tabs/:tabId/clear                      # Clear model
PUT    /api/chat-tabs/:tabId/model                      # Switch model
PUT    /api/chat-tabs/:tabId/settings                   # Update chat settings
POST   /api/chat-tabs/:tabId/references                 # Add reference to chat
DELETE /api/chat-tabs/:tabId/references/:referenceName  # Remove reference from chat
POST   /api/chat-tabs/:tabId/rules                      # Add rule to chat
DELETE /api/chat-tabs/:tabId/rules/:ruleName            # Remove rule from chat
```

### Settings
```
GET    /api/settings/:key                               # Get setting value
PUT    /api/settings/:key                               # Set setting value
GET    /api/settings/system-prompt                      # Get system prompt
PUT    /api/settings/system-prompt                      # Save system prompt
```

### MCP Servers
```
GET    /api/workspaces/:workspaceId/mcp-servers           # List servers
POST   /api/workspaces/:workspaceId/mcp-servers           # Create server
GET    /api/workspaces/:workspaceId/mcp-servers/:serverId # Get specific server
PUT    /api/workspaces/:workspaceId/mcp-servers/:serverId # Update server
DELETE /api/workspaces/:workspaceId/mcp-servers/:serverId # Delete server
POST   /api/workspaces/:workspaceId/mcp-servers/:serverId/test     # Test server
POST   /api/workspaces/:workspaceId/mcp-servers/:serverId/refresh  # Refresh server
```

### Legacy MCP Methods
```
GET    /api/mcp/servers                                 # Get server configs (legacy)
POST   /api/mcp/servers                                 # Save server config (legacy)
POST   /api/mcp/servers/:serverName/reload              # Reload server info (legacy)
DELETE /api/mcp/servers/:serverName                     # Delete server config (legacy)
POST   /api/mcp/servers/:serverName/ping                # Ping server (legacy)
POST   /api/mcp/servers/:serverName/tools/:toolName     # Call tool (legacy)
```

### LLM Providers
```
GET    /api/workspaces/:workspaceId/llm-providers           # List providers
POST   /api/workspaces/:workspaceId/llm-providers           # Create provider
GET    /api/workspaces/:workspaceId/llm-providers/:providerId # Get specific provider
PUT    /api/workspaces/:workspaceId/llm-providers/:providerId # Update provider
DELETE /api/workspaces/:workspaceId/llm-providers/:providerId # Delete provider
```

### Legacy LLM Methods
```
GET    /api/llm/providers                               # Get provider info (legacy)
POST   /api/llm/providers/:provider/validate            # Validate provider config (legacy)
GET    /api/llm/providers/:provider/models               # Get models for provider (legacy)
GET    /api/llm/providers/installed                     # Get installed providers (legacy)
POST   /api/llm/providers/:provider                      # Add provider (legacy)
DELETE /api/llm/providers/:provider                      # Remove provider (legacy)
GET    /api/llm/providers/:provider/config/:key          # Get provider config (legacy)
PUT    /api/llm/providers/:provider/config/:key          # Set provider config (legacy)
```

## Data Types

### Workspace
```typescript
interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}
```

### Rule
```typescript
interface Rule {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
```

### Reference
```typescript
interface Reference {
  id: string;
  name: string;
  content: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}
```

### ChatSession
```typescript
interface ChatSession {
  id: string;
  name: string;
  modelProvider: string;
  modelId: string;
  messages: ChatMessage[];
  settings: ChatSettings;
  createdAt: string;
  updatedAt: string;
}
```

### Tool
```typescript
interface Tool {
  id: string;
  name: string;
  description: string;
  server: string;
  serverName: string;
  enabled: boolean;
  parameters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

### MCPServer
```typescript
interface MCPServer {
  id: string;
  name: string;
  description: string;
  server: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

### LLMProvider
```typescript
interface LLMProvider {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### ChatTab (Legacy)
```typescript
interface ChatTab {
  id: string;
  modelProvider?: LLMType;
  modelId?: string;
  state: ChatState;
  settings: ChatSettings;
  references: string[];
  rules: string[];
  createdAt: string;
  updatedAt: string;
}
```

### ChatState
```typescript
interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  lastMessageId?: string;
  modelProvider?: LLMType;
  modelId?: string;
}
```

### ChatSettings
```typescript
interface ChatSettings {
  maxChatTurns: number;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
}
```

### ChatMessage
```typescript
interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: string;
  metadata?: Record<string, unknown>;
}
```

### Setting
```typescript
interface Setting {
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  description?: string;
  updatedAt: string;
}
```

### WorkspaceSwitchData
```typescript
interface WorkspaceSwitchData {
  windowId: string;
  workspacePath: string;
  targetWindowId: string;
}
```

### LLMProviderInfo
```typescript
interface LLMProviderInfo {
  name: string;
  type: string;
  description: string;
  configSchema: Record<string, unknown>;
  models: ILLMModel[];
}
```

### ILLMModel
```typescript
interface ILLMModel {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  maxTokens: number;
  capabilities: string[];
}
```

### ToolResult
```typescript
interface ToolResult {
  content: string;
  elapsedTimeMs: number;
  success: boolean;
  error?: string;
}
```

### MCPServerTestResult
```typescript
interface MCPServerTestResult {
  success: boolean;
  message: string;
  elapsedTimeMs: number;
  details?: Record<string, unknown>;
}
```

### MCPServerRefreshResult
```typescript
interface MCPServerRefreshResult {
  success: boolean;
  tools: Tool[];
  message: string;
  elapsedTimeMs: number;
}
```

### ChatSessionResponse
```typescript
interface ChatSessionResponse {
  sessionId: string;
  tabId: string;
  state: ChatState;
  settings: ChatSettings;
}
```

## Request/Response Examples

### Create Rule
```typescript
// Request
POST /api/workspaces/my-project/rules
{
  "name": "Code Style",
  "content": "Use consistent indentation and naming conventions."
}

// Response
{
  "id": "code-style",
  "name": "Code Style",
  "content": "Use consistent indentation and naming conventions.",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### Send Message
```typescript
// Request
POST /api/workspaces/my-project/chat-sessions/session-123/messages
{
  "content": "What is the best way to structure a React component?",
  "role": "user"
}

// Response
{
  "message": {
    "id": "msg-456",
    "content": "What is the best way to structure a React component?",
    "role": "user",
    "timestamp": "2024-01-15T10:30:00Z"
  },
  "response": {
    "id": "resp-789",
    "content": "Here are some best practices for structuring React components...",
    "role": "assistant",
    "timestamp": "2024-01-15T10:30:05Z"
  },
  "elapsedTimeMs": 5000
}
```

### Test Tool
```typescript
// Request
POST /api/workspaces/my-project/tools/weather-tool/test
{
  "parameters": {
    "location": "San Francisco",
    "units": "celsius"
  }
}

// Response
{
  "success": true,
  "result": {
    "content": "Temperature: 18°C, Condition: Partly Cloudy",
    "elapsedTimeMs": 250
  },
  "testedAt": "2024-01-15T10:30:00Z"
}
```

### Create Chat Tab
```typescript
// Request
POST /api/chat-tabs
{
  "modelProvider": "openai",
  "modelId": "gpt-4"
}

// Response
{
  "sessionId": "session-123",
  "tabId": "tab-456",
  "state": {
    "messages": [],
    "isStreaming": false,
    "modelProvider": "openai",
    "modelId": "gpt-4"
  },
  "settings": {
    "maxChatTurns": 50,
    "maxOutputTokens": 4000,
    "temperature": 0.7,
    "topP": 1.0
  }
}
```

### Update Chat Settings
```typescript
// Request
PUT /api/chat-tabs/tab-456/settings
{
  "maxChatTurns": 100,
  "maxOutputTokens": 8000,
  "temperature": 0.5,
  "topP": 0.9
}

// Response
{
  "maxChatTurns": 100,
  "maxOutputTokens": 8000,
  "temperature": 0.5,
  "topP": 0.9
}
```

### Get Setting Value
```typescript
// Request
GET /api/settings/theme

// Response
{
  "key": "theme",
  "value": "dark",
  "type": "string",
  "description": "Application theme preference",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### Set Setting Value
```typescript
// Request
PUT /api/settings/theme
{
  "value": "light"
}

// Response
{
  "key": "theme",
  "value": "light",
  "type": "string",
  "description": "Application theme preference",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### Call Tool (Legacy)
```typescript
// Request
POST /api/mcp/servers/weather-server/tools/get-weather
{
  "args": {
    "location": "San Francisco",
    "units": "celsius"
  }
}

// Response
{
  "content": "Temperature: 18°C, Condition: Partly Cloudy",
  "elapsedTimeMs": 250,
  "success": true
}
```

### Get Provider Info (Legacy)
```typescript
// Request
GET /api/llm/providers

// Response
{
  "openai": {
    "name": "OpenAI",
    "type": "api",
    "description": "OpenAI API provider",
    "configSchema": {
      "apiKey": { "type": "string", "required": true },
      "baseUrl": { "type": "string", "default": "https://api.openai.com/v1" }
    },
    "models": [
      {
        "id": "gpt-4",
        "name": "GPT-4",
        "provider": "openai",
        "contextLength": 8192,
        "maxTokens": 4096,
        "capabilities": ["chat", "completion"]
      }
    ]
  }
}
```

## Error Handling

### Standard Error Response
```typescript
{
  "error": "Error message describing what went wrong",
  "code": "ERROR_CODE", // Optional
  "details": {} // Optional additional context
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `204` - No Content (for deletions)
- `400` - Bad Request
- `404` - Not Found
- `500` - Internal Server Error

## Authentication (Future)

When the web app is implemented, authentication will be added:
- JWT tokens for API access
- OAuth integration for user management
- Role-based access control for workspaces
