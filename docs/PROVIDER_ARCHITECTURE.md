# Provider Architecture - As-Built Documentation

## Overview

This document describes the completed provider architecture refactoring, which introduced a `ProviderDescriptor` pattern to decouple the `ProviderFactory` from provider implementation classes, enabled Zod schema-based configuration with environment variable defaults, and uses simple string-based `ProviderId` types for runtime extensibility.

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
10. **Runtime extensibility** - Provider IDs are simple strings, enabling runtime discovery without compile-time constraints

## Architecture

### ProviderDescriptor Base Class

The `ProviderDescriptor` abstract class (`packages/agent-api/src/providers/provider-descriptor.ts`) serves as the main abstraction that the factory knows about. It encapsulates:

- **Provider ID** (`providerId: string`) - String identifier for the provider (e.g., `'openai'`, `'claude'`)
- **Provider metadata** (`info: ProviderInfo`) - Name, description, website, config field definitions
- **Configuration schema** (`configSchema: z.ZodSchema<any>`) - Zod schema for validation and defaults
- **Icon path** (`iconPath?: string`) - Relative path to provider icon within the package
- **Default model ID** (`getDefaultModelId(): string`) - Default model for the provider
- **Validation logic** (`validateConfiguration()`) - Schema validation + secret resolution + provider-specific hooks
- **Instance creation** (`create()`) - Validates config and creates provider instance via `createProvider()`
- **Icon resolution** (`getIcon()`) - Returns fully resolved file:// URL for the provider icon

**Constructor:**
- Takes `packageRoot: string` parameter - The root directory of the package containing the provider (used for icon resolution)
- Factory determines and passes the package root when creating descriptor instances

**Key Design Decisions:**
- Public interface uses `Record<string, string>` for config (keeps provider details encapsulated)
- Internal typing handled by each descriptor (casts to typed config internally)
- Provider-specific validation hooks via `validateProvider()` method (no-op by default)
- Abstract `createProvider()` method must be implemented by each descriptor
- Package root passed to constructor allows descriptor to resolve icon paths relative to its package location
- Icon resolution works identically for built-in and external providers

### BaseProvider Class

The `BaseProvider<ConfigType>` abstract class (`packages/agent-api/src/providers/base-provider.ts`) provides a minimal convenience base class for provider runtime implementations:

- **Shared properties**: `config`, `modelName`, `agent`, `logger`, `providerId` (protected readonly)
- **Constructor pattern**: Ensures consistent constructor signature across all providers
- **Abstract methods**: Enforces `getModels()` and `generateResponse()` (Provider interface)
- **Provider ID**: Providers receive `providerId` from their descriptor and use it when creating `ProviderModel` instances

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

// Provider Descriptor (exported as default)
export default class ProviderDescriptor extends ProviderDescriptor {
  readonly providerId = 'my-provider'; // String identifier
  readonly iconPath = 'assets/providers/provider-icon.png'; // Relative to package root
  readonly info: ProviderInfo = { /* ... */ };
  readonly configSchema = ProviderConfigSchema;
  
  constructor(packageRoot: string) {
    super(packageRoot);
  }
  
  getDefaultModelId(): string {
    return 'default-model-id';
  }
  
  // Optional: Override for API connectivity checks
  protected async validateProvider(...) { /* ... */ }
  
  protected async createProvider(...): Promise<Provider> {
    const typedConfig = config as ProviderConfig;
    return new ProviderImpl(modelName, agent, logger, typedConfig, this.providerId);
  }
}

// Provider implementation (private class)
class ProviderImpl extends BaseProvider<ProviderConfig> {
  // Runtime implementation
}
```

**Key Points:**
- Descriptor class is exported as **default export** (enables consistent discovery pattern for external plugins)
- Constructor takes `packageRoot` parameter and passes it to `super()`
- `providerId` is a string identifier (e.g., `'openai'`, `'claude'`, `'my-plugin'`)
- `iconPath` is relative to the package root (e.g., `assets/providers/icon.png`)
- Factory creates descriptor instances, passing the appropriate package root
- Provider implementations receive `providerId` in their constructor for use in `getModels()`

### ProviderFactory

The `ProviderFactory` (`packages/agent-api/src/providers/provider-factory.ts`) now:

- Uses a `Map<ProviderId, ProviderDescriptor>` to store descriptors
- Determines agent-api package root once in constructor
- Creates and registers all built-in provider descriptors with package root
- Delegates all operations to descriptors:
  - `create()` → `descriptor.create()`
  - `validateConfiguration()` → `descriptor.validateConfiguration()`
  - `getProviderInfo()` → `descriptor.getInfo()`
  - `getProviderIcon()` → `descriptor.getIcon()`
  - `getDefaultModelId()` → `descriptor.getDefaultModelId()`

**Registration Pattern:**
```typescript
constructor(agent: Agent, logger: Logger) {
  // Determine agent-api package root
  const agentApiRoot = path.dirname(require.resolve('@tsagent/core/package.json'));
  
  // Create descriptor instances with package root
  this.register(new BedrockProviderDescriptor(agentApiRoot));
  this.register(new OpenAIProviderDescriptor(agentApiRoot));
  // ... etc
}
```

**Benefits:**
- Factory is minimal and doesn't know about provider classes
- Easy to add new providers (just register descriptor with package root)
- Sets up for future auto-discovery
- Icon resolution works consistently for all providers

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
packages/agent-api/
├── assets/
│   └── providers/                   # Provider icons
│       ├── anthropic.png
│       ├── bedrock.png
│       ├── docker.png
│       ├── frosty.png
│       ├── gemini.png
│       ├── local.png
│       ├── ollama.png
│       └── openai.png
└── src/
    └── providers/
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

**Status**: Architecture Ready - Discovery Mechanism Needed

**Current Capability**: The provider architecture **already fully supports** runtime plugin providers. External providers can be registered at runtime and are indistinguishable from built-in providers to client applications.

**How It Works**:

The `ProviderFactory.register()` method accepts any `ProviderDescriptor` instance. Once registered, runtime providers work identically to built-ins:

1. **Registration**: Simply call `factory.register(externalDescriptor)` - same method used for built-ins
2. **API Transparency**: All Agent API methods work identically:
   - `getAvailableProviders()` returns runtime providers alongside built-ins
   - `getProviderInfo(providerId)` works for any registered provider
   - `getProviderIcon(providerId)` works for any registered provider
   - `createProvider(providerId)` works for any registered provider
3. **No Client Changes**: Client applications cannot distinguish between built-in and runtime providers - they both appear as `ProviderId` strings in the API

**What's Missing**: Only the discovery/loading mechanism needs to be implemented. The architecture is already ready:

- External plugins must export a default class extending `ProviderDescriptor`
- Plugins receive their `packageRoot` in the constructor (same as built-ins)
- Registration uses the existing `register()` method
- All factory operations work via the descriptor Map (no origin tracking)

**Discovery Mechanism Options**:
- **NPM-Based Discovery**: Scan `node_modules` for packages with plugin manifest, load and register them (see `PLUGINS.md`)
- **Auto-Discovery**: Scan `packages/agent-api/src/providers/*-provider.ts` for built-in providers (future enhancement for consistency)
- **Explicit Registration**: Manual registration API for applications to register plugins programmatically

**Note**: Lazy loading of provider implementations doesn't make sense because:
- We need to list all providers (via descriptors) so users can choose which to install
- Provider instances are only created when actually needed (when provider is installed and used)
- Descriptors are lightweight (just metadata), so loading them all is not a performance concern

#### Integration with Plugin System (NPM-Based)

If implementing runtime provider discovery using the NPM-based plugin system (see `PLUGINS.md`), consider the following provider-specific concerns:

**ProviderId Type - Runtime Extensibility**

The `ProviderId` type is a simple string alias, enabling runtime discovery of external providers without compile-time constraints:

```typescript
export type ProviderId = string;
```

**Design Decision**: Instead of using an enum or branded type, `ProviderId` is a plain string type alias. This allows:
- External plugins to use any string identifier (e.g., `'my-custom-provider'`)
- Clients to store provider IDs as strings in configuration files
- Runtime validation when providers are actually used, not at compile time

**Benefits**:
- No compile-time constraints on provider IDs
- Runtime validation occurs when providers are looked up in the factory map
- Clients can store provider IDs as strings without type complications
- Enables dynamic provider discovery at runtime
- Validation happens naturally when the factory tries to look up the provider

**Validation**: Provider IDs are validated at runtime when:
- Provider is looked up in the factory descriptor map (`descriptors.get(providerId)`)
- Provider configuration is accessed
- Provider instance is created

If an unknown provider ID is provided, the factory returns `undefined` or throws an error, ensuring invalid providers cannot be used. This approach prioritizes runtime flexibility over compile-time type safety for provider identifiers.

**Plugin Registration Pattern**

External provider plugins should follow this pattern:

```typescript
// Plugin's descriptor file (src/provider-descriptor.ts)
import { ProviderDescriptor, ProviderId, ProviderInfo } from '@tsagent/core';
import { z } from 'zod';

const MyPluginConfigSchema = z.object({
  API_KEY: z.string().default('env://MY_PLUGIN_API_KEY'),
});

type MyPluginConfig = z.infer<typeof MyPluginConfigSchema>;

// Export descriptor class as default
export default class MyPluginProviderDescriptor extends ProviderDescriptor {
  readonly providerId = 'my-plugin'; // String identifier - no type casting needed
  readonly iconPath = 'assets/icon.png'; // Relative to plugin package root
  readonly info: ProviderInfo = {
    name: 'My Plugin Provider',
    description: 'Description of my plugin provider',
    configValues: [/* ... */]
  };
  readonly configSchema = MyPluginConfigSchema;
  
  constructor(packageRoot: string) {
    super(packageRoot);
  }
  
  getDefaultModelId(): string {
    return 'default-model';
  }
  
  protected async createProvider(...): Promise<Provider> {
    // Implementation - pass providerId to provider constructor
    return new MyPluginProvider(modelName, agent, logger, typedConfig, this.providerId);
  }
}
```

**Plugin Package Structure:**
```
my-plugin-provider/
├── package.json          # Must include @tsagent/core as dependency
├── assets/
│   └── icon.png          # Provider icon
└── dist/
    └── index.js          # Exports default descriptor class
```

**Factory Discovery Pattern:**
When the factory discovers an external plugin (via NPM plugin system), it:
1. Determines the plugin's package root: `path.dirname(require.resolve('@vendor/plugin/package.json'))`
2. Loads the plugin module: `const pluginModule = require('@vendor/plugin')`
3. Instantiates the descriptor: `new pluginModule.default(pluginPackageRoot)`
4. Registers it: `this.register(descriptor)` - **same method used for built-ins**

This pattern works identically for built-in and external providers - the only difference is which package root is passed to the constructor.

**✅ Runtime Plugin Support Verification**:
Once registered via `factory.register()`, runtime providers:
- Appear in `getAvailableProviders()` alongside built-ins
- Return metadata via `getProviderInfo(providerId)` - same interface
- Return icons via `getProviderIcon(providerId)` - same file:// URL format
- Can be installed, configured, and used via all Agent API methods
- Are completely indistinguishable from built-ins to client applications

**Summary**: The provider architecture is **fully ready** for runtime plugin providers. The only missing piece is a discovery/loading mechanism (NPM scanning, plugin manifest parsing, etc.) to find and load external plugin modules. Once a plugin module is loaded and its descriptor is registered via `factory.register()`, it works identically to built-in providers through all Agent API methods with no client-side changes needed.

**Integration Points**:

1. **Factory Access**: Plugins need a way to access the `ProviderFactory` instance. Options:
   - Export factory as singleton from agent-api package
   - Provide a global registry: `globalThis.__ProviderFactoryRegistry`
   - Use dependency injection pattern where plugins receive factory reference

2. **Discovery Timing**: 
   - Discovery should happen after built-in providers are registered
   - Can be called explicitly via `ProviderFactory.discoverPlugins()` method
   - Or automatically during factory construction

3. **Hybrid Approach (Recommended)**:
   - Keep explicit registration of built-in providers (fast, explicit, type-safe)
   - Add discovery method that runs after built-in registration
   - External plugins discovered via NPM plugin mechanism
   - This gives best of both worlds: fast startup for core, flexibility for extensions

4. **Provider Validation**:
   - External plugins must extend `ProviderDescriptor` base class
   - Validate descriptor has required properties before registration
   - Check for type conflicts (don't allow external plugins to override built-in types, or handle gracefully)
   - Ensure plugin's `type` field is a valid non-conflicting string

5. **Error Handling**:
   - Failed plugin registration should not prevent factory from working
   - Log warnings for plugins that fail to register
   - Consider providing a `getFailedPlugins()` method for diagnostics

**Example Implementation Outline**:

```typescript
export class ProviderFactory {
  // ... existing code ...
  
  /**
   * Discover and register external provider plugins
   * Should be called after built-in providers are registered
   */
  async discoverPlugins(pluginPackageJsonPath?: string): Promise<void> {
    // Use NPM plugin discovery mechanism (see PLUGINS.md)
    // For each discovered plugin with pluginType: "provider":
    //   1. Validate manifest
    //   2. Determine plugin package root
    //      const pluginPackageRoot = path.dirname(require.resolve(`${pluginName}/package.json`));
    //   3. Load plugin module
    //      const pluginModule = require(pluginName);
    //   4. Instantiate descriptor with package root
    //      const descriptor = new pluginModule.default(pluginPackageRoot);
    //   5. Register descriptor
    //      this.register(descriptor);
    //   6. Handle errors gracefully
  }
  
  /**
   * Register a provider descriptor (for built-ins and plugins)
   * Enhanced to handle conflicts
   */
  register(descriptor: ProviderDescriptor): void {
    const existing = this.descriptors.get(descriptor.providerId);
    if (existing && isBuiltInProvider(descriptor.providerId)) {
      // Don't allow overriding built-in providers
      this.logger.warn(`Cannot override built-in provider: ${descriptor.providerId}`);
      return;
    }
    this.descriptors.set(descriptor.providerId, descriptor);
  }
  
  /**
   * Get provider icon URL
   * Returns file:// URL that can be used by client applications
   */
  getProviderIcon(providerId: ProviderId): string | null {
    const descriptor = this.descriptors.get(providerId);
    return descriptor?.getIcon() || null;
  }
}
```

**Provider-Specific Plugin Requirements**:

- Plugin must export a **default class** extending `ProviderDescriptor`
- Plugin constructor must take `packageRoot: string` and call `super(packageRoot)`
- Plugin must implement all abstract methods of `ProviderDescriptor`
- Plugin must provide a unique `providerId` string that doesn't conflict with built-ins
- Plugin should define `iconPath` property pointing to icon relative to package root
- Plugin's `info.configValues` should follow the same structure as built-in providers for UI consistency
- Plugin should use Zod schemas with `env://` defaults for configuration (consistent with built-ins)
- Plugin icon should be included in the plugin package (e.g., `assets/icon.png`)

**Icon Support for External Providers:**

External providers implement icon support identically to built-in providers:

```typescript
export default class MyPluginDescriptor extends ProviderDescriptor {
  readonly iconPath = 'assets/icon.png'; // Relative to plugin package root
  
  constructor(packageRoot: string) {
    super(packageRoot); // Stores packageRoot for icon resolution
  }
  
  // getIcon() method inherited from base class resolves:
  // path.join(packageRoot, iconPath) → file:// URL
}
```

The factory's `getProviderIcon()` method works for both built-in and external providers:
- Built-in: Uses agent-api package root + `assets/providers/{name}.png`
- External: Uses plugin package root + `assets/icon.png` (or whatever path the plugin specifies)

Client applications call `agent.getProviderIcon(providerId)` and receive a `file://` URL that can be used directly in `<img src={iconUrl} />` tags.

**Benefits of Plugin System for Providers**:

- Enables third-party provider implementations without core code changes
- Allows community-contributed providers
- Supports provider updates via npm updates
- Maintains type safety within each plugin (plugin code is typed, factory interface is `Record<string, string>`)
- Leverages existing NPM infrastructure for distribution and versioning

**Challenges**:

- Type system limitations (enum → string union type migration)
- Factory access pattern (how plugins get factory reference)
- Testing external plugins (need integration test patterns)
- Version compatibility (plugin API versioning strategy)

## Design Decisions

1. **Provider Config Schema Location**: In each provider file - keeps provider details encapsulated
2. **Environment Variable Defaults**: Use `env://VAR_NAME` syntax in schema defaults, resolved at runtime by `SecretManager`
3. **Provider Registry**: Use a `Map<ProviderId, ProviderDescriptor>` in `ProviderFactory`
4. **Provider ID Type**: `ProviderId` is a simple string type alias (`export type ProviderId = string`) - no enum or branded type complexity
5. **Runtime Validation**: Provider IDs are validated at runtime when looked up in the factory map, not at compile time
4. **Base Class Pattern**: Use generic `BaseProvider<ConfigType>` for runtime behavior (convenience class)
5. **Descriptor Pattern**: Use `ProviderDescriptor` for factory abstraction (metadata, validation, creation)
6. **Public Interface**: Factory and external code see `Record<string, string>` - provider details stay internal
7. **Validation Hook**: `validateProvider()` hook allows providers to add semantic/live validation beyond schema validation
8. **Self-Contained Providers**: Providers handle their own validation and construction - factory just delegates
9. **Icon Support**: Icons stored in package assets, resolved via `getIcon()` method using package root
10. **Default Export Pattern**: Descriptor classes exported as default for consistent plugin discovery
11. **Package Root Injection**: Factory determines and passes package root to descriptor constructor

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
- ✅ Icon support with consistent resolution for built-in and external providers
- ✅ Default export pattern enables consistent plugin discovery

## Migration Notes

- **Backward Compatible**: Existing provider configs continue to work
- **No Breaking Changes**: Schema validation is additive
- **Gradual Adoption**: Users can start using empty configs when ready
- **Type Safety**: Provider implementations now have typed config access

## Related Documentation

- `PROVIDER_CONFIG_DESIGN.md` - Original design for Zod schema integration (superseded by this document)
- `PROVIDER_DESCRIPTOR_DESIGN.md` - Original design for descriptor pattern (superseded by this document)
- `WORK_ITEMS.md` - Open work items including model settings management

