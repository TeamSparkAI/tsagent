import React, { useState, useEffect } from 'react';
import { McpConfig } from '../mcp/types';
import { Tool } from "@modelcontextprotocol/sdk/types";
import { TabProps } from '../types/TabProps';
import log from 'electron-log';

interface ServerInfo {
    serverVersion: string;
    serverTools: any[];
}

interface EditServerModalProps {
    server?: McpConfig;
    onSave: (server: McpConfig) => void;
    onCancel: () => void;
}

const EditServerModal: React.FC<EditServerModalProps> = ({ server, onSave, onCancel }) => {
    const [name, setName] = useState(server?.name || '');
    const [command, setCommand] = useState(server?.command || '');
    const [args, setArgs] = useState<string[]>(server?.args || []);
    const [env, setEnv] = useState<Record<string, string>>(server?.env || {});

    const handleSave = () => {
        onSave({
            name,
            command,
            args,
            env
        });
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

                <label style={{ fontWeight: 'bold' }}>Command:</label>
                <input 
                    type="text" 
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    style={{ width: '100%', padding: '4px 8px' }}
                />

                <label style={{ fontWeight: 'bold', alignSelf: 'start', paddingTop: '8px' }}>Arguments:</label>
                <div>
                    {args.map((arg, index) => (
                        <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                            <input
                                type="text"
                                value={arg}
                                onChange={(e) => {
                                    const newArgs = [...args];
                                    newArgs[index] = e.target.value;
                                    setArgs(newArgs);
                                }}
                                style={{ flex: 1, padding: '4px 8px' }}
                            />
                            <button onClick={() => setArgs(args.filter((_, i) => i !== index))}>
                                Remove
                            </button>
                        </div>
                    ))}
                    <button onClick={() => setArgs([...args, ''])}>Add Argument</button>
                </div>

                <label style={{ fontWeight: 'bold', alignSelf: 'start', paddingTop: '8px' }}>Environment:</label>
                <div>
                    {Object.entries(env).map(([key, value], index) => (
                        <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                            <input
                                type="text"
                                value={key}
                                placeholder="Key"
                                onChange={(e) => {
                                    const newEnv = { ...env };
                                    delete newEnv[key];
                                    newEnv[e.target.value] = value;
                                    setEnv(newEnv);
                                }}
                                style={{ width: '40%', padding: '4px 8px' }}
                            />
                            <input
                                type="text"
                                value={value}
                                placeholder="Value"
                                onChange={(e) => {
                                    setEnv({ ...env, [key]: e.target.value });
                                }}
                                style={{ flex: 1, padding: '4px 8px' }}
                            />
                            <button onClick={() => {
                                const newEnv = { ...env };
                                delete newEnv[key];
                                setEnv(newEnv);
                            }}>
                                Remove
                            </button>
                        </div>
                    ))}
                    <button onClick={() => setEnv({ ...env, '': '' })}>Add Environment Variable</button>
                </div>
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
    const [editingServer, setEditingServer] = useState<(McpConfig) | undefined>(undefined);
    const [serverInfo, setServerInfo] = useState<Record<string, ServerInfo>>({});

    useEffect(() => {
        loadServers();
    }, []);

    const loadServers = async () => {
        const serverConfigs = await window.api.getServerConfigs();
        log.info('serverConfigs', serverConfigs);
        setServers(serverConfigs);
        
        const infoMap: Record<string, ServerInfo> = {};
        for (const config of serverConfigs) {
            try {
                const info = await window.api.getMCPClient(config.name) as ServerInfo;
                infoMap[config.name] = info;
            } catch (err) {
                log.error(`Failed to connect to server ${config.name}:`, err);
            }
        }
        setServerInfo(infoMap);
    };

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
        await window.api.saveServerConfig(server);
        setShowEditModal(false);
        await loadServers();
        setSelectedServer(server);
    };

    const handleDeleteServer = async (server: McpConfig) => {
        if (confirm(`Are you sure you want to delete the server "${server.name}"?`)) {
            await window.api.deleteServerConfig(server.name);
            setSelectedServer(null);
            loadServers();
        }
    };

    if (id !== activeTabId) return null;

    return (
        <div style={{ display: 'flex', height: '100%' }}>
            {/* Left side - Servers List */}
            <div style={{ width: '250px', borderRight: '1px solid #ccc', overflow: 'auto' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0 }}>Servers</h2>
                    <button onClick={handleAddServer}>Add Server</button>
                </div>
                <div>
                    {servers.map(server => (
                        <div
                            key={server.name}
                            onClick={() => !showEditModal && setSelectedServer(server)}
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
                        </div>
                    ))}
                </div>
            </div>

            {/* Right side - Server Details or Edit Form */}
            <div style={{ flex: 1, padding: '20px', overflow: 'auto' }}>
                {showEditModal ? (
                    <EditServerModal
                        server={editingServer}
                        onSave={handleSaveServer}
                        onCancel={() => setShowEditModal(false)}
                    />
                ) : selectedServer ? (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0 }}>{selectedServer.name}</h2>
                            <div>
                                <button onClick={() => handleEditServer(selectedServer)}>Edit</button>
                                <button 
                                    onClick={() => handleDeleteServer(selectedServer)}
                                    style={{ marginLeft: '8px' }}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>

                        {serverInfo[selectedServer.name]?.serverTools.map((tool: Tool) => (
                            <div key={tool.name} className="tool-item" style={{ marginBottom: '20px' }}>
                                <h3>{tool.name}</h3>
                                <p>{tool.description || 'No description'}</p>
                                {tool.inputSchema?.properties && Object.keys(tool.inputSchema.properties).length > 0 && (
                                    <div className="parameters">
                                        <h4>Parameters:</h4>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ccc' }}>Name</th>
                                                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ccc' }}>Type</th>
                                                    <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ccc' }}>Description</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Object.entries(tool.inputSchema.properties).map(([name, param]: [string, any]) => (
                                                    <tr key={name}>
                                                        <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{name}</td>
                                                        <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}><code>{param.type || 'unknown'}</code></td>
                                                        <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{param.description || ''}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', color: '#666', marginTop: '40px' }}>
                        Select a server to view or edit it, or click Add Server to create a new one.
                    </div>
                )}
            </div>
        </div>
    );
}; 