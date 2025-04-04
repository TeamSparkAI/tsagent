# Workspace Management Design

## Overview
The application will support multiple workspaces, where each workspace is a completely independent configuration environment. Workspaces can be opened in separate windows, but the application itself will run as a single instance. The application supports both GUI and CLI modes, which can run simultaneously.

## Single Instance Behavior
- The application will use `app.requestSingleInstanceLock()` to ensure only one GUI instance runs
- When a user tries to launch a second GUI instance:
  - The second instance will quit
  - The first instance will receive focus
- CLI instances are not affected by the single instance lock and can run alongside GUI instances

## CLI Mode
The application supports running in CLI mode with the following characteristics:

### CLI Instance Behavior
- CLI instances can run alongside GUI instances
- Each CLI instance must be associated with a workspace
- CLI instances do not maintain shared state with GUI instances
- CLI instances can perform all workspace operations (references, rules, etc.)

### CLI Workspace Selection
The CLI must be launched with a valid workspace in one of two ways:
1. Specify the workspace path explicitly:
   ```bash
   app --cli /path/to/workspace
   ```
2. Launch from within a workspace directory:
   ```bash
   cd /path/to/workspace
   app --cli
   ```

To create a new workspace, use the `--create` parameter:
```bash
# Create workspace in specified directory
app --cli --create /path/to/new/workspace

# Create workspace in current directory
app --cli --create
```

The CLI will:
- Validate that the specified directory contains a valid `workspace.json` file before starting the interactive session
- If `--create` is specified, create a new workspace in the specified directory (or current directory if none specified)
- If creating a workspace, ensure the directory is empty or prompt for confirmation

### CLI and GUI Interaction
- CLI instances can operate on the same workspaces as GUI instances
- CLI operations are independent of GUI state
- CLI instances do not affect GUI window management
- GUI instances do not affect CLI operations

## Workspace Structure
Each workspace consists of:
- A unique directory containing:
  - `workspace.json` - The main configuration file (renamed from config.json)
  - `mcp_config.json` - The MCP confuguration file
  - References directory and files
  - Rules directory and files
  - Other workspace-specific data

## Window Management
- Each GUI window is associated with exactly one workspace
- Windows are completely independent of each other
- The only shared state between windows is:
  - List of open windows and their associated workspaces
  - Recent workspaces list
  - Last active workspace

## Workspace Tab
The Workspace tab provides workspace management functionality for the current window:

### Tab Visibility
- The Workspace tab is always visible
- Other tabs (References, Rules, etc.) are only visible when a workspace is loaded

### Workspace Tab Sections

1. **Open Workspace**
   - Button to open file dialog
   - Only allows selection of directories containing a `workspace.json` file
   - Validates workspace structure before loading

2. **Create Workspace**
   - Button to open file dialog
   - Only allows selection of empty directories
   - Creates `workspace.json` and initial workspace structure
   - Automatically loads the new workspace

3. **Switch to Workspace**
   - List of currently open windows and their workspaces
   - Each entry shows:
     - Workspace name
     - Workspace path
     - Window status (minimized, active, etc.)
   - Clicking an entry switches to that window

4. **Open Recent**
   - List of recently used workspaces (excluding currently open ones)
   - Each entry shows:
     - Workspace name
     - Last accessed date
     - Workspace path
   - Clicking an entry:
     - If workspace not open: Creates new window with that workspace
     - If workspace open: Switches to that window

### Workspace Tab States

1. **No Workspace Loaded**
   - Only Workspace tab visible
   - Other tabs hidden
   - "Open Workspace" and "Create Workspace" options prominent

2. **Workspace Loaded**
   - All tabs visible
   - All workspace management options available

## Recent Workspaces
- Maintain a list of recently used workspaces
- Store the list in `workspaces.json` in the user data directory
- Limit to a reasonable number of entries (e.g., 10)
- Update the list when:
  - A workspace is opened
  - A workspace is created
  - A workspace is closed

## Workspace Manager
The `WorkspaceManager` class will handle:
- Tracking active windows and their workspaces
- Managing the recent workspaces list
- Checking if a workspace is already in use
- Providing the last active workspace

```typescript
class WorkspaceManager {
    private activeWindows: Map<string, WorkspaceWindow>;
    private recentWorkspaces: string[];
    private lastActiveWorkspace: string | null;

    registerWindow(windowId: string, workspacePath: string);
    unregisterWindow(windowId: string);
    isWorkspaceInUse(workspacePath: string): boolean;
    getLastActiveWorkspace(): string | null;
    getActiveWindows(): WorkspaceWindow[];
    addRecentWorkspace(workspacePath: string);
    getRecentWorkspaces(): string[];
}
```

## Configuration Manager
Each window will have its own `ConfigManager` instance tied to its workspace:

```typescript
class ConfigManager {
    private workspacePath: string;

    constructor(workspacePath: string) {
        this.workspacePath = workspacePath;
        this.ensureWorkspaceExists();
    }

    private getConfigPath() {
        return path.join(this.workspacePath, 'workspace.json');
    }

    // ... workspace-specific configuration methods
}
```

## User Experience Flow
1. First Launch:
   - Create main window
   - Show Workspace tab
   - Hide other tabs until workspace is loaded
   - Allow user to:
     - Open existing workspace
     - Create new workspace
     - Switch to open workspace
     - Open recent workspace

2. Subsequent Launches:
   - If any window is open
     - Focus on existing window
   - If no other window is open
     - Create window
     - If there is a most recently used workspace, open that workspace in this window
   - Show Workspace tab
   - If no workspace loaded, hide other tabs
   - Provide same workspace management options

3. Workspace Management:
   - Users can have multiple workspaces open simultaneously
   - Each workspace runs in its own window
   - Workspaces are completely independent
   - Recent workspaces are easily accessible via Workspace tab

## Implementation Notes
- Use IPC for communication between main and renderer processes
- Store workspace data in the user's application data directory
- Implement proper error handling for workspace operations
- Provide clear feedback when workspaces are in use
- Ensure smooth transitions when switching workspaces
- Validate workspace structure before loading
- Handle workspace creation and initialization
- Update all references to config.json to use workspace.json instead

# Workspace Management Implementation Plan

## Implementation Strategy

This document outlines a phased approach to implementing workspace management functionality. Each phase should be completed and tested before moving to the next.

### Important Guidelines

1. **DO NOT** modify build configurations, webpack settings, or IPC mechanisms
2. **DO NOT** restructure the project directory layout
3. **DO NOT** add new dependencies unless explicitly required
4. **DO NOT** modify existing functionality that works correctly
5. **DO** implement each phase as a separate, testable component
6. **DO** test each phase before moving to the next

## Phase 1: Workspace Data Structure

### Requirements
- Define the workspace data structure
- Implement workspace file validation
- Create functions to read/write workspace files

### Implementation Details
- Create a `WorkspaceManager` class that handles:
  - Reading/writing workspace.json files
  - Validating workspace structure
  - Managing workspace metadata

### Testing Criteria
- Can create a new workspace file
- Can read an existing workspace file
- Can validate workspace structure
- Can detect invalid workspaces

## Phase 2: Workspace State Management

### Requirements
- Track active windows and their workspaces
- Maintain recent workspaces list
- Provide workspace status information

### Implementation Details
- Extend `WorkspaceManager` to:
  - Track active windows and their workspaces
  - Manage recent workspaces list
  - Check if a workspace is already in use
  - Provide the last active workspace

### Testing Criteria
- Can register a window with a workspace
- Can unregister a window
- Can check if a workspace is in use
- Can retrieve active windows
- Can manage recent workspaces list

## Phase 3: Workspace UI Components

### Requirements
- Add workspace management UI to the existing tab system
- Implement workspace selection and creation dialogs
- Display active and recent workspaces

### Implementation Details
- Add a Workspace tab to the existing tab system
- Implement UI components for:
  - Opening existing workspaces
  - Creating new workspaces
  - Switching between workspaces
  - Viewing recent workspaces

### Testing Criteria
- Workspace tab appears in the UI
- Can open the workspace selection dialog
- Can create a new workspace
- Can switch between workspaces
- Can view recent workspaces

## Phase 4: Workspace IPC Integration

### Requirements
- Connect UI components to workspace management functionality
- Implement IPC handlers for workspace operations

### Implementation Details
- Add IPC handlers for:
  - Opening workspaces
  - Creating workspaces
  - Switching workspaces
  - Getting active windows
  - Getting recent workspaces

### Testing Criteria
- UI actions trigger appropriate IPC calls
- IPC handlers correctly interact with WorkspaceManager
- Workspace operations work end-to-end

## Phase 5: CLI Mode Implementation

### Requirements
- Support workspace operations in CLI mode
- Handle workspace selection via command line

### Implementation Details
- Implement CLI-specific workspace handling
- Add command line arguments for workspace operations

### Testing Criteria
- Can launch CLI with a specific workspace
- Can create workspaces from CLI
- CLI operations work independently of GUI

## Implementation Notes

### Workspace Structure
Each workspace consists of:
- A unique directory containing:
  - `workspace.json` - The main configuration file
  - References directory and files
  - Rules directory and files
  - Other workspace-specific data

### WorkspaceManager Class
```typescript
class WorkspaceManager {
    private activeWindows: Map<string, WorkspaceWindow>;
    private recentWorkspaces: string[];
    private lastActiveWorkspace: string | null;

    registerWindow(windowId: string, workspacePath: string);
    unregisterWindow(windowId: string);
    isWorkspaceInUse(workspacePath: string): boolean;
    getLastActiveWorkspace(): string | null;
    getActiveWindows(): WorkspaceWindow[];
    addRecentWorkspace(workspacePath: string);
    getRecentWorkspaces(): string[];
}
```

### Workspace Tab UI
The Workspace tab should include:
1. **Open Workspace** - Button to open file dialog
2. **Create Workspace** - Button to open file dialog
3. **Switch to Workspace** - List of currently open windows
4. **Open Recent** - List of recently used workspaces

### Validation Steps
After each phase:
1. Verify that existing functionality still works
2. Test the new functionality in isolation
3. Test the integration with existing components
4. Document any issues or edge cases discovered 