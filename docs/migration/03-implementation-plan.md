# Implementation Plan

## Overview

This plan implements a hybrid REST API within the Electron app that supports both direct method calls (no port) and HTTP access (optional port) for external clients.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron App                             │
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   Renderer      │    │   Main Process  │                │
│  │   (React UI)    │    │                 │                │
│  │                 │    │                 │                │
│  │ ┌─────────────┐ │    │ ┌─────────────┐ │                │
│  │ │SmartRestAPI │◄┼────┼►│RestAPIServer│ │                │
│  │ │Client       │ │    │ │             │ │                │
│  │ │             │ │    │ │• Express    │ │                │
│  │ │• Direct     │ │    │ │• HTTP Routes│ │                │
│  │ │  calls      │ │    │ │• Direct     │ │                │
│  │ │• HTTP calls │ │    │ │  Methods    │ │                │
│  │ │• Toggle     │ │    │ │• Optional   │ │                │
│  │ └─────────────┘ │    │ │  Port       │ │                │
│  └─────────────────┘    │ └─────────────┘ │                │
│                         └─────────────────┘                │
│                                                             │
│  ┌─────────────────┐                                       │
│  │  External       │                                       │
│  │  Clients        │                                       │
│  │                 │                                       │
│  │ ┌─────────────┐ │                                       │
│  │ │HTTP Client  │◄┼─────── HTTP on port 3001 ─────────────┼─┐
│  │ │             │ │                                       │ │
│  │ │• curl       │ │                                       │ │
│  │ │• Postman    │ │                                       │ │
│  │ │• Web App    │ │                                       │ │
│  │ └─────────────┘ │                                       │ │
│  └─────────────────┘                                       │ │
└─────────────────────────────────────────────────────────────┘ │
                                                                │
┌─────────────────────────────────────────────────────────────┐ │
│                    Future Web App                           │ │
│                                                             │ │
│  ┌─────────────────┐                                       │ │
│  │  Next.js App    │                                       │ │
│  │                 │                                       │ │
│  │ ┌─────────────┐ │                                       │ │
│  │ │HTTP Client  │◄┼───────────────────────────────────────┼─┘
│  │ │             │ │                                       │
│  │ │• fetch()    │ │                                       │
│  │ │• Same API   │ │                                       │
│  │ └─────────────┘ │                                       │
│  └─────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)

#### 1.1 Create RestAPIServer
```typescript
// src/main/rest-api-server.ts
export class RestAPIServer {
  private app: express.Application;
  private server: any;
  private workspaceManager: WorkspaceManager;
  private port: number;
  private isHttpEnabled: boolean;

  constructor(workspaceManager: WorkspaceManager, port: number = 3001) {
    this.workspaceManager = workspaceManager;
    this.port = port;
    this.isHttpEnabled = false;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  // HTTP Server Management
  public enableHttpServer(): Promise<void> { /* ... */ }
  public disableHttpServer(): Promise<void> { /* ... */ }
  public isHttpServerEnabled(): boolean { /* ... */ }

  // Direct API Methods (same interface for both HTTP and IPC)
  async getWorkspaces(): Promise<Workspace[]> { /* ... */ }
  async getRules(workspaceId: string): Promise<Rule[]> { /* ... */ }
  async createRule(workspaceId: string, data: CreateRuleRequest): Promise<Rule> { /* ... */ }
  // ... other methods
}
```

#### 1.2 Update Main Process
```typescript
// src/main/main.ts
import { RestAPIServer } from './rest-api-server';

let restAPIServer: RestAPIServer | null = null;

function setupIpcHandlers(mainWindow: BrowserWindow | null) {
  // Initialize REST API server
  if (workspacesManager) {
    const currentWorkspace = workspacesManager.getCurrentWorkspace();
    if (currentWorkspace) {
      restAPIServer = new RestAPIServer(currentWorkspace);
    }
  }

  // New REST-style IPC handlers
  ipcMain.handle('rest:get-rules', async (event, workspaceId) => {
    if (!restAPIServer) {
      throw new Error('REST API server not initialized');
    }
    return restAPIServer.getRules(workspaceId);
  });

  // HTTP Server Management
  ipcMain.handle('rest:enable-http-server', async (event) => {
    if (!restAPIServer) {
      throw new Error('REST API server not initialized');
    }
    return restAPIServer.enableHttpServer();
  });

  // ... other handlers
}
```

#### 1.3 Update Preload Script
```typescript
// src/preload/preload.ts
// Legacy IPC API (for backward compatibility)
const legacyAPI = {
  getRules: () => ipcRenderer.invoke('rules:get-rules'),
  saveRule: (rule: any) => ipcRenderer.invoke('rules:save-rule', rule),
  // ... existing methods
};

// New REST-style API (direct calls)
const restAPI = {
  getRules: (workspaceId: string) => ipcRenderer.invoke('rest:get-rules', workspaceId),
  createRule: (workspaceId: string, data: any) => ipcRenderer.invoke('rest:create-rule', workspaceId, data),
  // ... other REST methods

  // HTTP Server Management
  enableHttpServer: () => ipcRenderer.invoke('rest:enable-http-server'),
  disableHttpServer: () => ipcRenderer.invoke('rest:disable-http-server'),
  isHttpServerEnabled: () => ipcRenderer.invoke('rest:is-http-server-enabled'),
};

// Expose APIs to renderer
contextBridge.exposeInMainWorld('api', legacyAPI);
contextBridge.exposeInMainWorld('restAPI', restAPI);
```

### Phase 2: API Clients (Week 2-3)

#### 2.1 Create Direct API Client
```typescript
// src/renderer/api/DirectRestAPIClient.ts
export class DirectRestAPIClient {
  async getRules(workspaceId: string): Promise<Rule[]> {
    return window.restAPI.getRules(workspaceId);
  }

  async createRule(workspaceId: string, data: CreateRuleRequest): Promise<Rule> {
    return window.restAPI.createRule(workspaceId, data);
  }

  // ... other methods
}
```

#### 2.2 Create HTTP API Client
```typescript
// src/renderer/api/HttpRestAPIClient.ts
export class HttpRestAPIClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  async getRules(workspaceId: string): Promise<Rule[]> {
    const response = await this.request<{ rules: Rule[] }>(`/api/workspaces/${workspaceId}/rules`);
    return response.rules;
  }

  async createRule(workspaceId: string, data: CreateRuleRequest): Promise<Rule> {
    return this.request<Rule>(`/api/workspaces/${workspaceId}/rules`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ... other methods
}
```

#### 2.3 Create Smart API Client
```typescript
// src/renderer/api/SmartRestAPIClient.ts
export class SmartRestAPIClient {
  private directClient: DirectRestAPIClient;
  private httpClient: HttpRestAPIClient;
  private useDirect: boolean;

  constructor(useDirect: boolean = true) {
    this.directClient = new DirectRestAPIClient();
    this.httpClient = new HttpRestAPIClient();
    this.useDirect = useDirect;
  }

  async getRules(workspaceId: string): Promise<Rule[]> {
    if (this.useDirect) {
      return this.directClient.getRules(workspaceId);
    } else {
      return this.httpClient.getRules(workspaceId);
    }
  }

  // Configuration
  setUseDirect(useDirect: boolean) {
    this.useDirect = useDirect;
  }

  // HTTP Server Management
  async enableHttpServer(): Promise<void> {
    return window.restAPI.enableHttpServer();
  }

  // ... other methods
}
```

### Phase 3: Core Resources (Week 3-4)

#### 3.1 Implement Workspaces API
- Full CRUD operations for workspaces
- Workspace context validation
- Integration with existing workspace management

#### 3.2 Implement Rules API
- Migrate existing rules functionality
- Add workspace context
- Update UI components to use new API

#### 3.3 Implement References API
- Migrate existing references functionality
- Add workspace context
- Update UI components to use new API

### Phase 4: Advanced Features (Week 5-6)

#### 4.1 Implement Chat Sessions API
- Session management with workspace context
- Message handling
- Model switching and settings

#### 4.2 Implement Tools API
- Full CRUD for tools
- Tool testing and execution
- MCP server integration

#### 4.3 Implement MCP Servers API
- Server configuration management
- Server testing and refresh
- Tool discovery and management

### Phase 5: UI Integration (Week 6-7)

#### 5.1 Update Components
```typescript
// src/renderer/components/RulesTab.tsx
export const RulesTab: React.FC = () => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [useDirectAPI, setUseDirectAPI] = useState(true);
  const api = new SmartRestAPIClient(useDirectAPI);

  useEffect(() => {
    loadRules();
  }, [useDirectAPI]);

  const loadRules = async () => {
    try {
      const rulesData = await api.getRules('current-workspace');
      setRules(rulesData);
    } catch (error) {
      console.error('Error loading rules:', error);
    }
  };

  return (
    <div>
      <div className="api-toggle">
        <label>
          <input
            type="checkbox"
            checked={useDirectAPI}
            onChange={(e) => setUseDirectAPI(e.target.checked)}
          />
          Use Direct API (No Port)
        </label>
      </div>
      
      {/* Rules UI */}
    </div>
  );
};
```

#### 5.2 Add HTTP Server Controls
```typescript
// Settings or debug panel
const HttpServerControls: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const api = new SmartRestAPIClient();

  const toggleServer = async () => {
    if (isEnabled) {
      await api.disableHttpServer();
      setIsEnabled(false);
    } else {
      await api.enableHttpServer();
      setIsEnabled(true);
    }
  };

  return (
    <div>
      <button onClick={toggleServer}>
        {isEnabled ? 'Disable' : 'Enable'} HTTP Server
      </button>
      <p>HTTP Server: {isEnabled ? 'Running on port 3001' : 'Disabled'}</p>
    </div>
  );
};
```

## File Structure

```
src/
├── main/
│   ├── rest-api-server.ts          # Express server with REST API
│   ├── main.ts                     # Updated with REST API initialization
│   └── api/                        # API route handlers (future)
├── renderer/
│   ├── api/
│   │   ├── DirectRestAPIClient.ts  # Direct method calls (IPC)
│   │   ├── HttpRestAPIClient.ts    # HTTP method calls
│   │   └── SmartRestAPIClient.ts   # Smart client with toggle
│   └── components/                 # Updated UI components
├── preload/
│   └── preload.ts                  # Updated with REST API exposure
└── shared/
    ├── api/
    │   ├── IElectronAPI.ts         # Electron-specific API interface
    │   └── IBackendAPI.ts          # Backend API interface
    └── types/                      # API data types
```

## Testing Strategy

### 1. Direct API Testing
```typescript
// Test direct method calls
const api = new SmartRestAPIClient(true);
const rules = await api.getRules('test-workspace');
```

### 2. HTTP API Testing
```typescript
// Test HTTP method calls
const api = new SmartRestAPIClient(false);
await api.enableHttpServer();
const rules = await api.getRules('test-workspace');
```

### 3. External Client Testing
```bash
# Test with curl
curl -X GET http://localhost:3001/api/workspaces/test-workspace/rules
curl -X POST http://localhost:3001/api/workspaces/test-workspace/rules \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "content": "Test content"}'
```

### 4. Performance Testing
- Compare direct vs HTTP call performance
- Monitor memory usage
- Validate no regression in existing functionality

## Migration Checklist

### Phase 1: Infrastructure
- [ ] Create RestAPIServer class
- [ ] Add Express.js dependencies
- [ ] Update main process initialization
- [ ] Add REST-style IPC handlers
- [ ] Update preload script

### Phase 2: API Clients
- [ ] Create DirectRestAPIClient
- [ ] Create HttpRestAPIClient
- [ ] Create SmartRestAPIClient
- [ ] Add HTTP server management

### Phase 3: Core Resources
- [ ] Implement Workspaces API
- [ ] Implement Rules API
- [ ] Implement References API
- [ ] Update UI components

### Phase 4: Advanced Features
- [ ] Implement Chat Sessions API
- [ ] Implement Tools API
- [ ] Implement MCP Servers API
- [ ] Add testing and execution endpoints

### Phase 5: Integration
- [ ] Update all UI components
- [ ] Add API toggle controls
- [ ] Add HTTP server controls
- [ ] Performance testing and optimization

## Success Criteria

- [ ] All backend operations use REST API design
- [ ] Electron app operates without HTTP server by default
- [ ] HTTP server can be enabled for external access
- [ ] No regression in existing functionality
- [ ] Performance is maintained or improved
- [ ] Code is more organized and maintainable
- [ ] Foundation is ready for web app development

