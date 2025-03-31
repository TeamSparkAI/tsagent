import React, { useState, useEffect } from 'react';
import { McpConfig, McpConfigFileServerConfig } from '../mcp/types';
import { Tool } from "@modelcontextprotocol/sdk/types";
import { TabProps } from '../types/TabProps';
import { TabState, TabMode } from '../types/TabState';
import { AboutView } from './AboutView';
import { CallToolResultWithElapsedTime } from '../mcp/types';
import log from 'electron-log';

interface ServerInfo {
    serverVersion: { name: string; version: string } | null;
    serverTools: any[];
    errorLog: string[];
    isConnected: boolean;
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
    const [name, setName] = useState(server?.name || '');
    const [serverType, setServerType] = useState<'stdio' | 'sse' | 'internal'>(server?.config.type || 'stdio');
    const [command, setCommand] = useState(server?.config.type === 'stdio' ? server.config.command : '');
    const [args, setArgs] = useState(server?.config.type === 'stdio' ? server.config.args.join(' ') : '');
    const [env, setEnv] = useState(server?.config.type === 'stdio' ? JSON.stringify(server.config.env || {}) : '{}');
    const [url, setUrl] = useState(server?.config.type === 'sse' ? server.config.url : '');
    const [headers, setHeaders] = useState<Record<string, string>>(server?.config.type === 'sse' ? server.config.headers || {} : {});
    const [internalTool, setInternalTool] = useState<'rules' | 'references'>(server?.config.type === 'internal' ? server.config.tool : 'rules');

    const handleSave = () => {
        const serverConfig: McpConfig = {
            name,
            config: serverType === 'stdio' 
                ? {
                    type: 'stdio',
                    command,
                    args: args.split(' ').filter(Boolean),
                    env: JSON.parse(env)
                }
                : serverType === 'sse'
                ? {
                    type: 'sse',
                    url,
                    headers
                }
                : {
                    type: 'internal',
                    tool: internalTool
                }
        };
        onSave(serverConfig);
    };

    return (
        <div style={{ padding: '20px' }}>
            <h2 style={{ marginTop: 0 }}>{server ? 'Edit Server' : 'New Server'}</h2>
            
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '120px 1fr',
                gap: '12px',
                alignItems: 'center',
                marginBottom: '20px'
            }}>
                <label style={{ fontWeight: 'bold' }}>Name:</label>
                <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ width: '100%', padding: '4px 8px' }}
                />

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
                            {args.split(' ').filter(Boolean).map((arg, index) => (
                                <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                                    <input
                                        type="text"
                                        value={arg}
                                        onChange={(e) => {
                                            const newArgs = args.split(' ').filter(Boolean);
                                            newArgs[index] = e.target.value;
                                            setArgs(newArgs.join(' '));
                                        }}
                                        style={{ flex: 1, padding: '4px 8px' }}
                                    />
                                    <button onClick={() => setArgs(args.split(' ').filter(Boolean).filter((_, i) => i !== index).join(' '))}>
                                        Remove
                                    </button>
                                </div>
                            ))}
                            <button onClick={() => setArgs(args.split(' ').filter(Boolean).join(' '))}>Add Argument</button>
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
                                    <button onClick={() => {
                                        const newEnv = { ...JSON.parse(env) };
                                        delete newEnv[key];
                                        setEnv(JSON.stringify(newEnv));
                                    }}>
                                        Remove
                                    </button>
                                </div>
                            ))}
                            <button onClick={() => setEnv(JSON.stringify({ ...JSON.parse(env), '': '' }))}>Add Environment Variable</button>
                        </div>
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
                                    <button onClick={() => {
                                        const newHeaders = { ...headers };
                                        delete newHeaders[key];
                                        setHeaders(newHeaders);
                                    }}>
                                        Remove
                                    </button>
                                </div>
                            ))}
                            <button onClick={() => setHeaders({ ...headers, '': '' })}>Add Header</button>
                        </div>
                    </>
                )}

                {serverType === 'internal' && (
                    <>
                        <label style={{ fontWeight: 'bold' }}>Tool:</label>
                        <select 
                            value={internalTool}
                            onChange={(e) => setInternalTool(e.target.value as 'rules' | 'references')}
                            style={{ width: 'auto', padding: '4px 8px' }}
                        >
                            <option value="rules">Rules</option>
                            <option value="references">References</option>
                        </select>
                    </>
                )}
            </div>

            <div style={{ 
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px'
            }}>
                <button onClick={onCancel}>Cancel</button>
                <button 
                    onClick={handleSave}
                    style={{ 
                        padding: '6px 12px',
                        backgroundColor: '#0066cc',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    Save
                </button>
            </div>
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

    useEffect(() => {
        loadServers();
    }, []);

    // Clear test results when server or tool selection changes
    useEffect(() => {
        setTestResults(null);
        setTestParams({});
    }, [selectedServer, selectedTool]);

    const loadServers = async () => {
        const loadedServers = await window.api.getServerConfigs();
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
        setEditingServer(server);
        setShowEditModal(true);
    };

    const handleSaveServer = async (server: McpConfig) => {
        try {
            await window.api.saveServerConfig(server);
            setShowEditModal(false);
            await loadServers();
            setSelectedServer(server);
            await loadServerInfo(server.name);
        } catch (error) {
            log.error('Error saving server:', error);
        }
    };

    const handleDeleteServer = async (server: McpConfig) => {
        if (confirm(`Are you sure you want to delete the server "${server.name}"?`)) {
            await window.api.deleteServerConfig(server.name);
            setSelectedServer(null);
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
            
            // Extract the result content
            const resultContent = result.content[0];
            let resultText: string;
            
            if (resultContent?.type === 'text') {
                resultText = resultContent.text;
            } else if (resultContent?.type === 'image') {
                resultText = `[Image: ${resultContent.mimeType}]`;
            } else if (resultContent?.type === 'resource') {
                resultText = `[Resource: ${resultContent.mimeType}]`;
            } else {
                resultText = JSON.stringify(resultContent);
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

    const handleParamChange = (name: string, value: string | boolean | Record<string, unknown>, isArray: boolean = false, index?: number, fieldName?: string) => {
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
                                onClick={() => handleRemoveArrayElement(name, index)}
                                style={{ padding: '2px 6px' }}
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
                <button 
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

    if (id !== activeTabId) return null;

    if (showEditModal) {
        return (
            <EditServerModal
                server={editingServer}
                onSave={handleSaveServer}
                onCancel={() => setShowEditModal(false)}
            />
        );
    }

    return (
        <div style={{ display: 'flex', height: '100%' }}>
            {/* Left side - Servers List */}
            <div style={{ width: '250px', borderRight: '1px solid #ccc', overflow: 'auto' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0 }}>Servers</h2>
                    <button 
                        onClick={handleAddServer}
                    >
                        Add Server
                    </button>
                </div>
                <div>
                    <div 
                        onClick={() => {
                            setTabState({ mode: 'about' });
                            setSelectedServer(null);
                            setSelectedTool(null);
                        }}
                        style={{
                            padding: '8px 16px',
                            cursor: 'pointer',
                            backgroundColor: tabState.mode === 'about' ? '#e0e0e0' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}
                    >
                        <span style={{ color: '#666' }}>ℹ️</span>
                        <span>About Tools</span>
                    </div>
                    {servers.map(server => (
                        <div
                            key={server.name}
                            onClick={() => {
                                if (!showEditModal) {
                                    setSelectedServer(server);
                                    setTabState({ mode: 'item', selectedItemId: server.name });
                                    setSelectedTool(null);
                                }
                            }}
                            style={{
                                padding: '8px 16px',
                                cursor: showEditModal ? 'not-allowed' : 'pointer',
                                backgroundColor: selectedServer?.name === server.name ? '#e0e0e0' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                filter: showEditModal ? 'grayscale(0.5)' : 'none',
                                pointerEvents: showEditModal ? 'none' : 'auto'
                            }}
                        >
                            <span>{server.name}</span>
                            <span style={{ color: '#666', fontSize: '0.9em' }}>({server.config.type})</span>
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
                                    <a href="https://modelcontextprotocol.io/" target="_blank" rel="noopener noreferrer">
                                        modelcontextprotocol.io
                                    </a>
                                    . You can also explore the official collection of MCP servers at{' '}
                                    <a href="https://github.com/modelcontextprotocol/servers/" target="_blank" rel="noopener noreferrer">
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
                                    style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center', 
                                        marginBottom: '20px',
                                        cursor: 'pointer',
                                        padding: '8px',
                                        borderRadius: '4px',
                                        backgroundColor: selectedServer && !selectedTool ? '#e0e0e0' : 'transparent'
                                    }}
                                    onClick={() => setSelectedTool(null)}
                                >
                                    <h2 style={{ margin: 0 }}>{selectedServer.name}</h2>
                                </div>
                                <div>
                                    {serverInfo[selectedServer.name]?.serverTools.map((tool: Tool) => (
                                        <div 
                                            key={tool.name} 
                                            className="tool-item" 
                                            style={{ 
                                                marginBottom: '10px',
                                                padding: '10px',
                                                cursor: 'pointer',
                                                backgroundColor: selectedTool?.name === tool.name ? '#e0e0e0' : 'transparent',
                                                borderRadius: '4px'
                                            }}
                                            onClick={() => setSelectedTool(tool)}
                                        >
                                            <h3 style={{ margin: 0 }}>{tool.name}</h3>
                                            <p style={{ margin: '5px 0 0 0', color: '#666' }}>{tool.description || 'No description'}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Right side - Tool Details */}
                        <div style={{ width: '50%', overflow: 'auto' }}>
                            {selectedServer ? (
                                selectedTool ? (
                                    <div style={{ padding: '20px', paddingBottom: '40px' }}>
                                        <h2 style={{ margin: 0, marginBottom: '20px' }}>{selectedTool.name}</h2>
                                        <p style={{ color: '#666', marginBottom: '20px' }}>{selectedTool.description || 'No description'}</p>
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
                                                onClick={handleTestTool}
                                                disabled={isTesting}
                                                style={{ marginTop: '10px' }}
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
                                ) : (
                                    <div style={{ padding: '20px', paddingBottom: '40px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <h2 style={{ margin: 0 }}>{selectedServer.name}</h2>
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
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {serverInfo[selectedServer.name]?.isConnected && (
                                                    <button 
                                                        onClick={async () => {
                                                            try {
                                                                const result = await window.api.pingServer(selectedServer.name);
                                                                alert(`Ping successful! Response time: ${result.elapsedTimeMs.toFixed(3)}ms`);
                                                            } catch (err) {
                                                                alert('Ping failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
                                                            }
                                                        }}
                                                        style={{ padding: '4px 8px' }}
                                                    >
                                                        Ping
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => handleEditServer(selectedServer)}
                                                    style={{ padding: '4px 8px' }}
                                                >
                                                    Edit
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteServer(selectedServer)}
                                                    style={{ 
                                                        padding: '4px 8px', 
                                                        backgroundColor: '#ff4444', 
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Delete
                                                </button>
                                            </div>
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
                                                    whiteSpace: 'pre-wrap'
                                                }}>
                                                    {serverInfo[selectedServer.name].errorLog.join('\n')}
                                                </pre>
                                            </div>
                                        )}
                                        <div style={{ color: '#666', textAlign: 'center', padding: '40px' }}>
                                            Select a tool from the list on the left to view its details and test it.
                                        </div>
                                    </div>
                                )
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
        </div>
    );
}; 