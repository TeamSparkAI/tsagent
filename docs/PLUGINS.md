# Modular Application Design: NPM-Based Plugin System

This document outlines the architecture for implementing a dynamic, third-party plugin system across three different Node.js environments: standard service, Electron desktop application, and global CLI tool. The system relies entirely on leveraging the NPM package structure and Node's module resolution system for discovery and loading.

## I. Core Architecture: Standard Node.js Application

The standard architecture provides the foundation for discovery and loading, assuming the host application has a conventional project root with an editable package.json and a standard node_modules folder.

### A. Plugin Development & Publishing (The Plugin's Role)

**Metadata Definition:** The plugin package MUST include a custom, namespaced field in its package.json file (e.g., `myApp`) that acts as a manifest. This is the mechanism by which the host application identifies a package as a plugin.

**Example Metadata:**

```json
// Plugin's package.json
{
  "name": "@third-party/plugin-provider-a",
  "version": "1.2.0",
  "main": "dist/index.js",
  "dependencies": { /* ... */ },
  "myApp": {
    "pluginType": "provider", // e.g., 'data-source', 'ui-theme', 'export-format'
    "displayName": "My App Data Provider A"
  }
}
```

**Self-Registration Logic:** The plugin's main entry point (`main` field) MUST contain logic that executes immediately upon being loaded (`require()`ed). This logic should find and register the plugin instance (e.g., a class constructor) with a global Factory or Registry exposed by the Host Application.

### B. Plugin Installation (User Action)

1. **Configuration:** The end-user adds the plugin package name and version to the dependencies list of the Host Application's package.json.
2. **Construction:** The user runs `npm install`. NPM handles resolving all paths and placing the plugin code into the standard node_modules folder.

### C. Runtime Discovery (Host Application Logic)

The host application performs a scan of its own dependencies to identify and validate potential plugins based on the custom metadata.

| Step | Action | Node.js Tool | Description |
|------|--------|--------------|-------------|
| 1. Scan Dependencies | Read the Host Application's own package.json | `fs` | Get the list of all installed package names from the dependencies object. |
| 2. Resolve Plugin Path | For each dependency name, find its installed location | `require.resolve(path.join(depName, 'package.json'))` | This reliably finds the physical package.json file inside the host's node_modules. |
| 3. Validate & Extract Manifest | Read the content of the dependency's package.json | `fs` | Check for the existence and validity of the custom "myApp" field. |
| 4. Load | If validated, dynamically load the module | `require(depName)` | This executes the plugin's self-registration code. |

## II. Special Case: Electron Desktop Application

The Electron environment, particularly when bundled into an ASAR archive, is read-only. This prevents standard runtime configuration changes. Therefore, all plugins must be installed into an external, user-writable directory.

### A. Plugin Host Initialization

**Dedicated Plugin Root:** The Electron Main Process must define and initialize a user-writable directory outside the bundle.

- **Location:** `path.join(electron.app.getPath('userData'), 'plugins')`
- **Initialization:** On startup, the app creates this directory and places a skeleton package.json file inside it, prompting the user to edit this file.

### B. The Crucial Step: Dynamic Path Injection

For the bundled Node.js environment to find the external plugins, the external node_modules folder must be added to Node's search path.

**Action:** The Electron main process injects the path to the external node_modules folder into Node's global search array.

**Code:**

```javascript
const EXTERNAL_NODE_MODULES = path.join(PLUGIN_ROOT, 'node_modules');
// CRITICAL: Extends Node's search path
(module as any).paths.push(EXTERNAL_NODE_MODULES);
```

### C. User Workflow for Electron

The user interacts with the external file system and NPM directly:

1. **Locate:** The user finds the external package.json in the user data directory.
2. **Edit:** They add the desired plugin package to the dependencies list.
3. **Install:** They navigate to that directory and run `npm install`.

### D. Runtime Discovery

After path injection, the discovery logic (I.C) is executed. It reads the external user-editable package.json and uses the now-extended `require.resolve()` function to successfully locate and load plugin modules from the external node_modules folder.

## III. Special Case: Global CLI Tool

The challenge for a global CLI is that its location is hidden behind a system symlink, making it difficult for the user to find the host package.json.

### A. The Self-Discovery Mechanism (Internal)

The CLI uses its own package name and Node's module resolution to reliably locate its installation root.

**Internal Code:** The application embeds a function that finds its configuration root based on the CLI's known package name:

```javascript
const packageJsonPath = require.resolve(path.join(CLI_PACKAGE_NAME, 'package.json'));
// The path returned will point to the actual global install directory.
```

### B. User Experience Command

To abstract the complex global path, the CLI exposes a dedicated command that is simpler than asking the user to run `npm root -g`.

**Command:** `my-cli-app config-path`

**Purpose:** Dumps the absolute path to the configuration file and the necessary installation steps, making the process platform-agnostic for the user.

**Output:**

```
Your plugin host configuration directory:
  /usr/local/lib/node_modules/my-cli-app

To install a plugin:
1. cd /usr/local/lib/node_modules/my-cli-app
2. Edit package.json and add the plugin to "dependencies".
3. Run npm install
```

### C. Runtime Loading

The standard discovery and loading logic (Section I.C/I.D) is executed. Because the dependencies are installed inside the globally installed package's node_modules, standard `require.resolve` and `require` calls work without modification.

## IV. Summary of Differences

| Feature | Standard Node App | Global CLI Tool | Electron Desktop App |
|---------|-------------------|-----------------|---------------------|
| Plugin Host package.json | Pre-exists in project root. | Pre-exists in global install path. | Created at runtime in external user data directory. |
| Plugin Installation | `npm install` in project root. | `npm install` in CLI's global install path. | `npm install` in external user data path. |
| Module Path Discovery | Standard `require.resolve()`. | Standard `require.resolve()` relative to CLI root. | Requires explicit `module.paths` injection of the external node_modules folder. |
| User Instruction | Modify local project package.json. | Run `cli config-path` to find configuration root. | Modify external configuration package.json. |

## V. Considerations & Best Practices

### A. User Experience Improvements

The core mechanism requires users to manually edit package.json files and run npm commands. While this is straightforward for developers, consider adding convenience wrappers for better UX:

**CLI Wrapper Commands:**
- Implement commands like `my-app plugin install <package-name>` that:
  - Automatically edit the appropriate package.json
  - Run `npm install` in the correct location
  - Validate plugin installation
  - Provide clear error messages if installation fails

**GUI Integration (Electron):**
- Add a "Browse Plugins" or "Plugin Manager" UI in desktop applications
- Allow users to search/install plugins without directly editing files
- Show plugin status (installed, update available, etc.)
- Handle npm installation errors gracefully with user-friendly messages

**Discovery Helpers:**
- Provide commands to list installed plugins: `my-app plugin list`
- Add validation commands: `my-app plugin validate`
- Include plugin update commands: `my-app plugin update <package-name>`

### B. Security Considerations

**Plugin Validation:**
- Validate plugin package.json metadata before loading
- Check for required manifest fields and version compatibility
- Consider requiring plugins to be signed or from trusted sources for sensitive applications
- Validate that plugins declare the correct `pluginType` (if your system has multiple types)

**Safe Loading:**
- Wrap plugin `require()` calls in try-catch blocks
- Validate that loaded modules export expected registration functions
- Log plugin loading failures without crashing the host application
- Consider sandboxing plugins if they execute untrusted code

**Error Handling:**
- Handle cases where plugins have malformed manifests
- Gracefully handle plugins that fail to load or register
- Provide clear error messages distinguishing between:
  - Installation errors (npm failures)
  - Discovery errors (missing metadata)
  - Loading errors (require failures)
  - Registration errors (plugin doesn't export expected interface)

### C. Performance Considerations

**Discovery Performance:**
- Discovery requires scanning all dependencies, which can be slow with large dependency trees
- Consider caching plugin discovery results
- Only re-scan when package.json changes (watch for file modifications)
- For Electron, cache discovery results between app restarts

**Optimization Strategies:**
- Filter dependency scanning to only check packages that match a naming convention (e.g., `@namespace/*` or `*-plugin`)
- Use async discovery where possible to avoid blocking application startup
- Lazy-load plugin modules only when needed (though descriptors should be loaded early for listing capabilities)

### D. Plugin Development Guidelines

**Manifest Requirements:**
- Clearly document the required manifest structure (package.json field name, required properties)
- Provide TypeScript types or JSON schemas for plugin manifests
- Include examples of valid plugin package.json files in documentation

**Registration Interface:**
- Document the expected registration API that plugins must use
- Provide helper functions or base classes for plugin authors
- Include validation utilities that plugins can use during development

**Versioning:**
- Establish versioning strategy for plugin API compatibility
- Consider requiring minimum host application version in plugin manifest
- Document breaking changes in plugin API versions

### E. Implementation Recommendations

**Hybrid Approach:**
- Keep built-in plugins explicitly registered for fast startup and clarity
- Use plugin discovery for external/third-party plugins
- This provides the best of both worlds: fast startup for core functionality, flexibility for extensions

**Validation Layers:**
1. **Manifest Validation**: Check package.json structure before attempting to load
2. **Module Validation**: Verify loaded module exports expected registration function
3. **Registration Validation**: Validate that plugin registration succeeds (e.g., plugin provides required interface)

**Graceful Degradation:**
- Application should continue to function if plugin discovery fails
- Log warnings for plugin loading issues but don't block application startup
- Provide fallback behavior when plugins are unavailable

