# Secret Management Design Document

## Overview

This document describes the design and implementation plan for adding support for external secret management in the TsAgent provider configuration system. The goal is to allow provider secrets to be stored and retrieved from multiple sources: direct values, environment variables, and 1Password.

## Objectives

1. **Support Multiple Secret Sources**: Enable provider secrets to be stored as:
   - Direct values (current behavior)
   - Environment variable references (by name)
   - 1Password references (using `op://` syntax)

2. **User Interface Enhancements**: Provide a user-friendly interface for selecting and configuring secret sources in the provider configuration UI.

3. **Runtime Secret Resolution**: Implement modular secret resolvers that can fetch secrets from the appropriate source at runtime.

4. **Environment Variable Loading**: Load environment variables from both the current working directory (CWD) and the agent directory.

5. **1Password Integration**: Integrate with the `@teamsparkai/1password` package to enable 1Password secret management when appropriate environment variables are present.

## Current Architecture

### Provider Configuration Storage

Provider configurations are currently stored in the agent's `tsagent.json` file under the `providers` key:

```json
{
  "providers": {
    "openai": {
      "OPENAI_API_KEY": "sk-xxxxx"
    },
    "bedrock": {
      "BEDROCK_ACCESS_KEY_ID": "AKIAxxxxx",
      "BEDROCK_SECRET_ACCESS_KEY": "xxxxx"
    }
  }
}
```

### Provider Configuration UI

The provider configuration UI is located in `apps/desktop/src/renderer/components/ProvidersTab.tsx`. Currently, secret fields are displayed as password inputs with a show/hide toggle.

### Secret Access

Providers access their configuration via `agent.getInstalledProviderConfig(providerType)`, which returns a `Record<string, string>` containing the raw configuration values.

## Design Decisions

### Secret Type Storage

**Decision**: Use implicit type detection via value prefixes rather than separate metadata fields.

**Rationale**:
- Simpler data model (no schema changes to `tsagent.json`)
- Backward compatible (existing direct values continue to work)
- Easy to parse and validate
- Consistent with 1Password's `op://` reference format

**Format**:
- Direct value: `"sk-xxxxx"` (no prefix, current behavior)
- Environment variable: `"env://VARIABLE_NAME"`
- 1Password: `"op://vault/item/field"` (standard 1Password reference format)

**Alternative Considered**: Storing secret type as separate metadata:
```json
{
  "providers": {
    "openai": {
      "OPENAI_API_KEY": {
        "type": "1password",
        "value": "op://vault/item/field"
      }
    }
  }
}
```
**Rejected because**: More complex schema, requires migration, harder to maintain backward compatibility.

### Environment Variable Loading

**Decision**: Load environment variables at the agent level using `dotenv` from:
1. Current working directory (CWD) - `.env` file
2. Agent directory - `.env` file

**Loading Order**:
1. Load from CWD `.env` first (lower priority)
2. Load from agent directory `.env` second (higher priority, overrides CWD)
3. Process environment variables (highest priority, overrides both)

**Rationale**: This allows for:
- Global defaults in CWD
- Agent-specific overrides in agent directory
- Runtime overrides via process environment

**Implementation**: Environment variable loading is handled during agent initialization. The environment variable resolver simply reads from `process.env`, which will already contain the loaded values. This separation of concerns keeps the resolver simple and focused on resolution logic only.

### 1Password Enablement

**Decision**: Enable 1Password support if either of these environment variables are present:
- `OP_SERVICE_ACCOUNT_TOKEN` (for 1Password Service Account)
- `OP_CONNECT_TOKEN` (for 1Password Connect - required)

Note: `OP_CONNECT_HOST` is optional and only used when `OP_CONNECT_TOKEN` is present. It is not used to determine availability.

**Rationale**: These are the standard environment variables used by the 1Password CLI and SDK. If either is present, it indicates 1Password is configured and available.

### Secret Resolution Architecture

**Decision**: Implement a modular resolver system with separate resolvers for each secret type.

**Rationale**:
- Easy to extend with additional secret sources (e.g., AWS Secrets Manager, HashiCorp Vault)
- Clear separation of concerns
- Testable in isolation
- Follows single responsibility principle

## Architecture

### Secret Resolver Interface

```typescript
interface SecretResolver {
  /**
   * Check if this resolver can handle the given secret reference
   */
  canResolve(reference: string): boolean;
  
  /**
   * Resolve the secret reference to its actual value
   */
  resolve(reference: string, context: SecretResolutionContext): Promise<string>;
  
  /**
   * Get the display name for this resolver type
   */
  getDisplayName(): string;
}

interface SecretResolutionContext {
  agent: Agent;
  logger: Logger;
}
```

### Secret Resolvers

#### 1. DirectValueResolver
- **Handles**: Values without any prefix
- **Behavior**: Returns the value as-is
- **Use Case**: Backward compatibility, simple secrets

#### 2. EnvironmentVariableResolver
- **Handles**: Values starting with `env://`
- **Behavior**: 
  - Extracts variable name from `env://VARIABLE_NAME`
  - Looks up in `process.env` (which will already contain values loaded from CWD and agent directory `.env` files by the agent)
  - Returns the value or throws if not found
- **Use Case**: Secrets stored in `.env` files
- **Note**: This resolver does not handle loading `.env` files - that is done at the agent level during initialization

#### 3. OnePasswordResolver
- **Handles**: Values starting with `op://`
- **Behavior**:
  - Uses `@teamsparkai/1password` package to resolve the reference
  - Validates 1Password is available (checks env vars in `process.env`)
  - Returns the secret value or throws if not found
- **Use Case**: Secrets stored in 1Password
- **Note**: If agent directory is needed, it can be obtained from `context.agent.path`

### Secret Manager

A centralized `SecretManager` class coordinates secret resolution:

```typescript
class SecretManager {
  private resolvers: SecretResolver[];
  private context: SecretResolutionContext;
  
  constructor(context: SecretResolutionContext) {
    this.context = context;
    this.resolvers = [
      new DirectValueResolver(),
      new EnvironmentVariableResolver(),
      new OnePasswordResolver()
    ];
  }
  
  async resolveSecret(reference: string): Promise<string> {
    for (const resolver of this.resolvers) {
      if (resolver.canResolve(reference)) {
        return await resolver.resolve(reference, this.context);
      }
    }
    throw new Error(`No resolver found for secret reference: ${reference}`);
  }
  
  async resolveProviderConfig(
    providerType: ProviderType,
    config: Record<string, string>
  ): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(config)) {
      resolved[key] = await this.resolveSecret(value);
    }
    return resolved;
  }
}
```

### Environment Variable Loading (Agent Level)

Environment variables are loaded during agent initialization using `dotenv`. This happens before any secret resolution occurs, ensuring that `process.env` contains all loaded values when resolvers need them.

**Implementation in Agent Initialization**:

```typescript
// In AgentImpl.load() or FileBasedAgentFactory.loadAgent()
import dotenv from 'dotenv';
import path from 'path';

// Load from CWD .env (lower priority, loaded first)
const cwdEnvPath = path.join(process.cwd(), '.env');
dotenv.config({ path: cwdEnvPath, override: false });

// Load from agent directory .env (higher priority, overrides CWD)
const agentEnvPath = path.join(agentDir, '.env');
dotenv.config({ path: agentEnvPath, override: true });

// process.env now contains all loaded values
// Process environment variables have highest priority (already in process.env)
```

**Note**: The `EnvironmentVariableResolver` does not need to know about this loading logic - it simply reads from `process.env`, which will already contain the properly loaded values.

## User Interface Design

### Provider Configuration Form

For each secret field in the provider configuration:

1. **Secret Source Selector**: A dropdown/radio group with three options:
   - "Direct Value" (default)
   - "Environment Variable"
   - "1Password" (only shown if 1Password is enabled)

2. **Input Field**: Changes based on selected source:
   - **Direct Value**: Password input (current behavior)
   - **Environment Variable**: Text input with placeholder "VARIABLE_NAME", displays as `env://VARIABLE_NAME`
   - **1Password**: Read-only input showing `op://vault/item/field`, with a "Browse" button

3. **1Password Browser Modal**: 
   - Opens when "Browse" button is clicked
   - Uses `@teamsparkai/1password` to:
     - List available vaults
     - List items in selected vault
     - List fields in selected item
   - Returns selected field as `op://vault/item/field` reference
   - Displays the reference in the input field

### UI Component Structure

```
EditProviderModal
├── SecretField (for each secret configValue)
    ├── SecretSourceSelector (dropdown)
    ├── DirectValueInput (password input, shown when "Direct Value" selected)
    ├── EnvVarInput (text input, shown when "Environment Variable" selected)
    └── OnePasswordInput (read-only input + Browse button, shown when "1Password" selected)
        └── OnePasswordBrowserModal (modal dialog)
            ├── VaultList
            ├── ItemList
            └── FieldList
```

## Implementation Plan

### Phase 1: Foundation and Environment Variable Support

**Goal**: Implement environment variable loading and basic secret resolution infrastructure.

**Tasks**:
1. Add environment variable loading to agent initialization
   - Use `dotenv` to load `.env` files from CWD and agent directory
   - Integrate into `AgentImpl.load()` or `FileBasedAgentFactory.loadAgent()`
   - Ensure proper priority ordering (CWD first, then agent dir, then process.env)

2. Create `SecretResolver` interface and base infrastructure
   - Define interface
   - Create `DirectValueResolver` (trivial implementation)
   - Create `EnvironmentVariableResolver`
   - Create `SecretManager` class

3. Update provider access to use secret resolution
   - Modify `Agent.getInstalledProviderConfig()` to return resolved values
   - Or create new method `getResolvedProviderConfig()` (preferred to maintain backward compatibility)
   - Update all provider constructors to use resolved config

4. Update UI for environment variable support
   - Add secret source selector to `EditProviderModal`
   - Add environment variable input field
   - Update save logic to store `env://` prefixed values

5. Testing
   - Unit tests for environment variable loading
   - Unit tests for secret resolvers
   - Integration tests with providers

**Deliverables**:
- Environment variable loading integrated into agent initialization (using `dotenv`)
- Secret resolution for direct values and environment variables
- UI support for selecting environment variables as secret source

### Phase 2: 1Password Integration

**Goal**: Integrate 1Password support for secret management.

**Tasks**:
1. Add `@teamsparkai/1password` package dependency
   - Add to `packages/agent-api/package.json`
   - Install and verify package works

2. Implement 1Password detection
   - Check for `OP_SERVICE_ACCOUNT_TOKEN` or `OP_CONNECT_TOKEN` environment variables
   - Create utility to check if 1Password is available
   - Add to agent initialization

3. Create `OnePasswordResolver`
   - Implement `SecretResolver` interface
   - Use `@teamsparkai/1password` to resolve `op://` references
   - Handle errors gracefully (1Password unavailable, invalid reference, etc.)

4. Create 1Password browser UI components
   - `OnePasswordBrowserModal` component
   - Vault list component
   - Item list component
   - Field list component
   - Integration with `@teamsparkai/1password` for browsing

5. Update provider configuration UI
   - Add "1Password" option to secret source selector (only if 1Password is enabled)
   - Add `OnePasswordInput` component
   - Wire up "Browse" button to open modal
   - Handle `op://` reference display and storage

6. Testing
   - Unit tests for `OnePasswordResolver`
   - Integration tests with 1Password (may require mock)
   - UI tests for 1Password browser modal

**Deliverables**:
- 1Password secret resolution at runtime
- 1Password browser modal in UI
- UI support for selecting 1Password secrets

### Phase 3: Refactoring and Enhancement

**Goal**: Refactor for maintainability and add enhancements.

**Tasks**:
1. Refactor provider initialization
   - Ensure all providers use resolved secrets
   - Add error handling for missing/invalid secrets
   - Improve error messages

2. Add validation
   - Validate `env://` references (check variable exists)
   - Validate `op://` references (check 1Password connectivity and reference validity)
   - Show validation errors in UI

3. Add secret masking in logs
   - Ensure resolved secrets are never logged
   - Mask secret values in error messages
   - Add logging for secret resolution attempts (without values)

4. Documentation
   - Update provider configuration documentation
   - Add guide for setting up environment variables
   - Add guide for setting up 1Password integration
   - Document `op://` reference format

5. Migration considerations
   - Ensure backward compatibility with existing configs
   - Consider migration tool if needed (probably not needed due to implicit detection)

**Deliverables**:
- Improved error handling and validation
- Enhanced logging (with secret masking)
- Complete documentation

### Phase 4: Testing and Polish

**Goal**: Comprehensive testing and user experience improvements.

**Tasks**:
1. End-to-end testing
   - Test all three secret sources with all providers
   - Test error scenarios (missing env vars, 1Password unavailable, etc.)
   - Test UI workflows

2. Performance testing
   - Ensure secret resolution doesn't significantly impact startup time
   - Cache 1Password connections if possible
   - Ensure environment variable loading (via dotenv) is efficient

3. User experience improvements
   - Add helpful tooltips and hints
   - Improve error messages
   - Add loading states for 1Password operations
   - Consider adding secret validation on save

4. Security review
   - Review secret handling for potential vulnerabilities
   - Ensure secrets are never persisted in logs
   - Verify proper cleanup of secret values in memory

**Deliverables**:
- Comprehensive test coverage
- Polished user experience
- Security review completion

## File Structure

### New Files

```
packages/agent-api/src/
├── secrets/
│   ├── index.ts
│   ├── secret-manager.ts
│   ├── secret-resolver.ts
│   └── resolvers/
│       ├── direct-value-resolver.ts
│       ├── env-var-resolver.ts
│       └── onepassword-resolver.ts

apps/desktop/src/renderer/components/
├── ProvidersTab.tsx (modified)
└── OnePasswordBrowserModal.tsx (new)
```

### Modified Files

```
packages/agent-api/src/
├── core/agent-api.ts (add secret resolution and env var loading)
├── core/agent-strategy.ts (add env var loading to load method)
└── providers/*.ts (use resolved configs)

apps/desktop/src/
├── renderer/components/ProvidersTab.tsx (add secret source selector)
└── main/main.ts (no changes needed - env loading happens at agent level)
```

## Security Considerations

1. **Secret Storage**: 
   - Never log secret values (resolved or unresolved)
   - Mask secrets in error messages
   - Clear secret values from memory when possible

2. **Environment Variables**:
   - Validate `.env` files are not committed to version control
   - Document security best practices

3. **1Password Integration**:
   - Validate 1Password credentials before enabling
   - Handle 1Password connection failures gracefully
   - Cache 1Password connections securely

4. **Access Control**:
   - Ensure only authorized users can modify provider configurations
   - Consider adding audit logging for secret access

## Migration Path

**Backward Compatibility**: The design maintains full backward compatibility:
- Existing direct values continue to work without modification
- No migration of existing `tsagent.json` files required
- New features are opt-in via UI selection

**Future Enhancements** (out of scope for initial implementation):
- Support for additional secret managers (AWS Secrets Manager, HashiCorp Vault, etc.)
- Secret rotation support
- Secret versioning
- Secret sharing between agents

## Success Criteria

1. ✅ Users can configure provider secrets using environment variables
2. ✅ Users can configure provider secrets using 1Password references
3. ✅ Environment variables are loaded from both CWD and agent directory
4. ✅ 1Password support is automatically enabled when environment variables are present
5. ✅ UI provides intuitive selection and configuration of secret sources
6. ✅ All existing functionality continues to work (backward compatibility)
7. ✅ Secrets are never logged or exposed in error messages
8. ✅ Comprehensive test coverage for all secret resolution paths

## Timeline Estimate

- **Phase 1**: 1-2 weeks
- **Phase 2**: 2-3 weeks
- **Phase 3**: 1-2 weeks
- **Phase 4**: 1 week

**Total**: 5-8 weeks

## Dependencies

- `@teamsparkai/1password` package (must be available and functional)
- `dotenv` package for `.env` file parsing (needs to be added to `packages/agent-api/package.json`)
- No breaking changes to existing provider interfaces

## Open Questions

1. Should we support multiple `.env` files (e.g., `.env.local`, `.env.production`)?
   - **Decision**: Start with single `.env` file, can be enhanced later

2. Should we cache resolved secrets or resolve on every access?
   - **Decision**: Resolve on every access for security (secrets may change), but cache 1Password connections

3. Should we support secret validation in the UI before save?
   - **Decision**: Yes, validate in Phase 3

4. How should we handle 1Password authentication failures?
   - **Decision**: Show clear error message, disable 1Password option in UI

5. Should we support editing `op://` references directly (not just via browser)?
   - **Decision**: Yes, allow manual entry but validate format

