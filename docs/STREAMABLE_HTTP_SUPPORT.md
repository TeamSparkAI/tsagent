# Adding Streamable HTTP Transport Support

## Overview

The MCP SDK (v1.23.0) includes support for Streamable HTTP transport via `StreamableHTTPClientTransport`. This transport type uses the same configuration as SSE (url, headers) but provides better scalability and fault tolerance. It's the recommended alternative to SSE.

## Current State

Currently supported transport types:
- `stdio` - Process stdio transport
- `sse` - Server-Sent Events (streaming HTTP)
- `internal` - Internal tools

## Required Changes

### 1. Type Definitions (`packages/agent-api/src/mcp/types.ts`)

Add `'streamable-http'` as a new union member:

```typescript
export type McpConfigFileServerConfig = 
  | { 
      type: 'stdio'; 
      command: string; 
      args: string[]; 
      env?: Record<string, string>; 
      cwd?: string;
      serverToolDefaults?: ServerToolDefaults;
      tools?: Record<string, ToolConfig>;
    }
  | { 
      type: 'sse'; 
      url: string; 
      headers?: Record<string, string>;
      serverToolDefaults?: ServerToolDefaults;
      tools?: Record<string, ToolConfig>;
    }
  | { 
      type: 'streamable-http';  // NEW
      url: string; 
      headers?: Record<string, string>;
      serverToolDefaults?: ServerToolDefaults;
      tools?: Record<string, ToolConfig>;
    }
  | { 
      type: 'internal'; 
      tool: 'rules' | 'references' | 'supervision' | 'tools';
      serverToolDefaults?: ServerToolDefaults;
      tools?: Record<string, ToolConfig>;
    };
```

**Note**: `streamable-http` uses the same config structure as `sse` (url + headers), just a different transport implementation.

### 2. Client Implementation (`packages/agent-api/src/mcp/client.ts`)

Add import:
```typescript
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
```

Create new client class (similar to `McpClientSse`):

```typescript
export class McpClientStreamableHttp extends McpClientBase implements McpClient {
    private url: URL;
    private headers: Record<string, string> = {};

    constructor(url: URL, headers?: Record<string, string>, logger?: Logger) {
        super(logger!);
        this.url = url;
        this.headers = headers || {};
    }

    protected async createTransport(): Promise<Transport> {
        this.logger.info(`[MCP CLIENT] createTransport - url: ${this.url.toString()}`);
        
        // StreamableHTTPClientTransport accepts requestInit for headers
        const requestInit: RequestInit = {};
        if (Object.keys(this.headers).length > 0) {
            requestInit.headers = { ...this.headers };
        }
        
        return new StreamableHTTPClientTransport(this.url, {
            requestInit: requestInit
        });
    }
}
```

### 3. Client Manager (`packages/agent-api/src/mcp/client-manager.ts`)

Update `createMcpClientFromConfig` to handle the new type:

```typescript
} else if (serverType === 'sse') {
    client = new McpClientSse(
        new URL(config.url), 
        config.headers,
        this.logger
    );
} else if (serverType === 'streamable-http') {  // NEW
    client = new McpClientStreamableHttp(
        new URL(config.url), 
        config.headers,
        this.logger
    );
} else if (serverType === 'internal') {
    // ...
}
```

### 4. Server Manager (`packages/agent-api/src/managers/mcp-server-manager.ts`)

Update `haveConnectionSettingsChanged` to handle `streamable-http` (same logic as `sse`):

```typescript
// Check sse-specific connection settings
if (oldConfig.type === 'sse' && newConfig.type === 'sse') {
    if (oldConfig.url !== newConfig.url) return true;
    if (JSON.stringify(oldConfig.headers || {}) !== JSON.stringify(newConfig.headers || {})) return true;
}

// Check streamable-http-specific connection settings
if (oldConfig.type === 'streamable-http' && newConfig.type === 'streamable-http') {
    if (oldConfig.url !== newConfig.url) return true;
    if (JSON.stringify(oldConfig.headers || {}) !== JSON.stringify(newConfig.headers || {})) return true;
}
```

### 5. Type Helper (`packages/agent-api/src/mcp/types.ts`)

Update `determineServerType` function:

```typescript
export function determineServerType(config: Omit<McpConfigFileServerConfig, 'type'>): McpConfigFileServerConfig['type'] {
    if ('command' in config) return 'stdio';
    if ('tool' in config) return 'internal';
    // Can't distinguish between 'sse' and 'streamable-http' from structure alone
    // Both have 'url'. Default to 'sse' for backward compatibility.
    if ('url' in config) return 'sse';
    throw new Error('Invalid server configuration');
}
```

**Note**: This function can't distinguish between `sse` and `streamable-http` since both use `url`. The type must be explicitly set.

### 6. UI Updates (`apps/desktop/src/renderer/components/Tools.tsx`)

#### 6a. Update server type state:

```typescript
const [serverType, setServerType] = useState<'stdio' | 'sse' | 'streamable-http' | 'internal'>(effectiveType);
```

#### 6b. Update server type dropdown:

```typescript
<select 
    value={serverType}
    onChange={(e) => setServerType(e.target.value as 'stdio' | 'sse' | 'streamable-http' | 'internal')}
    style={{ width: 'auto', padding: '4px 8px' }}
>
    <option value="stdio">Stdio</option>
    <option value="sse">SSE</option>
    <option value="streamable-http">Streamable HTTP</option>
    <option value="internal">Internal</option>
</select>
```

#### 6c. Update form rendering logic:

The SSE and Streamable HTTP forms should be identical (both use URL + headers). Update the conditional:

```typescript
{serverType === 'sse' && (
    // SSE form fields
)}

{serverType === 'streamable-http' && (
    // Same form fields as SSE (URL + headers)
)}
```

Or consolidate:

```typescript
{(serverType === 'sse' || serverType === 'streamable-http') && (
    // Shared URL + headers form
)}
```

#### 6d. Update config serialization:

```typescript
const mcpConfig: McpConfig = {
    name: serverName,
    config: serverType === 'stdio'
        ? {
            type: 'stdio',
            command: command,
            args: argsArray,
            env: envObj,
            cwd: cwd || undefined,
            serverToolDefaults: /* ... */,
            tools: /* ... */
        }
        : serverType === 'sse'
        ? {
            type: 'sse',
            url: url,
            headers: Object.keys(headers).length > 0 ? headers : undefined,
            serverToolDefaults: /* ... */,
            tools: /* ... */
        }
        : serverType === 'streamable-http'
        ? {
            type: 'streamable-http',
            url: url,
            headers: Object.keys(headers).length > 0 ? headers : undefined,
            serverToolDefaults: /* ... */,
            tools: /* ... */
        }
        : {
            type: 'internal',
            tool: internalTool,
            serverToolDefaults: /* ... */,
            tools: /* ... */
        }
};
```

### 7. Validation (`apps/desktop/src/main/main.ts`)

Update the default type logic if needed (should already handle any valid type from the union).

## Implementation Notes

### Key Differences from SSE

1. **Transport Class**: Uses `StreamableHTTPClientTransport` instead of `SSEClientTransport`
2. **Configuration**: Identical to SSE (url + headers)
3. **Benefits**: Better scalability, fault tolerance, support for long-running tool calls

### Backward Compatibility

- Existing `sse` configs continue to work
- `streamable-http` is a new option users can select
- No migration needed - users can switch if they want

### Testing Considerations

1. Test with a streamable-http MCP server
2. Verify connection settings change detection works
3. Verify headers are passed correctly
4. Test with both authenticated and unauthenticated servers

## Summary

Adding streamable-http support requires:
1. ✅ Type definition update (add union member)
2. ✅ New client class implementation
3. ✅ Client manager update (wire up new client)
4. ✅ Server manager update (connection change detection)
5. ✅ UI updates (add option to dropdown, handle form rendering)
6. ✅ Config serialization (handle new type in save logic)

The implementation should be straightforward since it mirrors SSE but uses a different transport class from the SDK.

