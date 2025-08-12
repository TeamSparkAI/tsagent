# Migration Overview

## Goals

Transform the existing Electron application into a dual architecture that supports both:
1. **Desktop App**: Enhanced Electron app with improved API design
2. **Web App**: Future Next.js application sharing the same backend APIs

## Key Objectives

### 1. **API Separation**
- Separate Electron-coupled APIs from general-purpose backend APIs
- Create a RESTful API design for backend operations
- Maintain backward compatibility during migration

### 2. **Hybrid REST Implementation**
- Implement REST API within Electron using Express.js
- Support both direct method calls (no port) and HTTP access (optional port)
- Same API interface for both internal and external clients

### 3. **Resource-Oriented Design**
- Design APIs around resources (Workspaces, Rules, References, Tools, etc.)
- Use proper REST conventions with dynamic path parameters
- Support full CRUD operations for all resources

### 4. **Gradual Migration**
- Start with simple CRUD operations
- Allow toggling between old and new APIs
- No breaking changes to existing functionality

## Architecture Evolution

### **Current State**
```
Electron App (Monolithic)
├── Main Process (IPC handlers)
├── Renderer Process (React UI)
└── Mixed APIs (Electron + Backend)
```

### **Target State**
```
Desktop App (Electron)          Web App (Next.js)
├── Electron APIs               ├── React UI
├── Hybrid REST API             └── HTTP Client
│   ├── Direct calls (IPC)      └── Same API Interface
│   └── HTTP server (optional)
└── Shared Backend Logic
```

## Migration Phases

### **Phase 1: API Abstraction** (Weeks 1-2)
- Create `IElectronAPI` and `IBackendAPI` interfaces
- Implement REST API server within Electron
- Add direct method calls through IPC

### **Phase 2: Core Resources** (Weeks 3-4)
- Implement Workspaces, Rules, References APIs
- Create Smart API client with toggle capability
- Update UI components to use new APIs

### **Phase 3: Advanced Features** (Weeks 5-6)
- Implement Chat Sessions, Tools, MCP Servers APIs
- Add testing and execution endpoints
- Performance optimization and validation

### **Phase 4: Web App Foundation** (Future)
- Extract REST API to separate service
- Create Next.js application
- Implement authentication and real-time features

## Success Metrics

- [ ] All backend operations use REST API design
- [ ] Electron app can operate without HTTP server
- [ ] External clients can access API via HTTP
- [ ] No regression in existing functionality
- [ ] Improved code organization and maintainability
- [ ] Foundation ready for web app development

## Risk Mitigation

- **Backward Compatibility**: Maintain existing IPC APIs alongside new REST APIs
- **Gradual Rollout**: Migrate one resource type at a time
- **Toggle Testing**: Allow switching between old and new APIs
- **Performance Monitoring**: Ensure no performance degradation
- **Rollback Plan**: Can revert to existing APIs if issues arise

