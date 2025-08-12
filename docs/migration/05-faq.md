# Migration FAQ

## General Questions

### Q: Why are we doing this migration?
**A:** The migration transforms the monolithic Electron app into a dual architecture that supports both desktop and web applications. This provides:
- Better code organization and maintainability
- Foundation for a future web app
- Improved API design with proper REST conventions
- Better separation of concerns

### Q: Will this break existing functionality?
**A:** No. The migration is designed to be backward compatible:
- Existing IPC APIs remain functional throughout the migration
- New REST APIs are additive, not replacements
- Components can toggle between old and new APIs
- Rollback is possible at any point

### Q: How long will the migration take?
**A:** The migration is planned for 7 weeks, with each week focusing on specific components:
- Weeks 1-2: Infrastructure and API clients
- Weeks 3-4: Core resources (Workspaces, Rules, References)
- Weeks 5-6: Advanced features (Chat, Tools, MCP)
- Week 7: Integration and polish

## Technical Questions

### Q: Why use Express.js inside Electron?
**A:** Express.js provides:
- Standard REST API conventions
- Built-in middleware for CORS, JSON parsing, etc.
- Easy HTTP server management
- Familiar patterns for web developers
- Optional HTTP access for external clients

### Q: How does the hybrid approach work?
**A:** The hybrid approach provides two ways to access the same API:
1. **Direct calls** (default): Use IPC to call REST methods directly, no port needed
2. **HTTP calls** (optional): Enable HTTP server on port 3001 for external access

Both use the same REST API design and business logic.

### Q: What's the difference between IElectronAPI and IBackendAPI?
**A:**
- **IElectronAPI**: Electron-specific operations (window management, file dialogs, UI operations)
- **IBackendAPI**: General-purpose backend operations (workspace management, rules, references, etc.)

This separation allows the backend API to be extracted for the web app while keeping Electron-specific features in the desktop app.

### Q: How do workspace IDs work?
**A:** The API uses dynamic workspace IDs in paths like `/api/workspaces/:workspaceId/rules`. This:
- Supports multiple workspaces
- Provides proper REST resource hierarchy
- Allows future multi-tenant support
- Maintains workspace isolation

### Q: What happens to the current "current" workspace concept?
**A:** The current workspace becomes a workspace ID (e.g., "current-workspace" or the actual workspace path). The API maintains workspace context while supporting multiple workspaces.

## Implementation Questions

### Q: How do we handle the transition from existing APIs?
**A:** The transition is gradual:
1. Keep existing IPC APIs functional
2. Add new REST APIs alongside existing ones
3. Update components one by one to use new APIs
4. Add toggle controls to switch between old and new
5. Eventually deprecate old APIs (future phase)

### Q: What about performance?
**A:** Performance is a key consideration:
- Direct calls (IPC) are faster than HTTP calls
- HTTP server is disabled by default
- Performance monitoring throughout migration
- Optimization as needed

### Q: How do we test the migration?
**A:** Testing strategy includes:
- Unit tests for new API methods
- Integration tests for both direct and HTTP modes
- Performance testing comparing old vs new
- External client testing with curl/Postman
- UI testing with both API modes

### Q: What about error handling?
**A:** Error handling is consistent across both modes:
- Standard error response format
- Proper HTTP status codes
- Detailed error messages
- Graceful fallbacks

## Future Questions

### Q: When will the web app be built?
**A:** The web app is planned for Phase 4 (future), after the Electron migration is complete. The REST API design provides the foundation for the web app.

### Q: How will authentication work?
**A:** Authentication will be added when the web app is implemented:
- JWT tokens for API access
- OAuth integration
- Role-based access control
- Workspace-level permissions

### Q: What about real-time features?
**A:** Real-time features (WebSockets/SSE) will be added for the web app:
- Chat message streaming
- Real-time collaboration
- Live updates
- Socket.IO integration

### Q: How will the code be shared between apps?
**A:** The plan includes:
- Shared API interfaces
- Shared data types
- Shared business logic
- Monorepo structure
- Common validation and utilities

## Troubleshooting

### Q: What if the Express server fails to start?
**A:** The HTTP server is optional. The app can operate without it using direct calls. Check:
- Port 3001 availability
- Express.js dependencies
- CORS configuration
- Error logs

### Q: What if performance degrades?
**A:** Monitor performance and:
- Use direct calls by default
- Optimize database queries
- Add caching where appropriate
- Profile and optimize bottlenecks

### Q: What if external clients can't connect?
**A:** Ensure:
- HTTP server is enabled
- Port 3001 is accessible
- CORS is configured correctly
- Firewall settings allow connections

### Q: How do we rollback if needed?
**A:** Rollback options:
- Switch components back to legacy APIs
- Disable new REST APIs
- Revert specific commits
- Use feature flags for gradual rollback

## Best Practices

### Q: How should we structure the new code?
**A:** Follow these patterns:
- Clear separation between Electron and backend APIs
- Consistent error handling
- Proper TypeScript types
- Comprehensive testing
- Good documentation

### Q: How should we handle workspace context?
**A:** Always:
- Validate workspace exists before operations
- Use workspace ID in all API calls
- Maintain workspace isolation
- Handle workspace switching properly

### Q: How should we test the migration?
**A:** Test thoroughly:
- Both direct and HTTP modes
- All CRUD operations
- Error conditions
- Performance under load
- External client access

### Q: How should we document the changes?
**A:** Document:
- API changes and new endpoints
- Migration steps and timeline
- Testing procedures
- Troubleshooting guides
- Future roadmap

