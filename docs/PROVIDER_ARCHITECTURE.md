# Provider Architecture

## Overview

This document describes the provider architecture, which uses a `ProviderDescriptor` pattern to decouple the `ProviderFactory` from provider implementation classes. The architecture supports Zod schema-based configuration with environment variable defaults, and uses simple string-based `ProviderId` types for runtime extensibility.

## Goals

1. **Decouple factory from provider classes** - Factory works with descriptors, not provider classes
2. **Enable auto-discovery** - Descriptors can be discovered and registered automatically
3. **Instance-based methods** - All methods are instance methods on descriptors
4. **Strong typing** - Each descriptor knows its configuration type internally
5. **Clean separation** - Descriptor handles metadata/construction, provider handles runtime behavior
6. **Zod schema as single source of truth** - Use Zod schemas for validation and defaults
7. **Enable empty provider configs** - Empty configs (`{}`) automatically use environment variable defaults
8. **Type-safe configurations** - Provider configs are typed throughout the codebase
9. **Keep provider details encapsulated** - Provider-specific config types stay internal to each provider
10. **Runtime extensibility** - Provider IDs are simple strings, enabling runtime discovery without compile-time constraints

## Architecture

### ProviderDescriptor Base Class

The `ProviderDescriptor` abstract class (`packages/agent-api/src/providers/provider-descriptor.ts`) serves as the main abstraction that the factory uses. It encapsulates:

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

**Note**: This class is a convenience to avoid repeating property declarations in each provider. It could be replaced with an interface, but would require each provider to declare the 5 properties themselves.

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

The `ProviderFactory` (`packages/agent-api/src/providers/provider-factory.ts`) manages provider descriptors:

- Uses a `Map<ProviderId, ProviderDescriptor>` to store descriptors
- Determines agent-api package root from `globalThis.__TSAGENT_CORE_ROOT` (set by runtime entrypoint)
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
  // Determine agent-api package root from runtime global
  const agentApiRoot = (globalThis as any).__TSAGENT_CORE_ROOT;
  if (!agentApiRoot) {
    throw new Error('TSAGENT_CORE_ROOT is not set. Ensure you are using the @tsagent/core/runtime entrypoint.');
  }
  
  // Create descriptor instances with package root
  this.register(new BedrockProviderDescriptor(agentApiRoot));
  this.register(new OpenAIProviderDescriptor(agentApiRoot));
  // ... etc
}
```

**Benefits:**
- Factory is minimal and doesn't know about provider classes
- Easy to add new providers (just register descriptor with package root)
- Supports runtime plugin discovery
- Icon resolution works consistently for all providers

## Current State

### Provider Configuration Schemas

All providers use Zod schemas with environment variable defaults:

- **Bedrock**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (both default to `env://`)
- **Claude**: `ANTHROPIC_API_KEY` (defaults to `env://ANTHROPIC_API_KEY`)
- **Docker**: `BASE_URL` (required, no default)
- **Gemini**: `GOOGLE_API_KEY` (defaults to `env://GOOGLE_API_KEY`)
- **Local**: No config required (empty schema)
- **Ollama**: `OLLAMA_HOST` (defaults to `env://OLLAMA_HOST`)
- **OpenAI**: `OPENAI_API_KEY` (defaults to `env://OPENAI_API_KEY`)
- **Test**: No config required (empty schema)

### Built-in Providers

The following providers are built-in:

- Bedrock
- Claude
- Docker
- Gemini
- Local
- Ollama
- OpenAI
- Test

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

## Runtime Plugin Support

The provider architecture fully supports runtime plugin providers. External providers can be registered at runtime and are indistinguishable from built-in providers to client applications.

### How It Works

The `ProviderFactory.register()` method accepts any `ProviderDescriptor` instance. Once registered, runtime providers work identically to built-ins:

1. **Registration**: Simply call `factory.register(externalDescriptor)` - same method used for built-ins
2. **API Transparency**: All Agent API methods work identically:
   - `getAvailableProviders()` returns runtime providers alongside built-ins
   - `getProviderInfo(providerId)` works for any registered provider
   - `getProviderIcon(providerId)` works for any registered provider
   - `createProvider(providerId)` works for any registered provider
3. **No Client Changes**: Client applications cannot distinguish between built-in and runtime providers - they both appear as `ProviderId` strings in the API

### Plugin Discovery

A discovery/loading mechanism can be implemented to find and load external plugin modules. Potential approaches:

- **NPM-Based Discovery**: Scan `node_modules` for packages with plugin manifest, load and register them (see `PLUGINS.md`)
- **Auto-Discovery**: Scan provider files automatically for built-in providers
- **Explicit Registration**: Manual registration API for applications to register plugins programmatically

**Note**: Lazy loading of provider implementations doesn't make sense because:
- We need to list all providers (via descriptors) so users can choose which to install
- Provider instances are only created when actually needed (when provider is installed and used)
- Descriptors are lightweight (just metadata), so loading them all is not a performance concern

### ProviderId Type - Runtime Extensibility

The `ProviderId` type is a simple string alias, enabling runtime discovery of external providers without compile-time constraints:

```typescript
export type ProviderId = string;
```

**Design Decision**: `ProviderId` is a plain string type alias. This allows:
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

### Plugin Registration Pattern

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

### Runtime Plugin Support Verification

Once registered via `factory.register()`, runtime providers:
- Appear in `getAvailableProviders()` alongside built-ins
- Return metadata via `getProviderInfo(providerId)` - same interface
- Return icons via `getProviderIcon(providerId)` - same file:// URL format
- Can be installed, configured, and used via all Agent API methods
- Are completely indistinguishable from built-ins to client applications

### Icon Support for External Providers

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

**Plugin-Specific Requirements**:
- Plugin must export a **default class** extending `ProviderDescriptor`
- Plugin constructor must take `packageRoot: string` and call `super(packageRoot)`
- Plugin must implement all abstract methods of `ProviderDescriptor`
- Plugin must provide a unique `providerId` string that doesn't conflict with built-ins
- Plugin should define `iconPath` property pointing to icon relative to package root
- Plugin's `info.configValues` should follow the same structure as built-in providers for UI consistency
- Plugin should use Zod schemas with `env://` defaults for configuration (consistent with built-ins)
- Plugin icon should be included in the plugin package (e.g., `assets/icon.png`)

### Benefits of Plugin System

- Enables third-party provider implementations without core code changes
- Allows community-contributed providers
- Supports provider updates via npm updates
- Maintains type safety within each plugin (plugin code is typed, factory interface is `Record<string, string>`)
- Leverages existing NPM infrastructure for distribution and versioning

## Design Decisions

1. **Provider Config Schema Location**: In each provider file - keeps provider details encapsulated
2. **Environment Variable Defaults**: Use `env://VAR_NAME` syntax in schema defaults, resolved at runtime by `SecretManager`
3. **Provider Registry**: Use a `Map<ProviderId, ProviderDescriptor>` in `ProviderFactory`
4. **Provider ID Type**: `ProviderId` is a simple string type alias (`export type ProviderId = string`) - enables runtime extensibility
5. **Runtime Validation**: Provider IDs are validated at runtime when looked up in the factory map, not at compile time
6. **Base Class Pattern**: Use generic `BaseProvider<ConfigType>` for runtime behavior (convenience class)
7. **Descriptor Pattern**: Use `ProviderDescriptor` for factory abstraction (metadata, validation, creation)
8. **Public Interface**: Factory and external code see `Record<string, string>` - provider details stay internal
9. **Validation Hook**: `validateProvider()` hook allows providers to add semantic/live validation beyond schema validation
10. **Self-Contained Providers**: Providers handle their own validation and construction - factory just delegates
11. **Icon Support**: Icons stored in package assets, resolved via `getIcon()` method using package root
12. **Default Export Pattern**: Descriptor classes exported as default for consistent plugin discovery
13. **Package Root Injection**: Factory determines and passes package root to descriptor constructor
14. **Runtime Package Root**: Package root is set by runtime entrypoint (`@tsagent/core/runtime`) via `globalThis.__TSAGENT_CORE_ROOT`

## Open Issues

### ConfigValues Manual Maintenance

**Status**: Current Implementation

`ProviderInfo.configValues` is manually defined in each provider descriptor. Each provider defines a `configValues` array with:
- `caption` - Display name
- `key` - Config key name
- `hint` - Help text
- `secret` - Whether field is secret
- `credential` - Whether field is credential
- `required` - Whether field is required
- `default` - Default value

This information could potentially be derived from the Zod schema, but manual definition is currently used for simplicity. This keeps the duplication minimal and avoids the complexity of schema-driven extraction. Can be revisited if it becomes a maintenance burden.

## Related Documentation

- `PLUGINS.md` - General NPM-based plugin system architecture
- `WORK_ITEMS.md` - Open work items including model settings management
