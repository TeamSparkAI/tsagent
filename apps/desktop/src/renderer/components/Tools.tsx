import React, { useState, useEffect } from 'react';
import type { 
    McpConfig, 
    ServerDefaultPermission, 
    ToolPermissionSetting,
    Tool,
    ServerToolIncludeConfig,
    ServerToolPermissionRequiredConfig
} from "@tsagent/core";
import { 
    SERVER_PERMISSION_REQUIRED,
    SERVER_PERMISSION_NOT_REQUIRED,
    TOOL_PERMISSION_SERVER_DEFAULT,
    TOOL_PERMISSION_REQUIRED,
    TOOL_PERMISSION_NOT_REQUIRED,
    isToolPermissionServerDefaultRequired,
    getToolPermissionState,
    getToolIncludeServerDefault,
    getToolIncludeMode,
    getToolEffectiveIncludeMode,
    isToolInContext,
    isToolAvailableForManual,
    isToolAvailableForAgent
} from "@tsagent/core";
import { TabProps } from '../types/TabProps';
import { TabState, TabMode } from '../types/TabState';
import { AboutView } from './AboutView';
import log from 'electron-log';

interface ServerInfo {
    serverVersion: { name: string; version: string } | null;
    serverTools: any[];
    errorLog: string[];
    isConnected: boolean;
}

interface ErrorAnalysis {
    type: 'ENOENT' | 'EACCES' | 'ECONNREFUSED' | 'OTHER';
    message: string;
    recommendations: string[];
}

interface ToolTestResult {
    elapsedTime: number;
    args: Record<string, unknown>;
    result: unknown;
}

interface EditServerModalProps {
    server?: McpConfig;
    onSave: (server: McpConfig) => void;
    onCancel: () => void;
}

const EditServerModal: React.FC<EditServerModalProps> = ({ server, onSave, onCancel }) => {
    // Add debugging logs
    console.log("EditServerModal received server:", server);
    
    const [name, setName] = useState(server?.name || '');
    const [error, setError] = useState<string | null>(null);
    
    // Check if the server type is specified, default to 'stdio' if not
    const effectiveType = server?.config?.type || 'stdio';
    const [serverType, setServerType] = useState<'stdio' | 'sse' | 'internal'>(effectiveType);
    
    // For stdio settings, only initialize them if effectiveType is 'stdio'
    const [command, setCommand] = useState<string>(() => {
        if (effectiveType === 'stdio' && server?.config) {
            return (server.config as any).command || '';
        }
        return '';
    });
    
    // Use an array to store arguments instead of a space-separated string
    const [argsArray, setArgsArray] = useState<string[]>(() => {
        if (effectiveType === 'stdio' && server?.config) {
            const argsArray = (server.config as any).args;
            return Array.isArray(argsArray) ? [...argsArray] : [];
        }
        return [];
    });

    const [serverArgs, setServerArgs] = useState<string[]>(() => {
        return [];
    });
    
    const [env, setEnv] = useState<string>(() => {
        if ((effectiveType === 'stdio') && server?.config) {
            return JSON.stringify((server.config as any).env || {});
        }
        return '{}';
    });
    
    const [cwd, setCwd] = useState<string>(() => {
        if ((effectiveType === 'stdio') && server?.config) {
            return (server.config as any).cwd || '';
        }
        return '';
    });
    
    // For SSE settings, only initialize them if effectiveType is 'sse'
    const [url, setUrl] = useState<string>(() => {
        if (effectiveType === 'sse' && server?.config) {
            return (server.config as any).url || '';
        }
        return '';
    });
    
    const [headers, setHeaders] = useState<Record<string, string>>(() => {
        if (effectiveType === 'sse' && server?.config) {
            return (server.config as any).headers || {};
        }
        return {};
    });
    
    // For internal tool settings, only initialize them if effectiveType is 'internal'
    const [internalTool, setInternalTool] = useState<'rules' | 'references' | 'supervision' | 'tools'>(() => {
        if (effectiveType === 'internal' && server?.config) {
            return (server.config as any).tool || 'rules';
        }
        return 'rules';
    });

    // Add JSON editing mode toggle
    const [isJsonMode, setIsJsonMode] = useState(false);
    
    // Add state for the JSON text
    const [jsonText, setJsonText] = useState<string>(() => {
        if (server) {
            // Format as { "serverName": { config properties } }
            const configWithoutType = { ...server.config };
            return JSON.stringify({
                [server.name]: configWithoutType
            }, null, 2);
        }
        return JSON.stringify({
            "serverName": {
                "type": "stdio",
                "command": "",
                "args": [],
                "env": {},
                "cwd": ""
            }
        }, null, 2);
    });
    
    // Add state for JSON validation errors
    const [jsonError, setJsonError] = useState<string | null>(null);

    // Add permission state
    const [defaultPermission, setDefaultPermission] = useState<ServerDefaultPermission>(
        server?.config ? isToolPermissionServerDefaultRequired(server.config) ? SERVER_PERMISSION_REQUIRED : SERVER_PERMISSION_NOT_REQUIRED : SERVER_PERMISSION_REQUIRED
    );

    // Server default include mode
    const [serverDefaultIncludeMode, setServerDefaultIncludeMode] = useState<'always' | 'manual' | 'agent'>(
        server?.config.toolInclude?.serverDefault || 'always'
    );

    // Log initial state values
    useEffect(() => {
        console.log("EditServerModal initial state:", {
            name, serverType, effectiveType, command, argsArray, env, url, headers, internalTool
        });
    }, []);

    // Update form fields when JSON changes
    const updateFormFromJson = () => {
        try {
            const parsedJson = JSON.parse(jsonText);
            setJsonError(null);
            
            // Check if we have the mcpServers wrapper format
            if (parsedJson.mcpServers && typeof parsedJson.mcpServers === 'object') {
                // Extract the first server from mcpServers
                const serverNames = Object.keys(parsedJson.mcpServers);
                if (serverNames.length > 0) {
                    const serverName = serverNames[0];
                    const configObj = parsedJson.mcpServers[serverName];
                    
                    if (!serverName) {
                        setJsonError('Server name is required');
                        return false;
                    }
                    
                    // Update name
                    setName(serverName);
                    
                    // For mcpServers format, we need to add type if missing
                    const configType = configObj.type || 'stdio';
                    setServerType(configType as 'stdio' | 'sse' | 'internal');
                    
                    if (configType === 'stdio' || !configType) {
                        setCommand(configObj.command || '');
                        setArgsArray(Array.isArray(configObj.args) ? configObj.args : []);
                        setEnv(JSON.stringify(configObj.env || {}));
                        setCwd(configObj.cwd || '');
                    } else if (configType === 'sse') {
                        setUrl(configObj.url || '');
                        setHeaders(configObj.headers || {});
                    } else if (configType === 'internal') {
                        setInternalTool(configObj.tool || 'rules');
                    }
                    
                    // Update JSON text to standard format without mcpServers wrapper
                    const standardFormat = {
                        [serverName]: {
                            ...configObj,
                            type: configType  // Ensure type is set (and overrides any existing type)
                        }
                    };
                    setJsonText(JSON.stringify(standardFormat, null, 2));
                    
                    return true;
                }
            } else {
                // Handle regular format (without mcpServers wrapper)
                const serverObj = parsedJson;
                
                // Extract server name (the first key) and config (the value)
                const serverName = Object.keys(serverObj)[0];
                const configObj = serverObj[serverName];
                
                if (!serverName) {
                    setJsonError('Server name is required');
                    return false;
                }
                
                // Update name
                setName(serverName);
                
                // Update config based on type
                if (configObj) {
                    const configType = configObj.type || 'stdio';
                    setServerType(configType as 'stdio' | 'sse' | 'internal');
                    
                    if (configType === 'stdio') {
                        setCommand(configObj.command || '');
                        setArgsArray(Array.isArray(configObj.args) ? configObj.args : []);
                        setEnv(JSON.stringify(configObj.env || {}));
                        setCwd(configObj.cwd || '');
                    } else if (configType === 'sse') {
                        setUrl(configObj.url || '');
                        setHeaders(configObj.headers || {});
                    } else if (configType === 'internal') {
                        setInternalTool(configObj.tool || 'rules');
                    }
                }
            }
            
            return true;
        } catch (e) {
            setJsonError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    };

    // Update JSON when form fields change
    useEffect(() => {
        if (!isJsonMode) {
            // Build server config object based on form fields
            let configObj: any = {};
            
            if (serverType === 'stdio') {
                configObj = {
                    type: 'stdio',
                    command,
                    args: argsArray.filter(arg => arg.trim() !== ''),
                };
                
                if (env && env !== '{}') {
                    try {
                        configObj.env = JSON.parse(env);
                    } catch (e) {
                        // If env JSON is invalid, don't update it
                    }
                }
                
                if (cwd && cwd.trim() !== '') {
                    configObj.cwd = cwd.trim();
                }
            } else if (serverType === 'sse') {
                configObj = {
                    type: 'sse',
                    url,
                    headers
                };
            } else {
                configObj = {
                    type: 'internal',
                    tool: internalTool
                };
            }
            
            // Format as { "serverName": { config properties } }
            const serverObj = {
                [name]: configObj
            };
            
            setJsonText(JSON.stringify(serverObj, null, 2));
        }
    }, [isJsonMode, name, serverType, command, argsArray, env, url, headers, internalTool, serverArgs]);

    const handleSave = async () => {
        setError(null);
        setJsonError(null);
        
        if (isJsonMode) {
            try {
                const parsedJson = JSON.parse(jsonText);
                
                // Check if we have the mcpServers wrapper format
                if (parsedJson.mcpServers && typeof parsedJson.mcpServers === 'object') {
                    // Extract the first server from mcpServers
                    const serverNames = Object.keys(parsedJson.mcpServers);
                    if (serverNames.length > 0) {
                        const serverName = serverNames[0];
                        const configObj = parsedJson.mcpServers[serverName];
                        
                        // Basic validation
                        if (!serverName) {
                            setJsonError('Server name is required');
                            return;
                        }

                        // Check for name conflicts
                        const existingServers = await window.api.getServerConfigs();
                        const nameConflict = existingServers.some(s => 
                            s.name === serverName && 
                            s.name !== server?.name
                        );
                        
                        if (nameConflict) {
                            setJsonError(`A server with the name "${serverName}" already exists`);
                            return;
                        }
                        
                        if (!configObj) {
                            setJsonError('Server config is required');
                            return;
                        }
                        
                        // Ensure type defaults to 'stdio' if not provided
                        if (!configObj.type) {
                            configObj.type = 'stdio';
                        }
                        
                        // Add toolPermissionRequired to the config (preserve existing tool settings)
                        if (configObj) {
                            configObj.toolPermissionRequired = {
                                serverDefault: defaultPermission === SERVER_PERMISSION_REQUIRED,
                                tools: server?.config.toolPermissionRequired?.tools
                            };
                        }
                        
                        // Convert to internal format
                        const mcpConfig: McpConfig = {
                            name: serverName,
                            config: configObj
                        };
                        
                        onSave(mcpConfig);
                        return;
                    }
                }
                
                // Handle regular format (without mcpServers wrapper)
                const serverObj = parsedJson;
                
                // Extract server name and config
                const serverName = Object.keys(serverObj)[0];
                const configObj = serverObj[serverName];
                
                // Basic validation
                if (!serverName) {
                    setJsonError('Server name is required');
                    return;
                }

                // Check for name conflicts
                const existingServers = await window.api.getServerConfigs();
                const nameConflict = existingServers.some(s => 
                    s.name === serverName && 
                    s.name !== server?.name
                );
                
                if (nameConflict) {
                    setJsonError(`A server with the name "${serverName}" already exists`);
                    return;
                }
                
                if (!configObj) {
                    setJsonError('Server config is required');
                    return;
                }
                
                // Ensure type defaults to 'stdio' if not provided
                if (!configObj.type) {
                    configObj.type = 'stdio';
                }
                
                // Add toolPermissionRequired to the config (preserve existing tool settings)
                if (configObj) {
                    configObj.toolPermissionRequired = {
                        serverDefault: defaultPermission === SERVER_PERMISSION_REQUIRED,
                        tools: server?.config.toolPermissionRequired?.tools
                    };
                }
                
                // Convert to internal format
                const mcpConfig: McpConfig = {
                    name: serverName,
                    config: configObj
                };
                
                onSave(mcpConfig);
            } catch (e) {
                setJsonError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
            }
        } else {
            try {
                if (!name.trim()) {
                    setError('Name is required');
                    return;
                }

                // Check for name conflicts
                const existingServers = await window.api.getServerConfigs();
                const nameConflict = existingServers.some(s => 
                    s.name === name && 
                    (!server || s.name !== server.name)
                );
                
                if (nameConflict) {
                    setError(`A server with the name "${name}" already exists`);
                    return;
                }

                // Parse the environment JSON
                let envObject = JSON.parse(env);
                
                // Build toolPermissionRequired from current UI state (preserve existing tool settings)
                const toolPermissionRequired = {
                    serverDefault: defaultPermission === SERVER_PERMISSION_REQUIRED,
                    tools: server?.config.toolPermissionRequired?.tools
                };

                // Create the toolInclude settings (preserve existing tool settings)
                const toolInclude = {
                    serverDefault: serverDefaultIncludeMode,
                    tools: server?.config.toolInclude?.tools
                };

                const serverConfig: McpConfig = {
                    name,
                    config: serverType === 'stdio'
                        ? {
                            type: 'stdio',
                            command,
                            args: argsArray.filter(arg => arg.trim() !== ''),
                            env: Object.keys(JSON.parse(env)).length > 0 ? JSON.parse(env) : undefined,
                            cwd: cwd && cwd.trim() !== '' ? cwd.trim() : undefined,
                            toolPermissionRequired,
                            toolInclude
                        }
                        : serverType === 'sse'
                        ? {
                            type: 'sse',
                            url,
                            headers: Object.keys(headers).length > 0 ? headers : undefined,
                            toolPermissionRequired,
                            toolInclude
                        }
                        : {
                            type: 'internal',
                            tool: internalTool,
                            toolPermissionRequired,
                            toolInclude
                        }
                };
                onSave(serverConfig);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to save server');
            }
        }
    };

    const toggleMode = () => {
        if (isJsonMode) {
            // When switching from JSON to form, validate and update form fields
            if (updateFormFromJson()) {
                setIsJsonMode(false);
            }
        } else {
            // When switching to JSON, we've already updated the JSON in the useEffect
            setIsJsonMode(true);
        }
    };

    return (
        <div style={{ padding: '20px', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2 style={{ margin: 0 }}>{server ? 'Edit Server' : 'New Server'}</h2>
                <button className="btn configure-button" onClick={toggleMode}>
                    {isJsonMode ? 'Switch to Form Mode' : 'Switch to JSON Mode'}
                </button>
            </div>
            
            {error && (
                <div style={{ 
                    color: '#dc3545',
                    backgroundColor: '#f8d7da',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <span style={{ fontSize: '1.2em' }}>⚠️</span>
                    <span>{error}</span>
                </div>
            )}
            
            {isJsonMode ? (
                <div style={{ marginBottom: '20px' }}>
                    {jsonError && (
                        <div style={{ color: 'red', marginBottom: '10px' }}>
                            {jsonError}
                        </div>
                    )}
                    <textarea 
                        value={jsonText}
                        onChange={(e) => {
                            setJsonText(e.target.value);
                            setJsonError(null);
                        }}
                        style={{ 
                            width: '100%', 
                            height: '250px', 
                            fontFamily: 'monospace',
                            padding: '8px',
                            border: jsonError ? '1px solid red' : '1px solid #ccc'
                        }}
                    />
                </div>
            ) : (
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '120px 1fr',
                    gap: '12px',
                    alignItems: 'center',
                    marginBottom: '20px',
                    marginRight: '20px'
                }}>
                    <label style={{ fontWeight: 'bold' }}>Name:</label>
                    <div>
                        <input 
                            type="text" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            style={{ width: '100%', padding: '4px 8px' }}
                        />
                    </div>

                    <label style={{ fontWeight: 'bold' }}>Type:</label>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <select 
                            value={serverType}
                            onChange={(e) => setServerType(e.target.value as 'stdio' | 'sse' | 'internal')}
                            style={{ width: 'auto', padding: '4px 8px' }}
                        >
                            <option value="stdio">Stdio</option>
                            <option value="sse">SSE</option>
                            <option value="internal">Internal</option>
                        </select>
                    </div>

                    {serverType === 'stdio' && (
                        <>
                            <label style={{ fontWeight: 'bold' }}>Command:</label>
                            <input 
                                type="text" 
                                value={command}
                                onChange={(e) => setCommand(e.target.value)}
                                style={{ width: '100%', padding: '4px 8px' }}
                            />

                            <label style={{ fontWeight: 'bold', alignSelf: 'start', paddingTop: '8px' }}>Arguments:</label>
                            <div>
                                {argsArray.map((arg, index) => (
                                    <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                                        <input
                                            type="text"
                                            value={arg}
                                            onChange={(e) => {
                                                const newArgs = [...argsArray];
                                                newArgs[index] = e.target.value;
                                                setArgsArray(newArgs);
                                            }}
                                            style={{ flex: 1, padding: '4px 8px' }}
                                        />
                                        <button className="btn remove-button" onClick={() => {
                                            const newArgs = [...argsArray];
                                            newArgs.splice(index, 1);
                                            setArgsArray(newArgs);
                                        }}>
                                            Remove
                                        </button>
                                    </div>
                                ))}
                                <button className="btn add-button" onClick={() => {
                                    setArgsArray([...argsArray, '']); // Add an empty string arg
                                }}>Add Argument</button>
                            </div>

                            <label style={{ fontWeight: 'bold', alignSelf: 'start', paddingTop: '8px' }}>Environment:</label>
                            <div>
                                {Object.entries(JSON.parse(env)).map(([key, value], index) => (
                                    <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                                        <input
                                            type="text"
                                            value={key}
                                            placeholder="Key"
                                            onChange={(e) => {
                                                const newEnv = { ...JSON.parse(env) };
                                                delete newEnv[key];
                                                newEnv[e.target.value] = value;
                                                setEnv(JSON.stringify(newEnv));
                                            }}
                                            style={{ width: '40%', padding: '4px 8px' }}
                                        />
                                        <input
                                            type="text"
                                            value={value as string}
                                            placeholder="Value"
                                            onChange={(e) => {
                                                setEnv(JSON.stringify({ ...JSON.parse(env), [key]: e.target.value }));
                                            }}
                                            style={{ flex: 1, padding: '4px 8px' }}
                                        />
                                        <button className="btn remove-button" onClick={() => {
                                            const newEnv = { ...JSON.parse(env) };
                                            delete newEnv[key];
                                            setEnv(JSON.stringify(newEnv));
                                        }}>
                                            Remove
                                        </button>
                                    </div>
                                ))}
                                <button className="btn add-button" onClick={() => setEnv(JSON.stringify({ ...JSON.parse(env), '': '' }))}>Add Environment Variable</button>
                            </div>

                            <label style={{ fontWeight: 'bold', alignSelf: 'start', paddingTop: '8px' }}>Dir (cwd):</label>
                            <input 
                                type="text" 
                                value={cwd}
                                onChange={(e) => setCwd(e.target.value)}
                                placeholder="Leave empty to use current directory"
                                style={{ width: '100%', padding: '4px 8px' }}
                            />
                        </>
                    )}

                    {serverType === 'sse' && (
                        <>
                            <label style={{ fontWeight: 'bold' }}>URL:</label>
                            <input 
                                type="text" 
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                style={{ width: '100%', padding: '4px 8px' }}
                            />

                            <label style={{ fontWeight: 'bold', alignSelf: 'start', paddingTop: '8px' }}>Headers:</label>
                            <div>
                                {Object.entries(headers).map(([key, value], index) => (
                                    <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                                        <input
                                            type="text"
                                            value={key}
                                            placeholder="Key"
                                            onChange={(e) => {
                                                const newHeaders = { ...headers };
                                                delete newHeaders[key];
                                                newHeaders[e.target.value] = value;
                                                setHeaders(newHeaders);
                                            }}
                                            style={{ width: '40%', padding: '4px 8px' }}
                                        />
                                        <input
                                            type="text"
                                            value={value}
                                            placeholder="Value"
                                            onChange={(e) => {
                                                setHeaders({ ...headers, [key]: e.target.value });
                                            }}
                                            style={{ flex: 1, padding: '4px 8px' }}
                                        />
                                        <button className="btn remove-button" onClick={() => {
                                            const newHeaders = { ...headers };
                                            delete newHeaders[key];
                                            setHeaders(newHeaders);
                                        }}>
                                            Remove
                                        </button>
                                    </div>
                                ))}
                                <button className="btn configure-button" onClick={() => setHeaders({ ...headers, '': '' })}>Add Header</button>
                            </div>
                        </>
                    )}

                    {serverType === 'internal' && (
                        <>
                            <label style={{ fontWeight: 'bold' }}>Tool:</label>
                            <select 
                                value={internalTool}
                                onChange={(e) => setInternalTool(e.target.value as 'rules' | 'references' | 'supervision' | 'tools')}
                                style={{ width: 'auto', padding: '4px 8px' }}
                            >
                                <option value="rules">Rules</option>
                                <option value="references">References</option>
                                <option value="supervision">Supervision</option>
                                <option value="tools">Tools</option>
                            </select>
                        </>
                    )}
                </div>
            )}

            <div className="form-group">
                <h3>Tool Permission Required</h3>

                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '120px 1fr',
                    gap: '12px',
                    alignItems: 'center',
                    marginBottom: '20px',
                    marginRight: '20px'
                }}>

                    <>
                        <label style={{ fontWeight: 'bold', alignSelf: 'start', paddingTop: '8px' }}>Server Default:</label>
                        <div>
                            <select
                                value={defaultPermission}
                                onChange={(e) => setDefaultPermission(e.target.value as ServerDefaultPermission)}
                            >
                                <option value={SERVER_PERMISSION_REQUIRED}>Approval Required</option>
                                <option value={SERVER_PERMISSION_NOT_REQUIRED}>Approval Not Required</option>
                            </select>
                            <p><i>Individual tools may override the default tool permission for this server</i></p>
                        </div>
                    </>

                </div>
            </div>

            <div className="form-group">
                <h3>Tool Enabled</h3>

                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '120px 1fr',
                    gap: '12px',
                    alignItems: 'center',
                    marginBottom: '20px',
                    marginRight: '20px'
                }}>

                    <>
                        <label style={{ fontWeight: 'bold', alignSelf: 'start', paddingTop: '8px' }}>Server Default:</label>
                        <div>
                            <select
                                value={serverDefaultIncludeMode}
                                onChange={(e) => setServerDefaultIncludeMode(e.target.value as 'always' | 'manual' | 'agent')}
                            >
                                <option value="always">Always</option>
                                <option value="manual">Manual</option>
                                <option value="agent">Agent</option>
                            </select>
                            <p><i>Individual tools may override the default include mode for this server</i></p>
                        </div>
                    </>

                </div>
            </div>

            <div style={{ 
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px'
            }}>
                <button className="btn cancel-button" onClick={onCancel}>Cancel</button>
                <button className="btn apply-button" onClick={handleSave}>
                    Save
                </button>
            </div>
        </div>
    );
};

// Handle external links safely
const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const href = e.currentTarget.href;
    if (href) {
        window.api.openExternal(href);
        log.debug(`Opening external link: ${href}`);
    }
};

const analyzeError = (errorLog: string[]): ErrorAnalysis | null => {
    const combinedLog = errorLog.join('\n');
    
    if (combinedLog.includes('ENOENT')) {
        return {
            type: 'ENOENT',
            message: 'File or directory not found',
            recommendations: [
                'Verify that the file or directory exists',
                'Ensure the PATH environment variable includes the correct directories for the command itself and any other tools it may require (this app does not have access to the system PATH)',
                'You may specificy the PATH environment variable in the tool configuration or set the default under Settings > Tools > Default PATH'
            ]
        };
    }
    
    if (combinedLog.includes('EACCES')) {
        return {
            type: 'EACCES',
            message: 'Permission denied',
            recommendations: [
                'Check file permissions',
                'Ensure the user has execute permissions for the command',
                'Try running with elevated permissions if necessary'
            ]
        };
    }
    
    if (combinedLog.includes('ECONNREFUSED')) {
        return {
            type: 'ECONNREFUSED',
            message: 'Connection refused',
            recommendations: [
                'Verify that the server is running on the specified port',
                'Verify that the url is correct, and that it includes the /sse suffix',
                'Ensure no firewall is blocking the connection'
            ]
        };
    }

    return {
        type: 'OTHER',
        message: 'Unknown error',
        recommendations: [
            'Please check the error log below more details',
            'Address any general configuration issues with the tool',
            'If the error persists, it is likely related to the PATH not being set correctly (this app does not have access to the system PATH)',
            'You may specificy the PATH environment variable in the tool configuration or set the default under Settings > Tools > Default PATH'
        ]
    }
};

const ErrorInfoDialog: React.FC<{ 
    errorAnalysis: ErrorAnalysis;
    errorLog: string[];
    onClose: () => void;
}> = ({ errorAnalysis, errorLog, onClose }) => {
    return (
        <div style={{ 
            position: 'fixed', 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            border: '1px solid #d9d9d9',
            zIndex: 1000,
            maxWidth: '600px',
            width: '90%'
        }}>
            <h2 style={{ marginTop: 0, borderBottom: '1px solid #f0f0f0', paddingBottom: '10px' }}>Error Details</h2>
            <div style={{ marginBottom: '20px' }}>
                <h3 style={{ marginBottom: '10px', color: '#1890ff' }}>Error Type: {errorAnalysis.type}</h3>
                <p style={{ color: '#666' }}>{errorAnalysis.message}</p>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
                <h3 style={{ marginBottom: '10px', color: '#1890ff' }}>Recommendations:</h3>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#666' }}>
                    {errorAnalysis.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                    ))}
                </ul>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
                <h3 style={{ marginBottom: '10px', color: '#1890ff' }}>Full Error Log:</h3>
                <pre style={{ 
                    margin: 0,
                    padding: '8px',
                    backgroundColor: '#1e1e1e',
                    color: '#ff4444',
                    borderRadius: '4px',
                    overflow: 'auto',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '200px'
                }}>
                    {errorLog.join('\n')}
                </pre>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f0f0f0', paddingTop: '10px' }}>
                <button 
                    className="btn configure-button"
                    onClick={onClose}
                >
                    Close
                </button>
            </div>
        </div>
    );
};

const ErrorInfoBanner: React.FC<{ 
    errorAnalysis: ErrorAnalysis;
    onClick: () => void;
}> = ({ errorAnalysis, onClick }) => {
    return (
        <div 
            style={{ 
                backgroundColor: '#e6f7ff',
                border: '1px solid #91d5ff',
                borderRadius: '4px',
                padding: '10px',
                marginTop: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}
            onClick={onClick}
        >
            <span style={{ color: '#1890ff' }}>ℹ️</span>
            <span>
                {errorAnalysis.message} - Click for details and recommendations
            </span>
        </div>
    );
};

export const Tools: React.FC<TabProps> = ({ id, activeTabId, name, type }) => {
    const [servers, setServers] = useState<McpConfig[]>([]);
    const [selectedServer, setSelectedServer] = useState<McpConfig | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [editingServer, setEditingServer] = useState<(McpConfig) | undefined>(undefined);
    const [serverInfo, setServerInfo] = useState<Record<string, ServerInfo>>({});
    const [tabState, setTabState] = useState<TabState>({ mode: 'about' });
    const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
    const [testResults, setTestResults] = useState<ToolTestResult | null>(null);
    const [testParams, setTestParams] = useState<Record<string, unknown>>({});
    const [isTesting, setIsTesting] = useState(false);
    const [showErrorDialog, setShowErrorDialog] = useState(false);
    const [currentErrorAnalysis, setCurrentErrorAnalysis] = useState<ErrorAnalysis | null>(null);
    const [currentErrorLog, setCurrentErrorLog] = useState<string[]>([]);
    const [selectedToolPermission, setSelectedToolPermission] = useState<ToolPermissionSetting>(TOOL_PERMISSION_SERVER_DEFAULT);
    const [selectedToolEnabled, setSelectedToolEnabled] = useState<'server_default' | 'always' | 'manual' | 'agent'>('server_default');

    useEffect(() => {
        loadServers();
        // Add event listener for agent changes
        const handleAgentSwitched = async (data: { windowId: string, agentPath: string, targetWindowId: string }) => {   
            const currentWindowId = await window.api.getCurrentWindowId();
            log.info(`[TOOLS TAB] Received agent:switched, current window ID: ${currentWindowId}, target window ID: ${data.targetWindowId}`);
              
            // Only update the UI if this event is targeted at the current window
            if (currentWindowId === data.targetWindowId) {      
                await loadServers();
            }
        };

        // Use the API method instead of DOM event listener
        const listener = window.api.onAgentSwitched(handleAgentSwitched);

        // Clean up the API event listener
        return () => {
            log.info('[TOOLS TAB] Cleaning up agent:switched event listener');
            if (listener) {
                window.api.offAgentSwitched(listener);
                log.info('[TOOLS TAB] Successfully removed agent:switched listener');
            }
        };
    }, []);

    // Clear test results when server or tool selection changes
    useEffect(() => {
        setTestResults(null);
        if (selectedTool) {
            // Initialize testParams with default values from the schema
            const initialParams: Record<string, unknown> = {};
            if (selectedTool.inputSchema?.properties) {
                Object.entries(selectedTool.inputSchema.properties).forEach(([name, param]: [string, any]) => {
                    if (param.default !== undefined) {
                        initialParams[name] = param.default;
                    }
                });
            }
            setTestParams(initialParams);
        } else {
            setTestParams({});
        }
    }, [selectedServer, selectedTool]);

    const loadServers = async () => {
        const loadedServers = await window.api.getServerConfigs();
        console.log("Loaded server configs:", loadedServers);
        
        // Sort servers by name
        const sortedServers = loadedServers.sort((a, b) => a.name.localeCompare(b.name));
        setServers(sortedServers);

        const infoMap: Record<string, ServerInfo> = {};
        for (const config of sortedServers) {
            try {
                const info = await window.api.getMCPClient(config.name) as ServerInfo;
                infoMap[config.name] = info;
            } catch (error) {
                log.error(`Error getting MCP client info for ${config.name}:`, error);
            }
        }
        setServerInfo(infoMap);
    };

    const loadServerInfo = async (serverName: string) => {
        try {
            const info = await window.api.getMCPClient(serverName) as ServerInfo;
            setServerInfo(prev => ({
                ...prev,
                [serverName]: info
            }));
        } catch (err) {
            log.error(`Failed to connect to server ${serverName}:`, err);
            // Just log the error, don't show any dialogs
        }
    };

    // Load server info when a server is selected
    useEffect(() => {
        if (selectedServer) {
            loadServerInfo(selectedServer.name);
        }
    }, [selectedServer]);

    const handleAddServer = () => {
        setEditingServer(undefined);
        setShowEditModal(true);
        setSelectedServer(null);
    };

    const handleEditServer = (server: McpConfig) => {
        console.log("Editing server:", server);
        setEditingServer(server);
        setShowEditModal(true);
    };

    const handleSaveServer = async (server: McpConfig) => {
        try {
            // If this is an edit and the name has changed, delete the old server first
            if (editingServer && editingServer.name !== server.name) {
                await window.api.deleteServerConfig(editingServer.name);
            }
            
            await window.api.saveServerConfig(server);
            setShowEditModal(false);
            await loadServers();
            setSelectedServer(server);
            setTabState({ mode: 'item', selectedItemId: server.name });
            
            await loadServerInfo(server.name);
        } catch (error) {
            log.error('Error saving server:', error);
        }
    };

    const handleDeleteServer = async (server: McpConfig) => {
        if (confirm(`Are you sure you want to delete the server "${server.name}"?`)) {
            await window.api.deleteServerConfig(server.name);
            setSelectedServer(null);
            setTabState({ mode: 'about' });
            loadServers();
        }
    };

    const handleTestTool = async () => {
        if (!selectedTool || !selectedServer) return;
        
        setIsTesting(true);
        const startTime = Date.now();
        
        try {
            log.info('Calling tool:', { server: selectedServer.name, tool: selectedTool.name, args: testParams });
            const result = await window.api.callTool(selectedServer.name, selectedTool.name, testParams);
            log.info('Tool call result:', result);
            
            // Extract the result content - MCP SDK CallToolResult structure
            let resultText: string;

            // Extract the result content
            if (result.content && Array.isArray(result.content) && result.content.length > 0) {
                const resultContent = result.content[0];
                if (resultContent?.type === 'text') {
                    resultText = resultContent.text;
                } else if (resultContent?.type === 'image') {
                    resultText = `[Image: ${resultContent.mimeType}]`;
                } else if (resultContent?.type === 'resource') {
                    resultText = `[Resource: ${resultContent.mimeType}]`;
                } else {
                    resultText = JSON.stringify(resultContent);
                }
            } else {
                // Fallback: just stringify the entire result
                resultText = JSON.stringify(result);
            }
            
            setTestResults({
                elapsedTime: result.elapsedTimeMs,
                args: testParams,
                result: resultText
            });
        } catch (error) {
            log.error('Error testing tool:', error);
            setTestResults({
                elapsedTime: Date.now() - startTime,
                args: testParams,
                result: { error: error instanceof Error ? error.message : 'Unknown error' }
            });
        } finally {
            setIsTesting(false);
        }
    };

    const handleParamChange = (name: string, value: string | boolean | number | Record<string, unknown>, isArray: boolean = false, index?: number, fieldName?: string) => {
        setTestParams(prev => {
            if (isArray) {
                const currentArray = Array.isArray(prev[name]) ? prev[name] as any[] : [];
                if (index !== undefined) {
                    // Update existing array element
                    const newArray = [...currentArray];
                    if (fieldName) {
                        // Update a field in an object array element
                        newArray[index] = { ...newArray[index], [fieldName]: value };
                    } else {
                        // Update a primitive array element
                        newArray[index] = value;
                    }
                    return { ...prev, [name]: newArray };
                } else {
                    // Add new array element
                    return { ...prev, [name]: [...currentArray, value] };
                }
            } else {
                // Handle non-array parameters
                return { ...prev, [name]: value };
            }
        });
    };

    const handleRemoveArrayElement = (name: string, index: number) => {
        setTestParams(prev => {
            const currentArray = Array.isArray(prev[name]) ? prev[name] as any[] : [];
            return { ...prev, [name]: currentArray.filter((_, i) => i !== index) };
        });
    };

    const renderArrayInput = (name: string, param: any, value: any[] = []) => {
        const itemSchema = param.items;
        const isObjectArray = itemSchema.type === 'object';

        return (
            <div>
                {value.map((item, index) => (
                    <div key={index} style={{ marginBottom: '8px', padding: '8px', border: '1px solid #eee', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 'bold' }}>Item {index + 1}</span>
                            <button 
                                className="btn remove-button"
                                onClick={() => handleRemoveArrayElement(name, index)}
                            >
                                Remove
                            </button>
                        </div>
                        {isObjectArray ? (
                            <div style={{ display: 'grid', gap: '8px' }}>
                                {Object.entries(itemSchema.properties).map(([fieldName, fieldSchema]: [string, any]) => (
                                    <div key={fieldName}>
                                        <label style={{ display: 'block', marginBottom: '4px' }}>
                                            {fieldName} ({fieldSchema.type})
                                        </label>
                                        {fieldSchema.type === 'boolean' ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={item[fieldName] || false}
                                                    onChange={(e) => handleParamChange(name, e.target.checked, true, index, fieldName)}
                                                    style={{ margin: 0 }}
                                                />
                                                <span style={{ color: '#666' }}>{fieldSchema.description || 'Enable this option'}</span>
                                            </div>
                                        ) : (
                            <input 
                                type="text" 
                                                value={item[fieldName] || ''}
                                                onChange={(e) => handleParamChange(name, e.target.value, true, index, fieldName)}
                                style={{ width: '100%', padding: '4px 8px' }}
                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <input
                                type="text"
                                value={item}
                                onChange={(e) => handleParamChange(name, e.target.value, true, index)}
                                style={{ width: '100%', padding: '4px 8px' }}
                            />
                        )}
                    </div>
                ))}
                <button className="btn add-button"
                    onClick={() => {
                        if (isObjectArray) {
                            // Create a new object with default values based on the schema
                            const newItem = Object.entries(itemSchema.properties).reduce((acc, [fieldName, fieldSchema]: [string, any]) => {
                                acc[fieldName] = fieldSchema.type === 'boolean' ? false : '';
                                return acc;
                            }, {} as Record<string, unknown>);
                            handleParamChange(name, newItem, true);
                        } else {
                            handleParamChange(name, '', true);
                        }
                    }}
                    style={{ marginTop: '4px' }}
                >
                    Add {isObjectArray ? 'Item' : 'Value'}
                </button>
            </div>
        );
    };

    const handleToolPermissionChange = async (permission: ToolPermissionSetting) => {
        if (!selectedTool || !selectedServer) return;
        
        setSelectedToolPermission(permission);
        
        // Update the server config
        const updatedServer = {
            ...selectedServer,
            config: {
                ...selectedServer.config,
                toolPermissionRequired: (() => {
                    const existing = selectedServer.config.toolPermissionRequired || {} as ServerToolPermissionRequiredConfig;
                    const nextTools = { ...(existing.tools || {}) } as Record<string, boolean>;
                    if (permission === TOOL_PERMISSION_SERVER_DEFAULT) {
                        // Remove from overrides to use server default
                        delete nextTools[selectedTool.name];
                    } else {
                        // Set explicit override
                        nextTools[selectedTool.name] = permission === TOOL_PERMISSION_REQUIRED;
                    }
                    return {
                        serverDefault: typeof existing.serverDefault === 'boolean' ? existing.serverDefault : true,
                        tools: Object.keys(nextTools).length > 0 ? nextTools : undefined
                    };
                })()
            }
        };
        
        await handleSaveServer(updatedServer);
        // Update the selected server in local state
        setSelectedServer(updatedServer);
    };

    const handleToolEnabledChange = async (includeMode: 'server_default' | 'always' | 'manual' | 'agent') => {
        if (!selectedTool || !selectedServer) return;
        
        setSelectedToolEnabled(includeMode);
        
        // Update the server config
        let updatedTools = { ...selectedServer.config.toolInclude?.tools };
        
        if (includeMode === 'server_default') {
            // Remove the tool from the tools object to use server default
            delete updatedTools[selectedTool.name];
        } else {
            // Set explicit include mode value
            updatedTools[selectedTool.name] = includeMode;
        }
        
        const updatedServer = {
            ...selectedServer,
            config: {
                ...selectedServer.config,
                toolInclude: {
                    serverDefault: selectedServer.config.toolInclude?.serverDefault || 'always',
                    tools: updatedTools
                }
            }
        };
        
        await handleSaveServer(updatedServer);
        // Update the selected server in local state
        setSelectedServer(updatedServer);
    };

    // Load tool permission when tool is selected
    useEffect(() => {
        if (selectedTool && selectedServer) {
            const permissionState = getToolPermissionState(selectedServer.config, selectedTool.name);
            const permission = permissionState === 'required' ? TOOL_PERMISSION_REQUIRED : permissionState === 'not_required' ? TOOL_PERMISSION_NOT_REQUIRED : TOOL_PERMISSION_SERVER_DEFAULT;
            setSelectedToolPermission(permission);
            
            // Initialize tool include mode (get the four-state value)
            const includeMode = getToolIncludeMode(selectedServer.config, selectedTool.name);
            setSelectedToolEnabled(includeMode);
        }
    }, [selectedTool, selectedServer]);

    if (id !== activeTabId) return null;

    if (showEditModal) {
        return (
            <div style={{ 
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'auto'
            }}>
                <EditServerModal
                    server={editingServer}
                    onSave={handleSaveServer}
                    onCancel={() => setShowEditModal(false)}
                />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', height: '100%' }}>
            {/* Left side - Servers List */}
            <div style={{ width: '250px', borderRight: '1px solid #ccc', overflow: 'auto' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0 }}>Servers</h2>
                    <button className="btn add-button" onClick={handleAddServer}>Add</button>
                </div>
                            <div>
                    <div 
                        className={`tab-items-item ${tabState.mode === 'about' ? 'selected' : ''}`}
                        onClick={() => {
                            setTabState({ mode: 'about' });
                            setSelectedServer(null);
                            setSelectedTool(null);
                        }}
                    >
                        <span className="info-icon">ℹ️</span>
                        <span>About Tools</span>
                    </div>
                    {servers.map(server => (
                        <div
                            key={server.name}
                            className={`tab-items-item ${selectedServer?.name === server.name ? 'selected' : ''}`}
                            onClick={() => {
                                if (!showEditModal) {
                                    setSelectedServer(server);
                                    setTabState({ mode: 'item', selectedItemId: server.name });
                                    setSelectedTool(null);
                                }
                            }}
                        >
                            <span style={{ color: 'var(--text-primary)' }}>{server.name}</span>
                            <span style={{ color: 'var(--text-secondary)' }}> ({server.config.type ?? "stdio"})</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right side - Server Details */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {tabState.mode === 'about' ? (
                    <AboutView
                        title="About Tools"
                        description={
                            <div>
                                <p>
                                    Tools are specialized functions or capabilities that the AI can use to perform specific tasks. 
                                    They extend the AI's abilities beyond just conversation, allowing it to interact with external 
                                    systems, process data, or perform complex operations.
                                </p>
                                <p>
                                    Tools are automatically available to the AI when processing messages. They help the AI 
                                    accomplish tasks more effectively and provide more comprehensive assistance.
                                </p>
                                <p>
                                    This application uses the Model Context Protocol (MCP) to manage and interact with tools. 
                                    MCP is an open protocol that standardizes how applications provide context to LLMs, 
                                    similar to how USB-C provides a standardized way to connect devices.
                                </p>
                                <p>
                                    For more information about MCP, visit the official documentation at{' '}
                                    <a 
                                        href="https://modelcontextprotocol.io/" 
                                        onClick={handleLinkClick}
                                        style={{ color: '#007bff', cursor: 'pointer' }}
                                    >
                                        modelcontextprotocol.io
                                    </a>
                                    . You can also explore the official collection of MCP servers at{' '}
                                    <a 
                                        href="https://github.com/modelcontextprotocol/servers/" 
                                        onClick={handleLinkClick}
                                        style={{ color: '#007bff', cursor: 'pointer' }}
                                    >
                                        github.com/modelcontextprotocol/servers
                                    </a>
                                    .
                                </p>
                            </div>
                        }
                    />
                ) : selectedServer ? (
                    <>
                        {/* Left side - Tool List */}
                        <div style={{ width: '50%', borderRight: '1px solid #ccc', overflow: 'auto' }}>
                            <div style={{ padding: '20px', paddingBottom: '40px' }}>
                                <div 
                                    className={`tab-items-item ${selectedServer && !selectedTool ? 'selected' : ''}`}
                                    onClick={() => setSelectedTool(null)}
                                    style={{ marginBottom: '16px' }}
                                >
                                    <h2 style={{ margin: 0 }}>{selectedServer.name}</h2>
                                </div>
                                <div>
                                    {serverInfo[selectedServer.name]?.serverTools.map((tool: Tool) => (
                                        <div 
                                            key={tool.name}
                                            className={`tab-items-item ${selectedTool?.name === tool.name ? 'selected' : ''}`}
                                            onClick={() => setSelectedTool(tool)}
                                            style={{ display: 'block' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>{tool.name}</h3>
                                                {!isToolInContext(selectedServer.config, tool.name) && (
                                                    <span style={{ 
                                                        padding: '2px 6px', 
                                                        backgroundColor: '#ff4444',
                                                        color: 'white',
                                                        borderRadius: '4px',
                                                        fontSize: '12px',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        Disabled
                                                    </span>
                                                )}
                                            </div>
                                            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)' }}>{tool.description || 'No description'}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Right side - Tool Details */}
                        <div style={{ width: '50%', overflow: 'auto' }}>
                            {selectedTool ? (
                                <div style={{ padding: '20px', paddingBottom: '40px' }}>
                                    <h2 style={{ margin: 0, marginBottom: '20px' }}>{selectedTool.name}</h2>
                                    <p style={{ color: '#666', marginBottom: '20px' }}>{selectedTool.description || 'No description'}</p>
                                    
                                    <div style={{ marginBottom: '20px' }}>
                                        <h3 style={{ marginBottom: '10px' }}>Tool Permission:</h3>
                                        <select
                                            value={selectedToolPermission}
                                            onChange={(e) => handleToolPermissionChange(e.target.value as ToolPermissionSetting)}
                                            style={{ width: '100%', padding: '4px 8px' }}
                                        >
                                            <option value={TOOL_PERMISSION_SERVER_DEFAULT}>
                                                Use Server Default ({selectedServer.config.toolPermissionRequired?.serverDefault !== false ? 'Approval Required' : 'Approval Not Required'})
                                            </option>
                                            <option value={TOOL_PERMISSION_REQUIRED}>Always Required</option>
                                            <option value={TOOL_PERMISSION_NOT_REQUIRED}>Never Required</option>
                                        </select>
                                    </div>

                                    <div style={{ marginBottom: '20px' }}>
                                        <h3 style={{ marginBottom: '10px' }}>Tool Include:</h3>
                                        <select
                                            value={selectedToolEnabled}
                                            onChange={(e) => handleToolEnabledChange(e.target.value as 'server_default' | 'always' | 'manual' | 'agent')}
                                            style={{ width: '100%', padding: '4px 8px' }}
                                        >
                                            <option value="server_default">
                                                Use Server Default ({getToolIncludeServerDefault(selectedServer.config)})
                                            </option>
                                            <option value="always">Always</option>
                                            <option value="manual">Manual</option>
                                            <option value="agent">Agent</option>
                                        </select>
                                    </div>

                                    <div style={{ marginTop: '20px' }}>
                                        <h3 style={{ marginBottom: '10px' }}>Run Tool:</h3>
                                        {selectedTool.inputSchema?.properties && Object.entries(selectedTool.inputSchema.properties).map(([name, param]: [string, any]) => (
                                            <div key={name} style={{ marginBottom: '10px' }}>
                                                <label style={{ display: 'block', marginBottom: '4px' }}>
                                                    {name} ({param.type || 'unknown'})
                                                </label>
                                                {param.type === 'array' ? (
                                                    renderArrayInput(name, param, testParams[name] as any[] || [])
                                                ) : param.type === 'boolean' ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={testParams[name] as boolean || false}
                                                            onChange={(e) => handleParamChange(name, e.target.checked)}
                                                            style={{ margin: 0 }}
                                                        />
                                                        <span style={{ color: '#666' }}>{param.description || 'Enable this option'}</span>
                                                    </div>
                                                ) : param.enum ? (
                                                    <select
                                                        value={testParams[name] as string || ''}
                                                        onChange={(e) => handleParamChange(name, e.target.value)}
                                                        style={{ width: '100%', padding: '4px 8px' }}
                                                    >
                                                        <option value="">Select an option</option>
                                                        {param.enum.map((value: string) => (
                                                            <option key={value} value={value}>{value}</option>
                                                        ))}
                                                    </select>
                                                ) : param.type === 'number' ? (
                                                    <input
                                                        type="number"
                                                        value={testParams[name] as number || ''}
                                                        onChange={(e) => {
                                                            const value = e.target.value === '' ? '' : Number(e.target.value);
                                                            if (value === '' || !isNaN(value)) {
                                                                handleParamChange(name, value);
                                                            }
                                                        }}
                                                        style={{ width: '100%', padding: '4px 8px' }}
                                                    />
                                                ) : (
                                        <input
                                            type="text"
                                                        value={testParams[name] as string || ''}
                                                        onChange={(e) => handleParamChange(name, e.target.value)}
                                                        style={{ width: '100%', padding: '4px 8px' }}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                        <button 
                                            className="btn configure-button"
                                            onClick={handleTestTool}
                                            disabled={isTesting}
                                        >
                                            {isTesting ? 'Running...' : 'Run'}
                                        </button>

                                        {testResults && (
                                            <div style={{ marginTop: '20px', border: '1px solid #ccc', borderRadius: '4px', padding: '10px' }}>
                                                <h3 style={{ margin: '0 0 10px 0' }}>Test Results:</h3>
                                                <div style={{ marginBottom: '10px' }}>
                                                    <strong>Elapsed Time:</strong> {testResults.elapsedTime.toFixed(3)}ms
                                                </div>
                                                <div style={{ marginBottom: '10px' }}>
                                                    <strong>Arguments:</strong>
                                                    <pre style={{ 
                                                        margin: '5px 0 0 0',
                                                        padding: '8px',
                                                        backgroundColor: '#1e1e1e',
                                                        color: '#fff',
                                                        borderRadius: '4px',
                                                        overflow: 'auto',
                                                        fontFamily: 'monospace',
                                                        whiteSpace: 'pre-wrap'
                                                    }}>
                                                        {JSON.stringify(testResults.args, null, 2)}
                                                    </pre>
                                                </div>
                                                <div>
                                                    <strong>Result:</strong>
                                                    <pre style={{ 
                                                        margin: '5px 0 0 0',
                                                        padding: '8px',
                                                        backgroundColor: '#1e1e1e',
                                                        color: '#fff',
                                                        borderRadius: '4px',
                                                        overflow: 'auto',
                                                        fontFamily: 'monospace',
                                                        whiteSpace: 'pre-wrap'
                                                    }}>
                                                        {typeof testResults.result === 'string' ? testResults.result.replace(/\\n/g, '\n') : JSON.stringify(testResults.result, null, 2)}
                                                    </pre>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : selectedServer ? (
                                <div style={{ padding: '20px', paddingBottom: '40px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <h2 style={{ margin: 0 }}>{selectedServer.name}</h2>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0px' }}>
                                            {serverInfo[selectedServer.name]?.isConnected && (
                                                <button 
                                                    className="btn configure-button"
                                                    onClick={async () => {
                                                        try {
                                                            const result = await window.api.pingServer(selectedServer.name);
                                                            alert(`Ping successful! Response time: ${result.elapsedTimeMs.toFixed(3)}ms`);
                                                        } catch (err) {
                                                            alert('Ping failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
                                                        }
                                                    }}
                                                >
                                                    Ping
                                                </button>
                                            )}
                                            <button className="btn configure-button" onClick={() => handleEditServer(selectedServer)}>Edit</button>
                                            <button className="btn remove-button" onClick={() => handleDeleteServer(selectedServer)}>Delete</button>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '20px' }}>
                                        <span style={{ 
                                            padding: '4px 8px', 
                                            backgroundColor: serverInfo[selectedServer.name]?.isConnected ? '#4CAF50' : '#ff4444',
                                            color: 'white',
                                            borderRadius: '4px',
                                            fontSize: '14px'
                                        }}>
                                            {serverInfo[selectedServer.name]?.isConnected ? 'Connected' : 'Disconnected'}
                                        </span>
                                    </div>
                                    <div style={{ marginBottom: '20px' }}>
                                        <h3 style={{ margin: '0 0 10px 0' }}>Configuration:</h3>
                                        <pre style={{ 
                                            margin: 0,
                                            padding: '8px',
                                            backgroundColor: '#1e1e1e',
                                            color: '#fff',
                                            borderRadius: '4px',
                                            overflow: 'auto',
                                            fontFamily: 'monospace',
                                            whiteSpace: 'pre-wrap'
                                        }}>
                                            {JSON.stringify(selectedServer.config, null, 2)}
                                        </pre>
                                    </div>
                                    {serverInfo[selectedServer.name]?.errorLog && serverInfo[selectedServer.name].errorLog.length > 0 && (
                                        <div style={{ marginBottom: '20px' }}>
                                            <h3 style={{ margin: '0 0 10px 0' }}>Server Log:</h3>
                                            <pre style={{ 
                                                margin: 0,
                                                padding: '8px',
                                                backgroundColor: '#1e1e1e',
                                                color: '#ff4444',
                                                borderRadius: '4px',
                                                overflow: 'auto',
                                                fontFamily: 'monospace',
                                                whiteSpace: 'pre-wrap',
                                                maxHeight: '200px'
                                            }}>
                                                {serverInfo[selectedServer.name].errorLog.join('\n')}
                                            </pre>
                                            
                                            {!serverInfo[selectedServer.name].isConnected && (
                                                <>
                                                    {(() => {
                                                        const errorAnalysis = analyzeError(serverInfo[selectedServer.name].errorLog);
                                                        if (errorAnalysis) {
                                                            return (
                                                                <ErrorInfoBanner
                                                                    errorAnalysis={errorAnalysis}
                                                                    onClick={() => {
                                                                        setCurrentErrorAnalysis(errorAnalysis);
                                                                        setCurrentErrorLog(serverInfo[selectedServer.name].errorLog);
                                                                        setShowErrorDialog(true);
                                                                    }}
                                                                />
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </>
                                            )}
                                        </div>
                                    )}
                                    {serverInfo[selectedServer.name]?.isConnected && (
                                        <div style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
                                            Select a tool from the list on the left to view its details and test it.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ padding: '20px', color: '#666' }}>
                                    Select a server to view or edit it, or click Add Server to create a new one.
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div style={{ padding: '20px', color: '#666' }}>
                        Select a server to view or edit it, or click Add Server to create a new one.
                    </div>
                )}
            </div>
            
            {showErrorDialog && currentErrorAnalysis && (
                <ErrorInfoDialog
                    errorAnalysis={currentErrorAnalysis}
                    errorLog={currentErrorLog}
                    onClose={() => {
                        setShowErrorDialog(false);
                        setCurrentErrorAnalysis(null);
                        setCurrentErrorLog([]);
                    }}
                />
            )}
        </div>
    );
}; 