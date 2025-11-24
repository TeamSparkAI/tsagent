# Publish Script

The `publish.sh` script automates the publishing process for all TsAgent packages.

## Usage

```bash
# Publish all packages
npm run publish:all

# Dry run (test without publishing)
npm run publish:dry-run
```

Or directly:

```bash
./scripts/publish.sh          # Publish
./scripts/publish.sh --dry-run # Dry run
```

## What It Does

1. **Updates root package-lock.json**: Runs `npm install` in root to update the lock file with the new version
2. **Determines dependency order**: Publishes packages in the correct order based on dependencies
3. **For each package**:
   - Runs `npm install` to ensure dependencies are up to date
   - Runs `npm run build` to build the package
   - Runs `npm publish` to publish to npm
3. **Reinstalls dependents**: After publishing `@tsagent/core`, reinstalls dependencies in all packages that depend on it. Same for `@tsagent/server`.

## Publishing Order

1. `@tsagent/core` (no internal deps)
2. `@tsagent/server` (depends on core)
3. `@tsagent/orchestrator` (depends on server)
4. `@tsagent/acp-server` (depends on core)
5. `@tsagent/agent-mcp` (depends on core)
6. `@tsagent/meta-mcp` (depends on core)
7. `@tsagent/cli` (depends on core)

## Safety

- Prompts for confirmation before publishing
- Exits on any error (set -e)
- Only publishes packages listed in the script (excludes desktop app)

## Requirements

- Must be run from repository root
- Must be logged into npm (`npm login`)
- All packages must have valid `package.json` with correct versions

