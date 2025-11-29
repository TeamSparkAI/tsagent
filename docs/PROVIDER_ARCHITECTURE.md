# Provider Architecture - As-Built Documentation

## Overview

This document describes the completed provider architecture refactoring, which introduced a `ProviderDescriptor` pattern to decouple the `ProviderFactory` from provider implementation classes, and enabled Zod schema-based configuration with environment variable defaults.

## Goals

1. **Decouple factory from provider classes** - Factory works with descriptors, not provider classes
2. **Enable future auto-discovery** - Descriptors can be discovered and registered automatically
3. **Eliminate static method issues** - All methods are instance methods on descriptors
4. **Strong typing** - Each descriptor knows its configuration type internally
5. **Clean separation** - Descriptor handles metadata/construction, provider handles runtime behavior
6. **Zod schema as single source of truth** - Use Zod schemas for validation and defaults
7. **Enable empty provider configs** - Empty configs (`{}`) automatically use environment variable defaults
8. **Type-safe configurations** - Provider configs are typed throughout the codebase
9. **Keep provider details encapsulated** - Provider-specific config types stay internal to each provider

## Architecture

### ProviderDescriptor Base Class

The `ProviderDescriptor` abstract class (`packages/agent-api/src/providers/provider-descriptor.ts`) serves as the main abstraction that the factory knows about. It encapsulates:

- **Provider metadata** (`info: ProviderInfo`) - Name, description, website, config field definitions
- **Configuration schema** (`configSchema: z.ZodSchema<any>`) - Zod schema for validation and defaults
- **Default model ID** (`getDefaultModelId(): string`) - Default model for the provider
- **Validation logic** (`validateConfiguration()`) - Schema validation + secret resolution + provider-specific hooks
- **Instance creation** (`create()`) - Validates config and creates provider instance via `createProvider()`

**Key Design Decisions:**
- Public interface uses `Record<string, string>` for config (keeps provider details encapsulated)
- Internal typing handled by each descriptor (casts to typed config internally)
- Provider-specific validation hooks via `validateProvider()` method (no-op by default)
- Abstract `createProvider()` method must be implemented by each descriptor

### BaseProvider Class

The `BaseProvider<ConfigType>` abstract class (`packages/agent-api/src/providers/base-provider.ts`) provides a minimal convenience base class for provider runtime implementations:

- **Shared properties**: `config`, `modelName`, `agent`, `logger` (protected readonly)
- **Constructor pattern**: Ensures consistent constructor signature across all providers
- **Abstract methods**: Enforces `getModels()` and `generateResponse()` (Provider interface)

**Note**: This class is a convenience to avoid repeating property declarations in each provider. It could be replaced with an interface, but would require each provider to declare the 4 properties themselves (~32 lines of boilerplate across 8 providers).

### Provider Implementation Pattern

Each provider file contains both the descriptor and the provider implementation:

```typescript
// Schema defined outside class for type inference
const ProviderConfigSchema = z.object({
  CONFIG_KEY: z.string().default('env://CONFIG_KEY'),
});

// Internal type (not exported - provider details stay encapsulated)
type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// Provider Descriptor (exported)
export class ProviderDescriptor extends ProviderDescriptor {
  readonly type = ProviderType.Provider;
  readonly info: ProviderInfo = { /* ... */ };
  readonly configSchema = ProviderConfigSchema;
  
  getDefaultModelId(): string {
    return 'default-model-id';
  }
  
  // Optional: Override for API connectivity checks
  protected async validateProvider(...) { /* ... */ }
  
  protected async createProvider(...): Promise<Provider> {
    const typedConfig = config as ProviderConfig;
    return new ProviderImpl(modelName, agent, logger, typedConfig);
  }
}

// Export descriptor instance for registration
export const providerDescriptor = new ProviderDescriptor();

// Provider implementation (private class)
class ProviderImpl extends BaseProvider<ProviderConfig> {
  // Runtime implementation
}
```

### ProviderFactory

The `ProviderFactory` (`packages/agent-api/src/providers/provider-factory.ts`) now:

- Uses a `Map<ProviderType, ProviderDescriptor>` to store descriptors
- Registers all provider descriptors in constructor
- Delegates all operations to descriptors:
  - `create()` → `descriptor.create()`
  - `validateConfiguration()` → `descriptor.validateConfiguration()`
  - `getProviderInfo()` → `descriptor.getInfo()`
  - `getDefaultModelId()` → `descriptor.getDefaultModelId()`

**Benefits:**
- Factory is minimal and doesn't know about provider classes
- Easy to add new providers (just register descriptor)
- Sets up for future auto-discovery

## Completed Implementation

### ✅ Provider Descriptor Pattern

- [x] Created `ProviderDescriptor` base class with all core functionality
- [x] Refactored all 8 providers to use descriptor pattern:
  - Bedrock
  - Claude
  - Docker
  - Gemini
  - Local
  - Ollama
  - OpenAI
  - Test
- [x] Updated `ProviderFactory` to use descriptors instead of static methods
- [x] Removed static methods from provider classes
- [x] Moved `getDefaultModelId()` to `ProviderDescriptor`

### ✅ Zod Schema Integration

- [x] Each provider defines its own Zod schema for configuration
- [x] Schemas use `.default('env://VAR_NAME')` for environment variable defaults
- [x] Schema validation integrated into `validateConfiguration()` and `create()`
- [x] Secret resolution via `SecretManager` (handles `env://` and `op://` references)
- [x] Type-safe config access in provider implementations (e.g., `config.OPENAI_API_KEY`)

### ✅ Configuration Management

- [x] Empty configs (`{}`) automatically use schema defaults
- [x] Environment variable defaults work (e.g., `gemini: {}` works if `GOOGLE_API_KEY` is set)
- [x] `installProvider()` stores raw config (defaults applied when provider is created)
- [x] Validation happens before provider creation
- [x] Provider-specific validation hooks for API connectivity checks

### ✅ BaseProvider Simplification

- [x] Removed unused static methods (`validateAndResolve`, `createInstance`, `validateProvider`)
- [x] Kept minimal instance-level functionality (constructor, properties, abstract methods)

## Current State

### Provider Configuration Schemas

All providers now use Zod schemas with environment variable defaults:

- **Bedrock**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (both default to `env://`)
- **Claude**: `ANTHROPIC_API_KEY` (defaults to `env://ANTHROPIC_API_KEY`)
- **Docker**: `BASE_URL` (required, no default)
- **Gemini**: `GOOGLE_API_KEY` (defaults to `env://GOOGLE_API_KEY`)
- **Local**: No config required (empty schema)
- **Ollama**: `OLLAMA_HOST` (defaults to `env://OLLAMA_HOST`)
- **OpenAI**: `OPENAI_API_KEY` (defaults to `env://OPENAI_API_KEY`)
- **Test**: No config required (empty schema)

### File Structure

```
packages/agent-api/src/providers/
├── provider-descriptor.ts          # Base ProviderDescriptor class
├── provider-factory.ts              # Factory that uses descriptors
├── base-provider.ts                 # Base provider implementation class (convenience)
├── bedrock-provider.ts              # BedrockDescriptor + BedrockProvider
├── claude-provider.ts               # ClaudeDescriptor + ClaudeProvider
├── docker-provider.ts               # DockerDescriptor + DockerProvider
├── gemini-provider.ts               # GeminiDescriptor + GeminiProvider
├── local-provider.ts                # LocalDescriptor + LocalProvider
├── ollama-provider.ts               # OllamaDescriptor + OllamaProvider
├── openai-provider.ts               # OpenAIDescriptor + OpenAIProvider
└── test-provider.ts                 # TestDescriptor + TestProvider
```

## Open Issues & Remaining Work

### 1. ConfigValues Manual Maintenance

**Status**: Open

**Issue**: `ProviderInfo.configValues` is still manually defined in each provider descriptor. This duplicates information that could potentially be derived from the Zod schema.

**Current State**: Each provider manually defines `configValues` array with:
- `caption` - Display name
- `key` - Config key name
- `hint` - Help text
- `secret` - Whether field is secret
- `credential` - Whether field is credential
- `required` - Whether field is required
- `default` - Default value

**Potential Solutions** (not implemented):
- **Option 1**: Use Zod's `.describe()` for hints, naming conventions for secrets, derive `required` from `.optional()`
- **Option 2**: Custom Zod extensions (`.caption()`, `.secret()`, etc.) to store metadata in schema
- **Option 3**: Hybrid approach - derive what we can from schema, minimal metadata map for UI-specific fields

**Decision**: Keep manual for now. The duplication is minimal and the complexity of schema-driven extraction may not be worth it. Revisit if it becomes a maintenance burden.

### 2. Dynamic Provider Discovery/Plugin System

**Status**: Future Enhancement

**Issue**: Provider descriptors are currently manually imported and registered in `ProviderFactory` constructor. External providers cannot be added without modifying core code.

**Current State**: All provider descriptors are explicitly imported and registered in `ProviderFactory` constructor:
```typescript
this.register(bedrockProviderDescriptor);
this.register(testProviderDescriptor);
// ... etc
```

**Potential Solutions**:
- **Auto-discovery**: Scan provider files and automatically register descriptors:
  - Scan `packages/agent-api/src/providers/*-provider.ts`
  - Look for exports matching pattern `*ProviderDescriptor` or `*providerDescriptor`
  - Automatically register them
- **Plugin API**: Allow external providers to register descriptors via a plugin API:
  - `ProviderFactory.registerPlugin(descriptor)` method
  - Or plugin manifest/configuration system

**Priority**: Low - Current manual registration is simple, explicit, and sufficient for current needs.

**Note**: Lazy loading of provider implementations doesn't make sense because:
- We need to list all providers (via descriptors) so users can choose which to install
- Provider instances are only created when actually needed (when provider is installed and used)
- Descriptors are lightweight (just metadata), so loading them all is not a performance concern

## Design Decisions

1. **Provider Config Schema Location**: In each provider file - keeps provider details encapsulated
2. **Environment Variable Defaults**: Use `env://VAR_NAME` syntax in schema defaults, resolved at runtime by `SecretManager`
3. **Provider Registry**: Use a `Map<ProviderType, ProviderDescriptor>` in `ProviderFactory`
4. **Base Class Pattern**: Use generic `BaseProvider<ConfigType>` for runtime behavior (convenience class)
5. **Descriptor Pattern**: Use `ProviderDescriptor` for factory abstraction (metadata, validation, creation)
6. **Public Interface**: Factory and external code see `Record<string, string>` - provider details stay internal
7. **Validation Hook**: `validateProvider()` hook allows providers to add semantic/live validation beyond schema validation
8. **Self-Contained Providers**: Providers handle their own validation and construction - factory just delegates

## Success Criteria

- ✅ Factory decoupled from provider classes (works with descriptors only)
- ✅ No static methods on provider classes (all methods are instance methods on descriptors)
- ✅ Empty configs work with environment variables (e.g., `gemini: {}` works if `GOOGLE_API_KEY` is set)
- ✅ Schema validation catches invalid configs
- ✅ Defaults are applied automatically
- ✅ Existing configs continue to work
- ✅ Provider details remain encapsulated within each provider
- ✅ Type safety: Config is typed throughout (e.g., `config.OPENAI_API_KEY` with autocomplete)
- ✅ Factory is minimal - just delegates to descriptors
- ✅ Providers are self-contained and pluggable
- ✅ Descriptors handle metadata/construction, providers handle runtime behavior

## Migration Notes

- **Backward Compatible**: Existing provider configs continue to work
- **No Breaking Changes**: Schema validation is additive
- **Gradual Adoption**: Users can start using empty configs when ready
- **Type Safety**: Provider implementations now have typed config access

## Related Documentation

- `PROVIDER_CONFIG_DESIGN.md` - Original design for Zod schema integration (superseded by this document)
- `PROVIDER_DESCRIPTOR_DESIGN.md` - Original design for descriptor pattern (superseded by this document)
- `WORK_ITEMS.md` - Open work items including model settings management

