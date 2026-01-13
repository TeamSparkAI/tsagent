# Render from History Design

## Overview

This document outlines the design for a history-based rendering system for the Ink-based TUI CLI application. This approach addresses terminal resize rendering corruption issues while providing a foundation for session save/restore functionality.

## Rationale

### Problem Statement

When terminal windows are resized (especially made narrower), Ink's internal line tracking becomes corrupted. This causes degenerate redraw behavior where:

1. Box components wrap incorrectly
2. New boxes are painted under broken wrapped remains of previous boxes
3. This corruption cascades, causing multiple incorrect renders
4. The corruption persists because Ink's line position tracking is broken

### Why History-Based Rendering Solves This

1. **Resize Handling**: On terminal width change, we can clear scrollback and re-render the entire history from scratch, resetting Ink's corrupted line tracking
2. **Navigation Simplification**: History naturally models navigation stacks (menus, submenus) - push/pop operations become straightforward
3. **Session Persistence**: History entries are serializable data structures, making save/restore trivial
4. **Async Updates**: Components remain normal React components - async operations update history entries, not component state

## Design Principles

### Core Concepts

1. **History Contains Static Content Only**: History entries are non-interactive, static elements that represent completed actions or results
2. **Interactive Components Are Transient**: Interactive components (menus, inputs, dialogs) exist temporarily outside the history and are not serialized
3. **Results Become History**: When an interactive component completes, it adds a static summary entry to history (e.g., "Provider OpenAI selected", "MCP dialog dismissed")
4. **Full Re-render on Resize**: Only clear scrollback and force full re-render when width changes
5. **No Interaction State Serialization**: Interactive state is never saved - only final results are stored in history

### Architecture

```
┌─────────────────────────────────────────┐
│         History Manager                 │
│  - Maintains static history stack       │
│  - Handles push operations (results)    │
│  - Detects resize events                │
│  - Manages full re-render on resize     │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│      Persistent Ink App                 │
│  - Renders static history stack         │
│  - Renders transient interactive layer  │
│  - Clears scrollback on resize          │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌──────────────────┐   ┌──────────────────┐
│  Static History  │   │  Interactive     │
│  Components      │   │  Components      │
│  (from history)  │   │  (transient)     │
└──────────────────┘   └──────────────────┘
```

### Interactive vs Static Components

**Static (History Entries):**
- Command output/results
- Status messages
- Completed action summaries
- Error messages
- Information displays

**Interactive (Transient):**
- Menus (provider list, MCP server list, etc.)
- Input prompts
- Confirmation dialogs
- Navigation dialogs
- Any component requiring user interaction

**Flow:**
1. User triggers command (e.g., `/provider`)
2. Interactive component renders (transient, not in history)
3. User interacts (navigates, selects, etc.)
4. Interaction completes
5. Static summary added to history (e.g., "Provider OpenAI selected")
6. Interactive component unmounts

## Data Structures

### History Entry

History entries are **static, non-interactive** elements representing completed actions or results. There are two main categories:

1. **Command entries**: Results from CLI commands (type: `'command'`, id: command name)
2. **Non-command entries**: Agent messages, responses, errors, status messages, etc.

```typescript
type HistoryEntry = {
  type: string;                    // Entry type identifier
  id: string;                      // Unique identifier for this entry
  props: Record<string, any>;      // Serializable props (no functions, no interaction state)
  timestamp?: number;              // Optional: when entry was created
};

// Command entries use type 'command' and command name as id
type CommandHistoryEntry = {
  type: 'command';
  id: string;                      // Command name (e.g., '/provider', '/mcp')
  props: Record<string, any>;      // Command-specific result data
  timestamp?: number;
};

// Non-command entries (agent messages, errors, etc.)
type NonCommandHistoryEntry =
  | { type: 'agent-message'; id: string; props: { content: string; role: 'user' | 'assistant' } }
  | { type: 'agent-response'; id: string; props: { content: string } }
  | { type: 'error'; id: string; props: { message: string } }
  | { type: 'status'; id: string; props: { message: string } }
  | { type: 'text'; id: string; props: { content: string } }
  // ... etc

// Example command entries:
// { type: 'command', id: '/provider', props: { providerId: 'openai', message: 'Provider OpenAI selected' } }
// { type: 'command', id: '/mcp', props: { serverName: 'server1', action: 'view-tools' } }
```

### History Manager State

```typescript
type HistoryState = {
  entries: HistoryEntry[];          // Static history entries only
  terminalWidth: number;
  forceFullRender: boolean;          // Flag to trigger full re-render
  activeInteractive?: InteractiveComponent; // Current transient interactive component
};
```

### Interactive Component (Transient)

```typescript
type InteractiveComponent = {
  type: string;                      // Component type (e.g., 'provider-list', 'command-input')
  props: Record<string, any>;        // Component props
  onComplete: (result: any) => void; // Callback when interaction completes
  onCancel?: () => void;             // Optional cancel callback
};
```

### Session (for save/restore)

Since history only contains static entries, serialization is straightforward:

```typescript
type Session = {
  history: HistoryEntry[];            // Only static entries - no interaction state
  version: string;                    // Schema version for compatibility
};

// No transient state needed - interactive components are never saved
```

## Implementation Details

### 1. History Manager

**Responsibilities:**
- Maintain history stack
- Handle push/pop operations
- Detect terminal resize events
- Trigger full re-render on resize
- Provide API for components to update history

**Key Functions:**

```typescript
class HistoryManager {
  private history: HistoryEntry[] = [];
  private activeInteractive: InteractiveComponent | null = null;
  private terminalWidth: number;
  private listeners: Set<() => void> = new Set();

  // Push static entry to history (only for completed results)
  push(entry: HistoryEntry): void {
    this.history = [...this.history, entry];
    this.notifyListeners();
  }

  // Get current history (static entries only)
  getHistory(): HistoryEntry[] {
    return this.history;
  }

  // Set active interactive component (transient, not in history)
  setActiveInteractive(component: InteractiveComponent | null): void {
    this.activeInteractive = component;
    this.notifyListeners();
  }

  // Get active interactive component
  getActiveInteractive(): InteractiveComponent | null {
    return this.activeInteractive;
  }

  // Handle resize - clear scrollback and force full re-render
  handleResize(newWidth: number): void {
    if (newWidth !== this.terminalWidth) {
      this.terminalWidth = newWidth;
      // Clear scrollback
      process.stdout.write('\u001b[2J\u001b[H');
      // Force full re-render (history + active interactive)
      this.notifyListeners();
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
```

**Note:** History entries are append-only. We don't need `pop()` or `update()` since history only contains static results that don't change.

### 2. Persistent Ink App

**Responsibilities:**
- Render static history stack
- Render transient interactive component (if any)
- Handle resize events
- Provide context for components

**Structure:**

```typescript
function PersistentApp() {
  const historyManager = useHistoryManager();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeInteractive, setActiveInteractive] = useState<InteractiveComponent | null>(null);
  const [width, setWidth] = useState(process.stdout.columns);

  // Subscribe to history changes
  useEffect(() => {
    const unsubscribe = historyManager.subscribe(() => {
      setHistory([...historyManager.getHistory()]);
      setActiveInteractive(historyManager.getActiveInteractive() || null);
    });
    return unsubscribe;
  }, []);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const newWidth = process.stdout.columns;
      historyManager.handleResize(newWidth);
      setWidth(newWidth);
    };

    process.stdout.on('resize', handleResize);
    return () => process.stdout.off('resize', handleResize);
  }, []);

  return (
    <HistoryContext.Provider value={historyManager}>
      <Box flexDirection="column">
        {/* Render static history */}
        {history.map(entry => (
          <HistoryEntryRenderer key={entry.id} entry={entry} />
        ))}
        
        {/* Render transient interactive component (if any) */}
        {activeInteractive && (
          <InteractiveComponentRenderer component={activeInteractive} />
        )}
      </Box>
    </HistoryContext.Provider>
  );
}
```

### 3. Component Rendering

**History Entry Renderer:**

History entries are rendered by routing to the appropriate command or handling non-command entries:

```typescript
import React from 'react';
import { Text } from 'ink';
import { findCommandForHistoryEntry } from '../commands/index.js';
import type { HistoryEntry } from './types.js';

export function HistoryEntryRenderer({ entry }: { entry: HistoryEntry }) {
  // Command entries are rendered by their command object
  if (entry.type === 'command') {
    const command = findCommandForHistoryEntry(entry);
    if (command) {
      return command.renderHistoryEntry(entry);
    }
  }
  
  // Non-command entries (agent messages, errors, etc.)
  switch (entry.type) {
    case 'agent-message':
      return <Text>{entry.props.content}</Text>;
    case 'agent-response':
      return <Text color="cyan">{entry.props.content}</Text>;
    case 'error':
      return <Text color="red">Error: {entry.props.message}</Text>;
    case 'status':
      return <Text color="yellow">{entry.props.message}</Text>;
    case 'text':
      return <Text>{entry.props.content}</Text>;
    default:
      return <Text>{JSON.stringify(entry)}</Text>;
  }
}
```

**Interactive Component Renderer:**

Interactive components are created by commands in their `execute()` method. The renderer uses a component registry or direct rendering:

```typescript
import React from 'react';
import { ProviderSelectList } from '../tui/ProviderSelectList.js';
import { McpServerDetails } from '../tui/McpServerDetails.js';
// ... import component types

function InteractiveComponentRenderer({ component }: { component: InteractiveComponent }) {
  // Components are created by commands, so we render them based on type
  switch (component.type) {
    case 'provider-command':
      return <ProviderSelectList {...component.props} onSubmit={component.onComplete} onCancel={component.onCancel} />;
    case 'mcp-command':
      return <McpServerDetails {...component.props} onSubmit={component.onComplete} onCancel={component.onCancel} />;
    // ... etc - components created by commands
    default:
      return null;
  }
}
```

**Note:** Commands create interactive components in their `execute()` method, so the component types are known at registration time. The renderer just needs to map component types to React components.

**Component Pattern:**

Interactive components are created by commands and handle their own navigation internally:

```typescript
// Component created by ProviderCommand.execute()
function ProviderSelectList({ providers, onSubmit, onCancel }: ProviderSelectListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  // ... navigation logic ...

  const handleSubmit = () => {
    const selected = providers[selectedIndex];
    // Call completion callback - command will add static entry to history
    onSubmit({ providerId: selected.id });
  };

  // Component manages its own interactive state
  // When done, calls callback which command uses to add static entry to history
  return (
    <Box>
      {/* Interactive menu rendering */}
    </Box>
  );
}
```

**Note:** The command object (`ProviderCommand`) creates this component in its `execute()` method and sets up the callbacks that add history entries.

### 4. Async Operations

**Pattern for async updates:**

Async operations happen within interactive components. When complete, results are added to history as static entries:

```typescript
// Example: Async operation within interactive component
function ToolDetailsViewer({ toolId, onComplete }: ToolDetailsViewerProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchToolData(toolId)
      .then(result => {
        setData(result);
        setLoading(false);
      })
      .catch(err => {
        setError(err);
        setLoading(false);
      });
  }, [toolId]);

  const handleComplete = () => {
    // When user dismisses, add static result to history
    if (error) {
      historyManager.push({
        type: 'error',
        id: generateId(),
        props: { message: `Failed to load tool ${toolId}: ${error.message}` }
      });
    } else {
      historyManager.push({
        type: 'text',
        id: generateId(),
        props: { content: `Tool ${toolId} details viewed` }
      });
    }
    onComplete();
  };

  // Component manages its own async state
  if (loading) return <Text>Loading...</Text>;
  if (error) return <Text color="red">Error: {error.message}</Text>;
  return <Box>{/* Render tool details */}</Box>;
}
```

**Why this works:**
- Async operations happen within interactive components (transient)
- History only receives final results (static entries)
- No need to serialize async state - it's ephemeral
- Clearing scrollback doesn't affect history (which only has results)

### 5. Interactive Component Flow

**Command execution creates interactive component:**

```typescript
// User runs /provider command
const providerCommand = findCommand('/provider');
await providerCommand.execute(agent, historyManager);

// Inside ProviderCommand.execute():
// 1. Fetch data
const providers = await this.getProviders(agent);

// 2. Create interactive component
historyManager.setActiveInteractive({
  type: 'provider-command',
  props: { providers },
  onComplete: async (result: { providerId: string }) => {
    // Add static result to history (type: 'command', id: '/provider')
    historyManager.push({
      type: 'command',
      id: this.name,  // '/provider'
      props: {
        providerId: result.providerId,
        message: `Provider ${result.providerId} selected`
      }
    });
    historyManager.setActiveInteractive(null);
    await agent.setProvider(result.providerId);
  },
  onCancel: () => {
    // Add cancellation to history
    historyManager.push({
      type: 'command',
      id: this.name,
      props: { message: 'Provider selection cancelled' }
    });
    historyManager.setActiveInteractive(null);
  }
});
```

**Example: /mcp command flow:**

```typescript
// User runs /mcp command
const mcpCommand = findCommand('/mcp');
await mcpCommand.execute(agent, historyManager);

// Inside McpCommand.execute():
// Command creates its own interactive component with navigation
// When user completes interaction, command adds result to history:
historyManager.push({
  type: 'command',
  id: '/mcp',
  props: {
    serverName: result.serverName,
    action: result.action,
    message: `MCP ${result.action} completed for ${result.serverName}`
  }
});
```

**Key Points:**
- Commands create interactive components in their `execute()` method
- Interactive components are **never** in history
- Only **final results** are added to history as static entries (type: `'command'`, id: command name)
- Navigation within interactive components is ephemeral and not serialized
- Agent messages/responses are added to history separately (type: `'agent-message'`, `'agent-response'`)

### 6. Resize Handling

**When resize occurs:**

1. Detect width change via `process.stdout.on('resize')`
2. Clear scrollback: `process.stdout.write('\u001b[2J\u001b[H')`
3. Force full re-render of entire history
4. Ink's line tracking is reset, corruption cleared

**Implementation:**

```typescript
useEffect(() => {
  const handleResize = () => {
    const newWidth = process.stdout.columns;
    if (newWidth !== width) {
      // Clear scrollback
      process.stdout.write('\u001b[2J\u001b[H');
      // Update width state (triggers re-render)
      setWidth(newWidth);
      // History is unchanged, components re-render with new width
    }
  };

  process.stdout.on('resize', handleResize);
  return () => process.stdout.off('resize', handleResize);
}, [width]);
```

## Command Object Pattern

### Encapsulation Pattern

Each command is implemented as a single class/object that encapsulates:
1. **Metadata** (name, description, aliases) - drives autocomplete and help
2. **History entry rendering** - how to render command results in history
3. **Interactive component implementation** - created in `execute()` method
4. **Command execution logic** - handles the command and creates interactive elements

This keeps all command-related code in one place and makes the system extensible - just register a command object and everything works.

### Command Interface

```typescript
// commands/Command.ts
export interface Command {
  // Metadata - drives autocomplete and help
  readonly name: string;
  readonly description: string;
  readonly aliases?: string[];
  
  // Render history entries created by this command
  renderHistoryEntry(entry: HistoryEntry): React.ReactNode;
  
  // Execute the command - creates interactive component
  execute(
    agent: Agent,
    historyManager: HistoryManager,
    args?: string[]
  ): Promise<void>;
  
  // Optional methods
  validateArgs?(args: string[]): boolean;
  getHelpText?(): string;
}
```

### Example: Provider Command

**`commands/ProviderCommand.ts`** - Complete command implementation:

```typescript
import React from 'react';
import { Text } from 'ink';
import { Agent } from '@tsagent/core';
import { HistoryManager } from '../history/HistoryManager.js';
import { ProviderSelectList } from '../tui/ProviderSelectList.js';
import type { ProviderItem } from '../tui/ProviderSelectList.js';
import type { Command } from './Command.js';
import type { HistoryEntry } from '../history/types.js';

export class ProviderCommand implements Command {
  readonly name = '/provider';
  readonly description = 'Select a provider';
  readonly aliases: string[] = [];

  // Render history entries for this command
  renderHistoryEntry(entry: HistoryEntry): React.ReactNode {
    if (entry.type !== 'command' || entry.id !== this.name) {
      return null;
    }

    const { providerId, message } = entry.props;
    
    if (providerId) {
      return <Text color="green">✓ {message || `Provider ${providerId} selected`}</Text>;
    } else {
      return <Text color="yellow">{message || 'Provider selection cancelled'}</Text>;
    }
  }

  // Execute command - creates interactive component
  async execute(
    agent: Agent,
    historyManager: HistoryManager,
    args?: string[]
  ): Promise<void> {
    // Fetch provider data
    const providers = await this.getProviders(agent);

    // Create and set interactive component
    historyManager.setActiveInteractive({
      type: 'provider-command',
      props: { providers },
      onComplete: async (result: { providerId: string }) => {
        // Add static result to history
        historyManager.push({
          type: 'command',
          id: this.name,
          props: {
            providerId: result.providerId,
            message: `Provider ${result.providerId} selected`
          }
        });
        historyManager.setActiveInteractive(null);
        
        // Perform the actual provider selection
        await agent.setProvider(result.providerId);
      },
      onCancel: () => {
        // Add cancellation message to history
        historyManager.push({
          type: 'command',
          id: this.name,
          props: {
            message: 'Provider selection cancelled'
          }
        });
        historyManager.setActiveInteractive(null);
      }
    });
  }

  // Helper methods
  private async getProviders(agent: Agent): Promise<ProviderItem[]> {
    // Fetch and format providers
    const availableProviders = agent.getAvailableProviders();
    return availableProviders.map(id => ({
      id,
      name: id, // Could fetch display names
      isInstalled: agent.isProviderInstalled(id)
    }));
  }

  validateArgs(args?: string[]): boolean {
    // No args expected for this command
    return !args || args.length === 0;
  }

  getHelpText(): string {
    return `${this.name} - ${this.description}`;
  }
}
```

**Note:** The interactive component (`ProviderSelectList`) is created inline in the `execute()` method. The command object owns the entire flow.

### Command Registration

**`commands/index.ts`** - Central command registry:

```typescript
import { ProviderCommand } from './ProviderCommand.js';
import { McpCommand } from './McpCommand.js';
import { SettingsCommand } from './SettingsCommand.js';
import { HelpCommand } from './HelpCommand.js';
// ... import all commands

import type { Command } from './Command.js';

// Register all commands
export const COMMANDS: Command[] = [
  new ProviderCommand(),
  new McpCommand(),
  new SettingsCommand(),
  new HelpCommand(),
  // ... etc
];

// Helper: Find command by name or alias
export function findCommand(name: string): Command | undefined {
  return COMMANDS.find(cmd => 
    cmd.name === name || cmd.aliases?.includes(name)
  );
}

// Get all commands for autocomplete/help
export function getAllCommands(): Command[] {
  return COMMANDS;
}

// Helper: Find command that can render a history entry
export function findCommandForHistoryEntry(entry: HistoryEntry): Command | undefined {
  if (entry.type === 'command') {
    return findCommand(entry.id);
  }
  return undefined;
}
```

### Usage in CLI

**`cli.ts`** - Command routing:

```typescript
import { findCommand, getAllCommands } from './commands/index.js';
import { HistoryManager } from './history/HistoryManager.js';

const historyManager = new HistoryManager();

// Build command list for autocomplete
const COMMAND_LIST = getAllCommands().map(cmd => ({
  name: cmd.name,
  description: cmd.description
}));

async function processInput(input: string): Promise<boolean> {
  const command = input.trim();
  
  if (command.startsWith('/')) {
    const commandParts = command.split(' ');
    const commandName = commandParts[0].toLowerCase();
    const args = commandParts.slice(1);
    
    const cmd = findCommand(commandName);
    
    if (cmd) {
      // Validate args if command supports validation
      if (cmd.validateArgs && !cmd.validateArgs(args)) {
        console.log(chalk.red(`Invalid arguments for ${commandName}`));
        return true;
      }
      
      // Execute command
      await cmd.execute(agent, historyManager, args);
      return true;
    } else {
      console.log(chalk.red(`Unknown command: ${commandName}`));
      return true;
    }
  }
  
  // Handle non-command input (agent messages)...
  // These are added to history as 'agent-message' entries
}
```

### History Entry Rendering

**`history/HistoryEntryRenderer.tsx`** - Routes to command renderers:

```typescript
import React from 'react';
import { Text } from 'ink';
import { findCommandForHistoryEntry } from '../commands/index.js';
import type { HistoryEntry } from './types.js';

export function HistoryEntryRenderer({ entry }: { entry: HistoryEntry }) {
  // Try to find command that can render this entry
  if (entry.type === 'command') {
    const command = findCommandForHistoryEntry(entry);
    if (command) {
      return command.renderHistoryEntry(entry);
    }
  }
  
  // Handle non-command entries
  switch (entry.type) {
    case 'agent-message':
      return <Text>{entry.props.content}</Text>;
    case 'agent-response':
      return <Text color="cyan">{entry.props.content}</Text>;
    case 'error':
      return <Text color="red">Error: {entry.props.message}</Text>;
    case 'status':
      return <Text color="yellow">{entry.props.message}</Text>;
    case 'text':
      return <Text>{entry.props.content}</Text>;
    default:
      return <Text>{JSON.stringify(entry)}</Text>;
  }
}
```

### Interactive Component Rendering

Interactive components are created by commands in their `execute()` method. The renderer just renders whatever the command created:

```typescript
// Interactive components are created by commands, so we just render them
function InteractiveComponentRenderer({ component }: { component: InteractiveComponent }) {
  // Commands create these components, so we can render them directly
  // The component type matches what the command created
  const Component = getComponentForType(component.type);
  if (!Component) return null;
  
  return <Component {...component.props} onComplete={component.onComplete} onCancel={component.onCancel} />;
}
```

### Benefits of Command Object Pattern

1. **Single Source of Truth**: Everything about a command is in one class
2. **Self-Contained**: No cross-file dependencies for command logic
3. **Easy to Add Commands**: Create a class, implement interface, register it
4. **Type-Safe**: Interface ensures consistency
5. **Testable**: Each command can be tested independently
6. **Extensible**: Easy to add methods (validateArgs, getHelpText, etc.)
7. **Automatic Integration**: Once registered, command appears in autocomplete and help
8. **Clear Separation**: Commands handle their own rendering and execution

## Migration Strategy

### Phase 1: Create History Infrastructure

1. Create `HistoryManager` class
2. Create `PersistentApp` component
3. Create `HistoryContext` for components to access history manager
4. Create `HistoryEntryRenderer` component

### Phase 2: Create Command Object Structure

1. Create `commands/` directory
2. Define `Command` interface
3. Create example command class (e.g., `ProviderCommand`) implementing the interface
4. Set up command registry
5. Update CLI to use command registry

### Phase 3: Migrate Commands

1. Migrate each command to a command class
2. Implement `Command` interface
3. Move interactive component creation into `execute()` method
4. Implement `renderHistoryEntry()` method
5. Register command in registry

### Phase 4: Add Resize Handling

1. Implement resize detection
2. Implement scrollback clearing
3. Test resize behavior

### Phase 5: Add Save/Restore (Optional)

1. Implement session serialization
2. Implement session deserialization
3. Add save/restore commands to CLI

## Performance Considerations

### Rendering Limits

- **100-200 lines per frame**: Generally fine
- **500+ lines**: May cause noticeable lag (100-200ms+)
- **1000+ lines**: Likely problematic

### Known Issues with Similar Approaches

**Claude Code Scrollback Buffer Issue**: [Claude Code exhibits severe performance degradation](https://github.com/anthropics/claude-code/issues/4851) when maintaining scrollback buffer history in tmux sessions. After accumulating several thousand lines, the application shows:
- Excessive scrolling/rewinding behavior
- High CPU usage
- Performance degradation that makes extended sessions impractical
- Scrollback buffer appears to be maintained internally rather than by terminal/tmux

**Lessons Learned:**
- Maintaining internal scrollback history can lead to performance issues
- Our approach differs by:
  - **Clearing scrollback on resize** (prevents accumulation)
  - **Limiting history depth** (not maintaining all output)
  - **History contains component state, not rendered output** (more efficient)
- We should monitor performance and implement history limits/pruning to avoid similar issues

### Recommendations

1. **Limit history depth**: Cap at 20-30 entries for typical sessions
2. **Debounce resize**: Wait 100-200ms after resize stops before re-rendering
3. **Virtualization**: Continue using virtualization for long lists (already implemented)
4. **Measure performance**: Add timing to track actual render times
5. **Monitor for scrollback accumulation**: Ensure scrollback clearing actually works and doesn't get repopulated
6. **Consider history pruning**: Remove old entries beyond a certain threshold

### Optimization Strategies

- Only render visible history entries (if history gets very long)
- Cache rendered output for static entries
- Use React.memo for expensive components
- Implement automatic history pruning after N entries
- Monitor memory usage and render times

## Save/Restore Implementation

### Serialization

```typescript
function saveSession(sessionPath: string): void {
  const session: Session = {
    history: historyManager.getHistory().map(entry => ({
      ...entry,
      props: sanitizeProps(entry.props) // Remove functions, ensure serializable
    })),
    version: '1.0.0'
  };

  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
}
```

### Deserialization

```typescript
function restoreSession(sessionPath: string): void {
  const session: Session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
  
  // Clear and restore
  process.stdout.write('\u001b[2J\u001b[H');
  historyManager.setHistory(session.history);
  
  // Components re-render automatically
}
```

### What to Save

- ✅ Static history entries only
- ✅ Text content, results, status messages
- ✅ Completed action summaries

### What NOT to Save

- ❌ Interactive component state (never in history)
- ❌ Current selections, input values (transient)
- ❌ Navigation state within interactive components
- ❌ Component instances
- ❌ Callback functions
- ❌ Refs
- ❌ Async operation promises

## Benefits Summary

1. **Fixes resize corruption**: Clearing scrollback resets Ink's line tracking
2. **Simplifies serialization**: Only static content in history - no interaction state to serialize
3. **Enables save/restore**: History contains only completed results, making save/restore trivial
4. **Clear separation**: Interactive components are clearly separated from persistent history
5. **Performance**: History stays small (only results, not all interaction steps)
6. **Maintains React patterns**: Components still work normally, but with clear lifecycle
7. **No state leakage**: Interactive state never persists, preventing bugs from stale state

## Future Considerations

### User-Defined Commands

At some point, we will support user-defined commands that are dynamically created from data (not hardcoded classes). These will be generic commands that execute a prompt.

**Design Accommodation:**

The current `Command` interface design accommodates this through a generic user command class:

```typescript
// commands/UserCommand.ts
export class UserCommand implements Command {
  readonly name: string;
  readonly description: string;
  readonly prompt: string;  // The prompt to execute
  
  constructor(name: string, description: string, prompt: string) {
    this.name = name;
    this.description = description;
    this.prompt = prompt;
  }

  renderHistoryEntry(entry: HistoryEntry): React.ReactNode {
    if (entry.type !== 'command' || entry.id !== this.name) {
      return null;
    }
    
    // Render user command result
    return <Text>{entry.props.message || entry.props.result}</Text>;
  }

  async execute(
    agent: Agent,
    historyManager: HistoryManager,
    args?: string[]
  ): Promise<void> {
    // Execute the prompt
    const result = await agent.executePrompt(this.prompt, args);
    
    // Add result to history
    historyManager.push({
      type: 'command',
      id: this.name,
      props: {
        prompt: this.prompt,
        result: result,
        message: `Command ${this.name} executed`
      }
    });
  }
}

// Usage: Create user commands from data
const userCommandDefs = [
  { name: '/custom1', description: 'Custom command 1', prompt: 'Do something...' },
  { name: '/custom2', description: 'Custom command 2', prompt: 'Do something else...' }
];

const userCommands = userCommandDefs.map(def => 
  new UserCommand(def.name, def.description, def.prompt)
);

// Register alongside built-in commands
export const COMMANDS: Command[] = [
  new ProviderCommand(),
  new McpCommand(),
  // ... built-in commands
  ...userCommands  // User-defined commands
];
```

**Benefits:**
- Same interface as built-in commands
- No need for separate class per user command
- Can be loaded from configuration/data files
- Automatically appear in autocomplete and help
- History rendering works the same way

**Considerations:**
- User commands might need different validation (prompt templates, args)
- May want to distinguish built-in vs user commands in help
- Could support prompt templates with argument substitution

## Open Questions

1. Should we limit history depth? If so, what's the limit? (Since history only contains results, it should stay relatively small)
2. Should we implement history pruning (remove old entries)?
3. Should there be a base `Command` class with shared functionality, or just an interface? (User commands might benefit from a base class)
4. How should we handle errors during restore?
5. Should we add timestamps to history entries for display purposes?
6. How should agent messages/responses be added to history? (Separate handler, or part of chat session management?)
7. How should user-defined commands be stored/loaded? (Agent config file, separate commands file, etc.)

## References

- Ink documentation: https://github.com/vadimdemedes/ink
- Terminal ANSI codes: https://en.wikipedia.org/wiki/ANSI_escape_code
- React Context API: https://react.dev/reference/react/useContext
- Claude Code scrollback buffer performance issue: https://github.com/anthropics/claude-code/issues/4851
