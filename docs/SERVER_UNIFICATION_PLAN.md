# Server Unification and CLI Launcher Plan

## Overview

This document outlines the plan to unify the structure and parameter handling of three server applications (`meta-mcp`, `a2a-server`, `acp-server`) and integrate them as launchers in the CLI.

## Current State Analysis

### Structural Inconsistencies

1. **meta-mcp** (`packages/meta-mcp/`):
   - Everything in `src/index.ts`
   - Entrypoint: `main()` function (not exported)
   - Flags: `--debug/-d` only
   - No `--help` flag

2. **a2a-server** (`packages/a2a-server/`):
   - Server classes in `src/index.ts`
   - Entrypoint in `src/cli.ts` (separate file)
   - Flags: `--port/-p`, `--help/-h`
   - No debug/verbose flag

3. **acp-server** (`packages/acp-server/`):
   - Entrypoint in `src/index.ts`
   - Server implementation in `src/acp-server.ts`
   - Flags: `--verbose/-v/--debug`, `--help/-h`
   - Verbose and debug are aliases

### Parameter Inconsistencies

- **Help flags**: Only `a2a-server` and `acp-server` have `--help/-h`
- **Debug/verbose**: Different names (`--debug` vs `--verbose`) for the same concept
- **Agent path handling**: All take agent path(s) but parsing differs slightly

## Proposed Unified Design

### 1. Unified Structure

All three servers should follow this pattern:

```
src/
  index.ts          # Exports server class(es) + run(options) function + main() entrypoint
  server.ts         # Server class implementation
  logger.ts         # Logger implementation
```

**File responsibilities:**
- `index.ts`: 
  - Exports server class(es) (re-exported from `server.ts`)
  - Contains `run(options)` function (calls server class methods)
  - Contains `main()` function (parses `process.argv`, calls `run()`)
  - Binary entrypoint (when executed directly, calls `main()`)
- `server.ts`: 
  - Contains server class implementation
  - Exports server class(es)
- `logger.ts`: 
  - Logger implementation (already exists in all three)

**Key changes:**
- `meta-mcp`: Move `MetaMCPServer` class to `server.ts`, keep `main()` and add `run()` in `index.ts`
- `a2a-server`: Move server classes (`A2AServer`, `MultiA2AServer`) to `server.ts`, merge `cli.ts` into `index.ts` (move `main()` to `index.ts`)
- `acp-server`: Move `ACPServer` class to `server.ts`, keep `main()` and add `run()` in `index.ts`

### 2. Unified Parameter Scheme

All three servers should accept:

- `-h, --help`: Show help message and exit
- `-d, --debug`: Enable debug/verbose logging (unified name)
- **Positional args**: Agent path(s) (required)
- **Server-specific flags**: Additional flags as needed (e.g., `--port` for a2a-server)

### 3. Function Signatures

#### Standardized `run()` function

Each server exports a `run(options)` function that accepts parsed options. Since there's no current mechanism for shared code between these packages, each will define its own options interface with common fields:

```typescript
// meta-mcp/src/index.ts
interface MetaMCPServerOptions {
  agentPaths: string[];  // Always an array, even for single-agent servers
  debug?: boolean;       // Unified: --debug/-d (verbose logging)
  help?: boolean;        // Unified: --help/-h
}

async function run(options: MetaMCPServerOptions): Promise<void>

// a2a-server/src/index.ts
interface A2AServerOptions {
  agentPaths: string[];  // Always an array (supports multi-agent mode)
  debug?: boolean;       // Unified: --debug/-d (verbose logging)
  help?: boolean;        // Unified: --help/-h
  port?: number;         // --port/-p (default: 4000)
}

async function run(options: A2AServerOptions): Promise<void>

// acp-server/src/index.ts
interface ACPServerOptions {
  agentPaths: string[];  // Always an array, even for single-agent servers
  debug?: boolean;       // Unified: --debug/-d (verbose logging)
  help?: boolean;        // Unified: --help/-h
}

async function run(options: ACPServerOptions): Promise<void>
```

**Note on shared code:** There's no current mechanism for sharing code between these server packages. Each package will define its own options interface with the same common fields (`agentPaths`, `debug`, `help`). If we want to share a `BaseServerOptions` type in the future, we would need to either:
- Create a shared package (e.g., `@tsagent/server-common`) that all three depend on
- Add it to `@tsagent/core` (but this would add server-specific types to the core package)

For now, duplicating the common fields in each package is the simplest approach and maintains package independence.

#### Binary entrypoint `main()`

Each server keeps a `main()` function that:
- Parses `process.argv` (or optionally provided args) into the appropriate options object
- Calls `run(options)` with parsed options
- Handles help display
- Handles errors and exit codes

```typescript
async function main(args?: string[]): Promise<void> {
  // Use provided args or fall back to process.argv
  const argv = args ?? process.argv.slice(2);
  const options = parseArgs(argv);
  
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  try {
    await run(options);
  } catch (error) {
    // Error handling
    process.exit(1);
  }
}

// Export both functions
// main() is the primary entrypoint (used by binary and CLI)
// run() is exported for direct use cases where someone wants to call with parsed options
export { run, main };
```

**Note:** `run()` is still exported for edge cases where someone might want to call it directly with parsed options, but `main()` is the primary entrypoint that handles all parsing.

### 4. CLI Integration

#### CLI Agent Path Handling

The CLI requires an agent path as an unnamed positional argument (consistent with the server applications):

- **Absolute path**: `tsagent /Users/bob/Documents/Agents/foo.yaml` → Uses the path as-is
- **Filename only**: `tsagent foo.yaml` → Looks for the file in the current working directory, expands to absolute path
- **With --create**: `tsagent --create bar.yaml` or `tsagent --create /path/to/bar.yaml` → Creates new agent using same path resolution logic

**Path Resolution Logic:**
- **CLI Interactive Mode**: CLI normalizes paths for its own use when loading agents
- **Server Launcher Mode**: CLI passes raw arguments to servers; servers normalize paths in their own `parseArgs()` functions
- **Server Standalone Mode**: Servers normalize paths in their own `parseArgs()` functions
- Normalization logic (same in CLI and all servers):
  - If path is absolute: Use as-is (normalize with `path.resolve()`)
  - If path is relative: Resolve relative to `process.cwd()`
- This ensures consistent behavior: servers own their argument parsing and path normalization

**Key changes:**
- Remove default behavior of using `process.cwd()` as agent path
- Require agent path as positional argument (no longer optional)
- Support both absolute paths and relative filenames
- `--create` option uses the same path resolution logic
- **Path normalization ownership**:
  - CLI normalizes paths for its own interactive mode
  - Servers normalize paths in their own `parseArgs()` functions
  - CLI passes raw arguments to servers (servers handle their own parsing)

#### CLI Subcommands

The CLI will add three flags that launch the respective servers:

- `tsagent --mcp [args...]` → launches meta-mcp
- `tsagent --a2a [args...]` → launches a2a-server
- `tsagent --acp [args...]` → launches acp-server

#### Implementation

1. Add server packages as dependencies to CLI:
   ```json
   "dependencies": {
     "@tsagent/meta-mcp": "^1.3.2",
     "@tsagent/server": "^1.3.2",
     "@tsagent/acp-server": "^1.3.2"
   }
   ```

2. In `apps/cli/src/main.ts`, add subcommands:
   ```typescript
   // Helper function to normalize agent paths (for CLI's own use)
   function normalizeAgentPath(pathArg: string): string {
     if (path.isAbsolute(pathArg)) {
       return path.resolve(pathArg);
     }
     // Relative path - resolve relative to process.cwd()
     return path.resolve(process.cwd(), pathArg);
   }
   
   program
     .option('--mcp', 'Launch meta-mcp server')
     .option('--a2a', 'Launch A2A server')
     .option('--acp', 'Launch ACP server');
   
   // After parsing, if one of these flags is set:
   if (options.mcp) {
     // Pass all remaining args directly to server (server handles parsing and normalization)
     const serverArgs = program.args; // All positional args + flags
     const { main } = await import('@tsagent/meta-mcp');
     await main(serverArgs); // Server receives raw args, normalizes paths itself
     return;
   }
   // Similar for --a2a and --acp
   
   // For CLI's own interactive mode, normalize path for our use
   const agentPath = normalizeAgentPath(args[0]);
   ```

3. In each server's `index.ts`, add path normalization to `parseArgs()`:
   ```typescript
   import * as path from 'path';
   
   function normalizeAgentPath(pathArg: string): string {
     if (path.isAbsolute(pathArg)) {
       return path.resolve(pathArg);
     }
     // Relative path - resolve relative to process.cwd()
     return path.resolve(process.cwd(), pathArg);
   }
   
   function parseArgs(args: string[]): ServerOptions {
     // ... parse flags (--port, --debug, --help, etc.)
     
     // When identifying agent paths:
     if (!arg.startsWith('-')) {
       if (arg.endsWith('.yaml') || arg.endsWith('.yml')) {
         // Normalize path here (server knows this is a path)
         options.agentPaths.push(normalizeAgentPath(arg));
       }
     }
   }
   ```

**Benefits of this approach:**
- **No duplicate parsing logic**: CLI doesn't need to know about server-specific flags
- **Servers own their parsing**: Each server handles its own argument parsing and path normalization
- **Simpler CLI code**: Just detects the launcher flag and passes raw args to server
- **Server maintains control**: Each server knows which args are paths vs flags
- **Easier to maintain**: Changes to server args don't require CLI updates
- **Consistent UX**: Users can use relative filenames with all servers, servers handle the resolution
- **Handles complex cases**: Servers can correctly parse `--port 8080 foo.yml --debug` because they know their own flags

## Implementation Steps

### Phase 1: Unify meta-mcp ✅ COMPLETE

1. ✅ Move `MetaMCPServer` class from `index.ts` to `server.ts`
2. ✅ Export `MetaMCPServer` from `index.ts`
3. ✅ Add `run(options: MetaMCPServerOptions)` function in `index.ts`
4. ✅ Refactor existing `main()` in `index.ts` to:
   - Accept optional `args?: string[]` parameter
   - Parse args (or `process.argv.slice(2)` if not provided) and call `run()`
5. ✅ Add `--help/-h` flag support
6. ✅ Rename/standardize `--debug` (already correct)
7. ✅ Export both `run` and `main` from `index.ts`
8. ✅ Update binary entrypoint to call exported `main()` (with no args, so it uses `process.argv`)

### Phase 2: Unify a2a-server ✅ COMPLETE

1. ✅ Move server classes (`A2AServer`, `MultiA2AServer`, etc.) from `index.ts` to `server.ts`
2. ✅ Export server classes from `index.ts`
3. ✅ Move `main()` function from `cli.ts` to `index.ts`
4. ✅ Delete `cli.ts`
5. ✅ Add `run(options: A2AServerOptions)` function in `index.ts`
6. ✅ Refactor `main()` to:
   - Accept optional `args?: string[]` parameter
   - Parse args (or `process.argv.slice(2)` if not provided) and call `run()`
7. ✅ Add `--debug/-d` flag (currently missing)
8. ✅ Ensure `--help/-h` works
9. ✅ Export both `run` and `main` from `index.ts`
10. ✅ Update `package.json` bin entry and scripts to use `index.ts` instead of `cli.ts`

### Phase 3: Unify acp-server ✅ COMPLETE

1. ✅ Move `ACPServer` class from `acp-server.ts` to `server.ts`
2. ✅ Export `ACPServer` from `index.ts` (re-export from `server.ts`)
3. ✅ Add `run(options: ACPServerRunOptions)` function in `index.ts`
4. ✅ Refactor existing `main()` in `index.ts` to:
   - Accept optional `args?: string[]` parameter
   - Parse args (or `process.argv.slice(2)` if not provided) and call `run()`
5. ✅ Standardize to `--debug/-d` (keep `--verbose/-v` as alias for backward compatibility)
6. ✅ Ensure `--help/-h` works
7. ✅ Export both `run` and `main` from `index.ts`
8. ✅ Delete `acp-server.ts` (moved to `server.ts`)

### Phase 4: CLI Rename ✅ COMPLETE

1. ✅ Update `apps/cli/package.json`:
   - Change `bin` field from `"tsagent-cli"` to `"tsagent"`
   - Note: The commander program name is already set to `'tsagent'` in `main.ts`, so no change needed there
2. ✅ Update all documentation:
   - CLI README (`apps/cli/README.md`): Replace all `tsagent-cli` references with `tsagent`
   - Other docs that reference the CLI command (`docs/SUPERVISION.md`)
   - Update examples and usage instructions throughout the codebase
3. ✅ Update logger filenames from `tsagent-cli.log` to `tsagent.log` and `tsagent-cli-error.log` to `tsagent-error.log`
4. ✅ Verify no conflicts: Desktop app uses `tsagent-foundry` (Linux) and `TsAgent Foundry` (macOS/Windows), so `tsagent` is available

### Phase 5: CLI Agent Path Handling Update ✅ COMPLETE

1. ✅ Create path normalization helper function in CLI:
   - Accepts path argument (absolute or relative)
   - If absolute: Use as-is (normalize with `path.resolve()`)
   - If relative: Check if exists in `process.cwd()`, expand to absolute path
   - Returns normalized absolute path
2. ✅ Update CLI to require agent path as unnamed positional argument:
   - Change from optional `--agent <path>` to required positional argument
   - Remove default behavior of using `process.cwd()` as agent path
   - Use path normalization helper for CLI's own agent loading
3. ✅ Update `--create` option to use same path resolution logic
4. ✅ **Normalize paths before passing to servers**: When launching servers via `--mcp`, `--a2a`, `--acp`, normalize any path-like arguments (filenames ending in `.yaml`/`.yml`) before passing to server's `main()` function
5. ✅ Update usage examples and help text:
   - `tsagent foo.yaml` - Load agent from cwd (normalized to absolute path)
   - `tsagent /path/to/agent.yaml` - Load agent from absolute path
   - `tsagent --create bar.yaml` - Create new agent in cwd
   - `tsagent --create /path/to/new-agent.yaml` - Create new agent at absolute path
   - `tsagent --mcp foo.yaml` - Launch meta-mcp with agent from cwd (path normalized)
   - `tsagent --a2a /path/to/agent.yaml` - Launch A2A server with absolute path
6. ✅ Update error messages to reflect new required argument

### Phase 6: CLI Integration ✅ COMPLETE

1. ✅ **Initial setup with file:// dependencies** (for development/testing):
   - Add server packages as CLI dependencies using `file://` references
   - Run `npm install` in CLI directory to link local packages
2. ✅ Add `--mcp`, `--a2a`, `--acp` flags to CLI
3. ✅ Wire up calls to each server's `main()` function with remaining args (raw args, servers handle parsing)
4. ✅ **Path normalization ownership**:
   - CLI keeps `normalizeAgentPath()` for its own interactive mode
   - CLI passes raw args to servers (no path normalization in launcher code)
   - All three servers add `normalizeAgentPath()` to their `parseArgs()` functions
   - Servers normalize paths after identifying them (servers know which args are paths vs flags)
5. ✅ Build successful with file:// dependencies
6. ⏳ **Before publishing** (revert to npm package references):
   - Update CLI `package.json` to use npm package references with new version:
     ```json
     "dependencies": {
       "@tsagent/meta-mcp": "^1.3.2",
       "@tsagent/server": "^1.3.2",
       "@tsagent/acp-server": "^1.3.2"
     }
     ```
   - Delete `apps/cli/package-lock.json` and `apps/cli/node_modules`
   - Run `npm install` in CLI directory to install from npm registry
   - Verify CLI still works with published packages

### Phase 7: Documentation ✅ COMPLETE

1. ✅ Update each server's README with unified parameter documentation
   - meta-mcp: Updated usage, examples, and CLI launcher info
   - a2a-server: Updated usage, examples, and CLI launcher info
   - acp-server: Updated usage, examples, and CLI launcher info
2. ✅ Update CLI README with:
   - New required agent path argument usage
   - Launcher instructions for `--mcp`, `--a2a`, `--acp`
   - Examples for each server type
   - Path normalization documentation
3. ✅ Ensure all usage examples show both absolute paths and relative filenames

### Phase 8: Convert Servers to Commander.js ✅ COMPLETE

1. ✅ Add `commander` dependency to all three server packages
2. ✅ Convert `meta-mcp` to use commander.js:
   - Replace manual `parseArgs()` with commander-based parsing
   - Remove manual `showHelp()` function (commander generates help automatically)
   - Automatic unknown option handling
3. ✅ Convert `a2a-server` to use commander.js:
   - Replace manual `parseArgs()` with commander-based parsing
   - Remove manual `showHelp()` function
   - Handle `--port` option with proper type conversion
   - Support multiple agent paths with `.argument('<agent-path...>')`
4. ✅ Convert `acp-server` to use commander.js:
   - Replace manual `parseArgs()` with commander-based parsing
   - Remove manual `showHelp()` function
   - Support both `--debug/-d` and `--verbose/-v` for backward compatibility
5. ✅ Benefits achieved:
   - **Cleaner code**: ~15 lines per server vs ~35 lines of manual parsing
   - **Automatic help**: No need for manual `showHelp()` functions
   - **Better error handling**: Consistent unknown option handling
   - **Type safety**: Commander provides typed option access
   - **Consistency**: Same pattern as CLI

## Final Architecture: Path Normalization Ownership

### Two Modes of Operation

1. **CLI Interactive Mode** (`tsagent <agent-path>`):
   - CLI parses its own arguments
   - CLI normalizes agent path using `normalizeAgentPath()` for its own use
   - CLI loads agent and starts interactive session

2. **CLI Server Launcher Mode** (`tsagent --mcp/--a2a/--acp <args...>`):
   - CLI detects server flag (`--mcp`, `--a2a`, or `--acp`)
   - CLI passes all remaining arguments (raw, unchanged) to server's `main()` function
   - Server's `main()` calls its own `parseArgs()` function
   - Server's `parseArgs()`:
     - Parses server-specific flags (`--port`, `--debug`, `--help`, etc.)
     - Identifies agent paths (non-flag args ending in `.yaml`/`.yml`)
     - Normalizes agent paths using server's own `normalizeAgentPath()` function
   - Server calls `run()` with parsed and normalized options

### Key Design Decisions

- **Servers own their argument parsing**: Each server knows which arguments are flags vs paths
- **Path normalization happens where paths are identified**: Servers normalize paths in `parseArgs()` after identifying them
- **CLI is a thin launcher**: CLI doesn't need to know server-specific flags
- **Consistent normalization logic**: All normalization functions use the same logic (absolute paths as-is, relative paths resolved relative to `process.cwd()`)

### Example Flow

```
User: tsagent --a2a --port 8080 foo.yml --debug

CLI:
1. Parse args, detect --a2a flag
2. Extract remaining args: ["--port", "8080", "foo.yml", "--debug"]
3. Pass raw args to a2a-server: main(["--port", "8080", "foo.yml", "--debug"])

A2A Server:
1. main() receives: ["--port", "8080", "foo.yml", "--debug"]
2. parseArgs() processes:
   - Recognizes --port flag, extracts value "8080"
   - Recognizes --debug flag
   - Identifies "foo.yml" as agent path (non-flag ending in .yml)
   - Normalizes "foo.yml" → "/absolute/path/to/foo.yml"
3. Calls run() with: { agentPaths: ["/absolute/path/to/foo.yml"], port: 8080, debug: true }
```

## Benefits

- **Consistency**: All three servers have the same structure and parameter scheme
- **No code duplication**: Binary and CLI use the same `run()` function
- **Maintainability**: Easier to understand and modify
- **Server autonomy**: Servers handle their own argument parsing and path normalization
- **CLI simplicity**: CLI doesn't need to know server-specific flags
- **Handles complex cases**: Servers can correctly parse mixed flags and paths (e.g., `--port 8080 foo.yml --debug`)
- **User experience**: Unified flags (`-h`, `-d`) across all servers
- **CLI integration**: Single install provides all server launchers

## Backward Compatibility

- Binary entrypoints remain unchanged (still work as standalone executables)
- Existing scripts using binaries continue to work
- Flag aliases can be maintained for compatibility (e.g., `--verbose` → `--debug`)

## Publish Order Verification

The publish script (`scripts/publish.sh`) already has the correct dependency order:

1. `@tsagent/core` (no internal deps)
2. `@tsagent/server` (a2a-server, depends on core)
3. `@tsagent/orchestrator` (a2a-mcp, depends on server)
4. `@tsagent/acp-server` (depends on core)
5. `@tsagent/agent-mcp` (depends on core)
6. `@tsagent/meta-mcp` (depends on core)
7. `@tsagent/cli` (depends on core, and will depend on the three servers)

**CLI is already last**, so when we add dependencies on `@tsagent/meta-mcp`, `@tsagent/server`, and `@tsagent/acp-server`, they will all be published before CLI. No changes needed to the publish script.

# Testing

## CLI (local build)

Test --mcp, --acp, --a2a, and no server with -h to verify command routing and programName
Test with fully specified path to agent
Test with agent filename in local dir (including non-existent)
Test with --create path/to/agent and filename (local dir)

## Orchestration servers

Interactive agent (tspark.yaml)
Tool exporting agents
- ToolVault status (tvault.yaml)
- Tool optimizer (optimizer.yaml)
A2A agents
- Orchestrator agent (orchestrator.yaml)
  - Install a2a-mcp (should cause orchestrator tab to appear)
  - Param is file:///Users/bob/Documents/GitHub/tsagent/agents/xxxxx (just path should also work)
- Skills agents
  - bob.yaml - Bob expert
  - Other demo was tspark in "Autonomous" mode as TeamSpark expert (no skills, uses default skill)

Test tsagent --mcp with path to agent (tvault.yaml/optimizer.yaml), validate with MCP inspector
Test tsagent --acp with Zed (tspark.yaml)
Test tsagent --a2a with a root agent and orchestrator point to the running a2a agents (bob.yaml/tspark.yaml in autonomous mode)

## Ship and validate

Test global installs
- Desktop app
- npm install -g @tsagent/cli

## Notes

### Desktop

Allow empty required config only when default is env:// and the env var is present (show required * appropriately)

### Finalize 

Delete this file