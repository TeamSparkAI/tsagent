# Monorepo Structure for Code Sharing

## Overview

The monorepo structure is designed to maximize code sharing between the Electron desktop app and future Next.js web app, while maintaining clear separation of concerns and platform-specific functionality.

## Directory Structure

```
teamspark-workbench/
├── apps/
│   ├── desktop/                    # Electron app
│   │   ├── src/
│   │   │   ├── main/              # Main process (Electron-specific)
│   │   │   │   ├── electron-api/  # Electron API handlers
│   │   │   │   ├── rest-server.ts # Express server (shared logic)
│   │   │   │   └── main.ts        # Electron app entry point
│   │   │   ├── renderer/          # Renderer process (shared UI)
│   │   │   │   ├── components/    # React components (shared)
│   │   │   │   ├── hooks/         # React hooks (shared)
│   │   │   │   ├── utils/         # Utility functions (shared)
│   │   │   │   └── electron-ui/   # Electron-specific UI components
│   │   │   └── preload/           # Preload script (Electron-specific)
│   │   ├── package.json
│   │   └── electron-builder.json
│   │
│   └── web/                       # Next.js web app (future)
│       ├── src/
│       │   ├── app/               # Next.js app router
│       │   ├── components/        # React components (shared)
│       │   ├── hooks/             # React hooks (shared)
│       │   ├── utils/             # Utility functions (shared)
│       │   └── web-ui/            # Web-specific UI components
│       ├── package.json
│       └── next.config.js
│
├── packages/
│   ├── shared/
│   │   ├── api/                   # Shared API interfaces
│   │   │   ├── IElectronAPI.ts
│   │   │   ├── IBackendAPI.ts
│   │   │   └── types.ts
│   │   ├── backend/               # Shared backend logic
│   │   │   ├── services/          # Business logic services
│   │   │   │   ├── WorkspaceService.ts
│   │   │   │   ├── RulesService.ts
│   │   │   │   ├── ReferencesService.ts
│   │   │   │   ├── ChatService.ts
│   │   │   │   ├── ToolsService.ts
│   │   │   │   ├── MCPService.ts
│   │   │   │   └── LLMService.ts
│   │   │   ├── managers/          # State managers
│   │   │   │   ├── WorkspaceManager.ts
│   │   │   │   ├── RulesManager.ts
│   │   │   │   ├── ReferencesManager.ts
│   │   │   │   ├── ChatManager.ts
│   │   │   │   ├── ToolsManager.ts
│   │   │   │   └── LLMManager.ts
│   │   │   ├── validation/        # Input validation
│   │   │   │   ├── workspace.ts
│   │   │   │   ├── rules.ts
│   │   │   │   └── chat.ts
│   │   │   └── utils/             # Backend utilities
│   │   │       ├── file-system.ts
│   │   │       ├── encryption.ts
│   │   │       └── logging.ts
│   │   ├── client/                # Shared client logic
│   │   │   ├── api/               # API clients
│   │   │   │   ├── BaseAPIClient.ts
│   │   │   │   ├── ElectronAPIClient.ts
│   │   │   │   ├── HTTPAPIClient.ts
│   │   │   │   └── SmartAPIClient.ts
│   │   │   ├── hooks/             # React hooks for API
│   │   │   │   ├── useWorkspaces.ts
│   │   │   │   ├── useRules.ts
│   │   │   │   ├── useReferences.ts
│   │   │   │   ├── useChat.ts
│   │   │   │   └── useTools.ts
│   │   │   ├── stores/            # State management
│   │   │   │   ├── workspaceStore.ts
│   │   │   │   ├── chatStore.ts
│   │   │   │   └── settingsStore.ts
│   │   │   └── utils/             # Client utilities
│   │   │       ├── api-helpers.ts
│   │   │       ├── formatters.ts
│   │   │       └── validators.ts
│   │   ├── ui/                    # Shared UI components
│   │   │   ├── components/        # Base components
│   │   │   │   ├── Button/
│   │   │   │   ├── Input/
│   │   │   │   ├── Modal/
│   │   │   │   ├── Tabs/
│   │   │   │   └── Layout/
│   │   │   ├── hooks/             # UI hooks
│   │   │   │   ├── useModal.ts
│   │   │   │   ├── useForm.ts
│   │   │   │   └── useTheme.ts
│   │   │   ├── styles/            # Shared styles
│   │   │   │   ├── theme.ts
│   │   │   │   ├── components.css
│   │   │   │   └── variables.css
│   │   │   └── types/             # UI types
│   │   │       ├── components.ts
│   │   │       └── theme.ts
│   │   ├── types/                 # Shared TypeScript types
│   │   │   ├── api.ts
│   │   │   ├── workspace.ts
│   │   │   ├── chat.ts
│   │   │   ├── tools.ts
│   │   │   └── common.ts
│   │   ├── constants/             # Shared constants
│   │   │   ├── api.ts
│   │   │   ├── settings.ts
│   │   │   └── validation.ts
│   │   └── package.json
│   │
│   ├── backend-api/               # REST API implementation
│   │   ├── src/
│   │   │   ├── routes/            # Express routes
│   │   │   │   ├── workspaces.ts
│   │   │   │   ├── rules.ts
│   │   │   │   ├── references.ts
│   │   │   │   ├── chat.ts
│   │   │   │   ├── tools.ts
│   │   │   │   ├── mcp.ts
│   │   │   │   └── llm.ts
│   │   │   ├── middleware/        # Express middleware
│   │   │   │   ├── auth.ts
│   │   │   │   ├── validation.ts
│   │   │   │   ├── error-handling.ts
│   │   │   │   └── logging.ts
│   │   │   ├── controllers/       # Route controllers
│   │   │   │   ├── WorkspaceController.ts
│   │   │   │   ├── RulesController.ts
│   │   │   │   ├── ReferencesController.ts
│   │   │   │   ├── ChatController.ts
│   │   │   │   ├── ToolsController.ts
│   │   │   │   └── LLMController.ts
│   │   │   └── server.ts          # Express server setup
│   │   └── package.json
│   │
│   └── config/                    # Shared configuration
│       ├── eslint/                # ESLint configs
│       ├── typescript/            # TypeScript configs
│       ├── webpack/               # Webpack configs
│       └── package.json
│
├── tools/                         # Build and development tools
│   ├── scripts/
│   │   ├── build.ts
│   │   ├── dev.ts
│   │   ├── test.ts
│   │   └── lint.ts
│   └── package.json
│
├── docs/                          # Documentation
│   ├── migration/                 # Migration docs
│   ├── api/                       # API documentation
│   └── development/               # Development guides
│
├── package.json                   # Root package.json (workspaces)
├── tsconfig.json                  # Root TypeScript config
├── .eslintrc.js                   # Root ESLint config
├── .prettierrc                    # Root Prettier config
└── README.md
```

## Package.json Structure

### Root package.json
```json
{
  "name": "teamspark-workbench",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*",
    "tools"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "clean": "turbo run clean",
    "desktop": "npm run dev --filter=desktop",
    "web": "npm run dev --filter=web"
  },
  "devDependencies": {
    "turbo": "^1.10.0",
    "typescript": "^5.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  }
}
```

### Shared Package (packages/shared/package.json)
```json
{
  "name": "@teamspark/shared",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./api": "./dist/api/index.js",
    "./backend": "./dist/backend/index.js",
    "./client": "./dist/client/index.js",
    "./ui": "./dist/ui/index.js",
    "./types": "./dist/types/index.js"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "zustand": "^4.0.0"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

### Backend API Package (packages/backend-api/package.json)
```json
{
  "name": "@teamspark/backend-api",
  "version": "1.0.0",
  "main": "dist/index.js",
  "dependencies": {
    "@teamspark/shared": "workspace:*",
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "helmet": "^7.0.0"
  }
}
```

## Code Sharing Strategy

### 1. Shared Backend Logic
```typescript
// packages/shared/backend/services/WorkspaceService.ts
export class WorkspaceService {
  constructor(private workspaceManager: WorkspaceManager) {}

  async getWorkspaces(): Promise<Workspace[]> {
    // Shared business logic
    return this.workspaceManager.getWorkspaces();
  }

  async createWorkspace(data: CreateWorkspaceRequest): Promise<Workspace> {
    // Shared validation and business logic
    return this.workspaceManager.createWorkspace(data);
  }
}
```

### 2. Shared API Clients
```typescript
// packages/shared/client/api/BaseAPIClient.ts
export abstract class BaseAPIClient {
  abstract getRules(workspaceId: string): Promise<Rule[]>;
  abstract createRule(workspaceId: string, data: CreateRuleRequest): Promise<Rule>;
  // ... other methods
}

// packages/shared/client/api/HTTPAPIClient.ts
export class HTTPAPIClient extends BaseAPIClient {
  constructor(private baseUrl: string) {
    super();
  }

  async getRules(workspaceId: string): Promise<Rule[]> {
    const response = await fetch(`${this.baseUrl}/api/workspaces/${workspaceId}/rules`);
    return response.json();
  }
}
```

### 3. Shared React Hooks
```typescript
// packages/shared/client/hooks/useWorkspaces.ts
export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const api = useAPIClient(); // Gets appropriate client (Electron or HTTP)

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getWorkspaces();
      setWorkspaces(data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [api]);

  return { workspaces, loading, error, refetch: fetchWorkspaces };
}
```

### 4. Shared UI Components
```typescript
// packages/shared/ui/components/Button/Button.tsx
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  size = 'medium', 
  children, 
  onClick 
}) => {
  return (
    <button 
      className={`btn btn-${variant} btn-${size}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
```

## Platform-Specific Implementations

### Electron App (apps/desktop/)
```typescript
// apps/desktop/src/main/rest-server.ts
import { RestAPIServer } from '@teamspark/backend-api';
import { WorkspaceService } from '@teamspark/shared/backend';

export class ElectronRestServer extends RestAPIServer {
  constructor(workspaceManager: WorkspaceManager) {
    super();
    this.workspaceService = new WorkspaceService(workspaceManager);
  }
}

// apps/desktop/src/renderer/api/ElectronAPIClient.ts
import { BaseAPIClient } from '@teamspark/shared/client';

export class ElectronAPIClient extends BaseAPIClient {
  async getRules(workspaceId: string): Promise<Rule[]> {
    return window.restAPI.getRules(workspaceId);
  }
}
```

### Web App (apps/web/)
```typescript
// apps/web/src/app/api/workspaces/route.ts
import { WorkspaceController } from '@teamspark/backend-api';
import { WorkspaceService } from '@teamspark/shared/backend';

export async function GET() {
  const workspaceService = new WorkspaceService(workspaceManager);
  const controller = new WorkspaceController(workspaceService);
  return controller.getWorkspaces();
}

// apps/web/src/hooks/useAPIClient.ts
import { HTTPAPIClient } from '@teamspark/shared/client';

export function useAPIClient() {
  return new HTTPAPIClient(process.env.NEXT_PUBLIC_API_URL);
}
```

## Build and Development Setup

### Turbo Configuration (turbo.json)
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {
      "outputs": []
    }
  }
}
```

### TypeScript Configuration
```json
// tsconfig.json (root)
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "incremental": true
  },
  "references": [
    { "path": "packages/shared" },
    { "path": "packages/backend-api" },
    { "path": "apps/desktop" },
    { "path": "apps/web" }
  ]
}
```

## Migration Path

### Phase 1: Restructure Current Code
1. Move existing code to `apps/desktop/`
2. Extract shared logic to `packages/shared/`
3. Create `packages/backend-api/` with Express implementation
4. Update imports and dependencies

### Phase 2: Create Web App Foundation
1. Create `apps/web/` with Next.js
2. Implement shared UI components
3. Use shared API clients and hooks
4. Test code sharing between apps

### Phase 3: Optimize and Polish
1. Optimize bundle sizes
2. Implement proper tree-shaking
3. Add comprehensive testing
4. Document shared patterns

## Benefits of This Structure

### 1. **Maximum Code Sharing**
- Backend business logic shared 100%
- UI components shared 90%+
- API clients and hooks shared 100%
- Types and validation shared 100%

### 2. **Clear Separation**
- Platform-specific code isolated
- Shared code clearly identified
- Easy to understand dependencies

### 3. **Scalability**
- Easy to add new apps (mobile, CLI, etc.)
- Shared packages can be published to npm
- Independent versioning of packages

### 4. **Developer Experience**
- Single repository for all code
- Shared tooling and configuration
- Consistent development environment
- Easy to refactor across apps

### 5. **Build Optimization**
- Turbo for fast builds
- Shared caching and dependencies
- Tree-shaking for optimal bundles
- TypeScript project references

## How Code Sharing Actually Works

### Package Dependencies and Imports

Each shared package is a **separate npm package** with its own `package.json`, build process, and published artifacts. Here's how the dependencies flow:

#### Shared Package Dependencies
```json
// packages/shared/package.json
{
  "name": "@teamspark/shared",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./api": "./dist/api/index.js",
    "./backend": "./dist/backend/index.js",
    "./client": "./dist/client/index.js",
    "./ui": "./dist/ui/index.js",
    "./types": "./dist/types/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "zustand": "^4.0.0"
  }
}
```

#### App Dependencies on Shared Packages
```json
// apps/desktop/package.json
{
  "name": "teamspark-desktop",
  "dependencies": {
    "@teamspark/shared": "workspace:*",
    "@teamspark/backend-api": "workspace:*",
    "electron": "^25.0.0"
  }
}

// apps/web/package.json
{
  "name": "teamspark-web",
  "dependencies": {
    "@teamspark/shared": "workspace:*",
    "@teamspark/backend-api": "workspace:*",
    "next": "^14.0.0",
    "react": "^18.0.0"
  }
}
```

### Build Process for Shared Packages

#### 1. Shared Package Build
```typescript
// packages/shared/tsconfig.json
{
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

When you run `npm run build` in `packages/shared/`:
1. TypeScript compiles `src/` to `dist/`
2. Generates `.js`, `.d.ts`, and `.map` files
3. Creates a publishable npm package

#### 2. App Imports from Shared Packages
```typescript
// apps/desktop/src/renderer/components/RulesTab.tsx
import { useRules } from '@teamspark/shared/client';
import { Button } from '@teamspark/shared/ui';

// apps/web/src/components/RulesTab.tsx
import { useRules } from '@teamspark/shared/client';
import { Button } from '@teamspark/shared/ui';
```

### Workspace Dependencies (`workspace:*`)

The `workspace:*` syntax tells npm/yarn to:
1. **Link** the local package instead of downloading from npm
2. **Watch** for changes and rebuild automatically
3. **Share** the same node_modules for common dependencies

### Development Workflow

#### 1. Building Shared Packages
```bash
# Build all shared packages
npm run build --workspace=@teamspark/shared
npm run build --workspace=@teamspark/backend-api

# Or build all packages
npm run build
```

#### 2. Development Mode
```bash
# Start shared package in watch mode
npm run dev --workspace=@teamspark/shared

# Start desktop app (uses built shared packages)
npm run dev --workspace=teamspark-desktop
```

#### 3. Hot Reloading
When you change code in `packages/shared/src/`:
1. TypeScript recompiles to `packages/shared/dist/`
2. Apps automatically pick up the changes
3. Hot reloading works as expected

### Specific Import Examples

#### Backend Logic Sharing
```typescript
// packages/shared/src/backend/services/WorkspaceService.ts
export class WorkspaceService {
  async getWorkspaces(): Promise<Workspace[]> {
    // Shared business logic
  }
}

// apps/desktop/src/main/rest-server.ts
import { WorkspaceService } from '@teamspark/shared/backend';

// apps/web/src/app/api/workspaces/route.ts
import { WorkspaceService } from '@teamspark/shared/backend';
```

#### UI Component Sharing
```typescript
// packages/shared/src/ui/components/Button/Button.tsx
export const Button: React.FC<ButtonProps> = ({ children, ...props }) => {
  return <button className="btn" {...props}>{children}</button>;
};

// apps/desktop/src/renderer/components/SomeComponent.tsx
import { Button } from '@teamspark/shared/ui';

// apps/web/src/components/SomeComponent.tsx
import { Button } from '@teamspark/shared/ui';
```

#### API Client Sharing
```typescript
// packages/shared/src/client/api/BaseAPIClient.ts
export abstract class BaseAPIClient {
  abstract getRules(workspaceId: string): Promise<Rule[]>;
}

// packages/shared/src/client/api/HTTPAPIClient.ts
export class HTTPAPIClient extends BaseAPIClient {
  async getRules(workspaceId: string): Promise<Rule[]> {
    return fetch(`/api/workspaces/${workspaceId}/rules`).then(r => r.json());
  }
}

// apps/desktop/src/renderer/api/ElectronAPIClient.ts
export class ElectronAPIClient extends BaseAPIClient {
  async getRules(workspaceId: string): Promise<Rule[]> {
    return window.restAPI.getRules(workspaceId);
  }
}
```

### Build Output Structure

#### Shared Package Build Output
```
packages/shared/
├── src/                    # Source code
│   ├── backend/
│   ├── client/
│   └── ui/
├── dist/                   # Built artifacts
│   ├── backend/
│   │   ├── index.js
│   │   ├── index.d.ts
│   │   └── services/
│   ├── client/
│   │   ├── index.js
│   │   ├── index.d.ts
│   │   └── api/
│   └── ui/
│       ├── index.js
│       ├── index.d.ts
│       └── components/
└── package.json
```

#### App Build Output
```
apps/desktop/
├── dist/                   # Electron build
│   ├── main/
│   ├── renderer/
│   └── node_modules/       # Includes shared packages
└── package.json

apps/web/
├── .next/                  # Next.js build
│   ├── static/
│   └── server/
└── package.json
```

### Dependency Resolution

#### Node Modules Structure
```
node_modules/
├── @teamspark/
│   ├── shared/             # Symlink to packages/shared/dist
│   └── backend-api/        # Symlink to packages/backend-api/dist
├── react/                  # Shared dependency
├── electron/               # Desktop-only dependency
└── next/                   # Web-only dependency
```

### Development vs Production

#### Development
- Shared packages are **linked** (symlinks)
- Changes in shared packages immediately available
- Hot reloading works across packages
- No need to publish to npm

#### Production
- Shared packages can be **published to npm**
- Apps install from npm registry
- Versioned dependencies
- Optimized bundles

### Publishing Shared Packages (Optional)

```json
// packages/shared/package.json
{
  "name": "@teamspark/shared",
  "version": "1.0.0",
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "publish": "npm publish"
  }
}
```

```bash
# Publish shared package to npm
cd packages/shared
npm run build
npm publish

# Apps can then install from npm
npm install @teamspark/shared@latest
```

### Turbo Build Optimization

```json
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],  // Build dependencies first
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

This ensures:
1. Shared packages build before apps
2. Caching of build outputs
3. Parallel builds where possible
4. Incremental builds for faster development

### Summary: How It Actually Works

1. **Separate Packages**: Each shared package is a real npm package with its own build process
2. **Workspace Linking**: `workspace:*` creates symlinks instead of downloading from npm
3. **TypeScript Compilation**: Shared packages compile to `dist/` with types
4. **Import Resolution**: Apps import from the built artifacts
5. **Hot Reloading**: Changes in shared packages automatically rebuild and propagate
6. **Dependency Management**: npm/yarn handles all the linking and versioning
7. **Build Optimization**: Turbo ensures correct build order and caching

## Shared Backend API Architecture

### The Key Insight: Same Backend Logic, Different Entry Points

Both the Electron app and the Express/Next.js app use **exactly the same backend API library**, just with different entry points:

#### Shared Backend API Library
```typescript
// packages/backend-api/src/index.ts
export class BackendAPI {
  constructor(private workspaceManager: WorkspaceManager) {}

  // These methods are used by BOTH Electron and Express
  async getWorkspaces(): Promise<Workspace[]> {
    return this.workspaceManager.getWorkspaces();
  }

  async getRules(workspaceId: string): Promise<Rule[]> {
    const workspace = await this.workspaceManager.getWorkspace(workspaceId);
    return workspace.rulesManager.getRules();
  }

  async createRule(workspaceId: string, data: CreateRuleRequest): Promise<Rule> {
    const workspace = await this.workspaceManager.getWorkspace(workspaceId);
    return workspace.rulesManager.createRule(data);
  }
}
```

### Electron App: Direct Method Calls

```typescript
// apps/desktop/src/main/rest-server.ts
import { BackendAPI } from '@teamspark/backend-api';

export class ElectronRestServer {
  private backendAPI: BackendAPI;

  constructor(workspaceManager: WorkspaceManager) {
    // Electron creates the backend API instance
    this.backendAPI = new BackendAPI(workspaceManager);
  }

  // Electron calls backend methods directly
  async getRules(workspaceId: string): Promise<Rule[]> {
    return this.backendAPI.getRules(workspaceId);
  }

  async createRule(workspaceId: string, data: CreateRuleRequest): Promise<Rule> {
    return this.backendAPI.createRule(workspaceId, data);
  }
}

// apps/desktop/src/main/main.ts
ipcMain.handle('rest:get-rules', async (event, workspaceId) => {
  // Direct method call to shared backend API
  return restServer.getRules(workspaceId);
});
```

### Express/Next.js App: HTTP Route Handlers

```typescript
// apps/web/src/app/api/workspaces/[workspaceId]/rules/route.ts
import { BackendAPI } from '@teamspark/backend-api';

export async function GET(
  request: Request,
  { params }: { params: { workspaceId: string } }
) {
  // Next.js creates the same backend API instance
  const backendAPI = new BackendAPI(workspaceManager);
  
  // Next.js calls the same backend methods
  const rules = await backendAPI.getRules(params.workspaceId);
  
  return Response.json({ rules });
}

export async function POST(
  request: Request,
  { params }: { params: { workspaceId: string } }
) {
  const backendAPI = new BackendAPI(workspaceManager);
  const data = await request.json();
  
  // Same backend method call
  const rule = await backendAPI.createRule(params.workspaceId, data);
  
  return Response.json(rule, { status: 201 });
}
```

### Express App: Alternative Implementation

```typescript
// apps/web/src/server.ts (if using Express instead of Next.js)
import express from 'express';
import { BackendAPI } from '@teamspark/backend-api';

const app = express();
const backendAPI = new BackendAPI(workspaceManager);

// Express route handlers call the same backend methods
app.get('/api/workspaces/:workspaceId/rules', async (req, res) => {
  const rules = await backendAPI.getRules(req.params.workspaceId);
  res.json({ rules });
});

app.post('/api/workspaces/:workspaceId/rules', async (req, res) => {
  const rule = await backendAPI.createRule(req.params.workspaceId, req.body);
  res.status(201).json(rule);
});
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Shared Backend API                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           @teamspark/backend-api                    │   │
│  │                                                     │   │
│  │  class BackendAPI {                                 │   │
│  │    getWorkspaces()                                  │   │
│  │    getRules(workspaceId)                            │   │
│  │    createRule(workspaceId, data)                    │   │
│  │    // ... all business logic                        │   │
│  │  }                                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ (imported by both)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Electron App  │    │   Express App   │    │   Next.js App   │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │Direct Calls │ │    │ │HTTP Routes  │ │    │ │API Routes   │ │
│ │             │ │    │ │             │ │    │ │             │ │
│ │backendAPI.  │ │    │ │app.get('/   │ │    │ │GET /api/    │ │
│ │getRules()   │ │    │ │api/...')    │ │    │ │workspaces/  │ │
│ │             │ │    │ │             │ │    │ │...')        │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Key Benefits

### 1. **100% Code Sharing**
- Same business logic in all apps
- Same validation rules
- Same error handling
- Same data transformations

### 2. **Consistent Behavior**
- Identical API responses
- Same validation errors
- Same business rules
- Same performance characteristics

### 3. **Single Source of Truth**
- One place to update business logic
- One place to fix bugs
- One place to add features
- One place to test

### 4. **Platform Flexibility**
- Electron: Direct method calls (no HTTP overhead)
- Express: HTTP routes with middleware
- Next.js: API routes with serverless functions
- Future: Any other platform can use the same API

## Development Workflow

### 1. **Update Shared Logic**
```typescript
// packages/backend-api/src/services/WorkspaceService.ts
export class WorkspaceService {
  async getWorkspaces(): Promise<Workspace[]> {
    // Update business logic here
    return this.workspaceManager.getWorkspaces();
  }
}
```

### 2. **All Apps Automatically Updated**
- Electron app gets the changes immediately
- Express app gets the changes immediately  
- Next.js app gets the changes immediately
- No need to update multiple codebases

### 3. **Testing**
```typescript
// packages/backend-api/src/__tests__/WorkspaceService.test.ts
describe('WorkspaceService', () => {
  it('should get workspaces', async () => {
    const service = new WorkspaceService(mockWorkspaceManager);
    const workspaces = await service.getWorkspaces();
    expect(workspaces).toBeDefined();
  });
});
```

This test covers the logic for **all platforms** at once!
