import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Reference } from '@tsagent/core';
import { TabProps } from '../types/TabProps';
import { TabState, TabMode } from '../types/TabState';
import { AboutView } from './AboutView';
import log from 'electron-log';

interface EditReferenceModalProps {
    reference?: Reference;
    onSave: (reference: Reference) => void;
    onCancel: () => void;
}

const EditReferenceModal: React.FC<EditReferenceModalProps> = ({ reference, onSave, onCancel }) => {
    const [name, setName] = useState(reference?.name || '');
    const [description, setDescription] = useState(reference?.description || '');
    const [priorityLevel, setPriorityLevel] = useState(reference?.priorityLevel || 500);
    const [enabled, setEnabled] = useState(reference?.enabled ?? true);
    const [text, setText] = useState(reference?.text || '');
    const [include, setInclude] = useState<'always' | 'manual' | 'agent'>(reference?.include || 'manual');
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
        setError(null);
        try {
            if (!name.trim()) {
                setError('Name is required');
                return;
            }
            
            // Validate name format (letters, numbers, underscores, and dashes only)
            if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
                setError('Reference name can only contain letters, numbers, underscores, and dashes');
                return;
            }

            onSave({
                name,
                description,
                priorityLevel,
                enabled,
                text,
                include
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save reference');
            // Keep the modal open when there's an error
            return;
        }
    };

    return (
        <div style={{ padding: '20px' }}>
            <h2 style={{ marginTop: 0 }}>{reference ? 'Edit Reference' : 'New Reference'}</h2>
            
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
            
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '120px 1fr',
                gap: '12px',
                alignItems: 'baseline',
                marginBottom: '20px'
            }}>
                <label style={{ fontWeight: 'bold', paddingTop: '8px' }}>Name:</label>
                <div>
                    <input 
                        type="text" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        style={{ width: '100%', padding: '8px' }}
                    />
                    <div style={{ 
                        fontSize: '0.8em', 
                        color: '#666', 
                        marginTop: '4px' 
                    }}>
                        Only letters, numbers, underscores, and dashes allowed
                    </div>
                </div>

                <label style={{ fontWeight: 'bold', paddingTop: '8px' }}>Description:</label>
                <input 
                    type="text" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{ width: '100%', padding: '8px' }}
                />

                <label style={{ fontWeight: 'bold', paddingTop: '8px' }}>Priority Level:</label>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <input 
                        type="number" 
                        min="0"
                        max="999"
                        value={priorityLevel}
                        onChange={(e) => setPriorityLevel(parseInt(e.target.value))}
                        style={{ width: '80px', padding: '8px' }}
                    />
                    <span style={{ color: '#666' }}>(000-999)</span>
                </div>

                <label style={{ fontWeight: 'bold', paddingTop: '8px' }}>Enabled:</label>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <input 
                        type="checkbox" 
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                        style={{ margin: '0', transform: 'scale(1.2)' }}
                    />
                </div>

                <label style={{ fontWeight: 'bold', paddingTop: '8px' }}>Include:</label>
                <select 
                    value={include}
                    onChange={(e) => setInclude(e.target.value as 'always' | 'manual' | 'agent')}
                    style={{ width: 'fit-content', padding: '8px' }}
                >
                    <option value="always">Always (included in new sessions)</option>
                    <option value="manual">Manual (user can add/remove)</option>
                    <option value="agent">Agent (agent can add/remove)</option>
                </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
                <label style={{ 
                    display: 'block', 
                    fontWeight: 'bold',
                    marginBottom: '8px' 
                }}>
                    Reference Text (Markdown)
                </label>
                <textarea 
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={15}
                    style={{ 
                        width: '100%',
                        padding: '8px',
                        fontFamily: 'monospace',
                        resize: 'vertical'
                    }}
                />
            </div>

            <div style={{ 
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px'
            }}>
                <button className="btn cancel-button" onClick={onCancel}>Cancel</button>
                <button className="btn apply-button" onClick={handleSave}>Save</button>
            </div>
        </div>
    );
};

export const ReferencesTab: React.FC<TabProps> = ({ id, activeTabId, name, type }) => {
    const [references, setReferences] = useState<Reference[]>([]);
    const [selectedReference, setSelectedReference] = useState<Reference | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editingReference, setEditingReference] = useState<Reference | undefined>(undefined);
    const [tabState, setTabState] = useState<TabState>({ mode: 'about' });

    useEffect(() => {
        log.info('[REFERENCES TAB] Component mounted, loading initial references');
        loadReferences();
        
        // Add event listener for references changes
        log.info('[REFERENCES TAB] Setting up references-changed event listener');
        const listener = window.api.onReferencesChanged(() => {
            log.info('[REFERENCES TAB] References changed event received, reloading references');
            loadReferences();
        });
        
        return () => {
            log.info('[REFERENCES TAB] Component unmounting, cleaning up event listener');
            if (listener) {
                window.api.offReferencesChanged(listener);
                log.info('[REFERENCES TAB] Successfully removed references-changed listener');
            }
        };
    }, []);

    const loadReferences = async () => {
        const loadedReferences = await window.api.getReferences();
        setReferences(loadedReferences);
    };

    const handleAddReference = () => {
        setEditingReference(undefined);
        setIsEditing(true);
        setSelectedReference(null);
    };

    const handleEditReference = (reference: Reference) => {
        setEditingReference(reference);
        setIsEditing(true);
    };

    const handleSaveReference = async (reference: Reference) => {
        try {
            // Check if there's already a reference with this name (excluding the current one being edited)
            const existingReference = references.find(r => 
                r.name === reference.name && 
                (editingReference ? r.name !== editingReference.name : true)
            );
            
            if (existingReference) {
                throw new Error(`A reference with the name "${reference.name}" already exists`);
            }

            // If we're editing an existing reference and the name has changed
            if (editingReference && editingReference.name !== reference.name) {
                // Delete the old reference first
                await window.api.deleteReference(editingReference.name);
            }
            await window.api.saveReference(reference);
            setIsEditing(false);
            await loadReferences();
            setSelectedReference(reference);
            // Update tabState to show the new reference in the details panel
            setTabState({ mode: 'item', selectedItemId: reference.name });
        } catch (error) {
            // Re-throw the error to be handled by the EditReferenceModal
            throw error;
        }
    };

    const handleDeleteReference = async (reference: Reference) => {
        if (confirm(`Are you sure you want to delete the reference "${reference.name}"?`)) {
            await window.api.deleteReference(reference.name);
            setSelectedReference(null);
            setTabState({ mode: 'about' });
            loadReferences();
        }
    };

    const handleItemSelect = (itemId: string) => {
        setTabState({ mode: 'item', selectedItemId: itemId });
    };

    const handleBackToAbout = () => {
        setTabState({ mode: 'about' });
    };

    const renderContent = () => {
        if (tabState.mode === 'about') {
            return (
                <AboutView
                    title="About References"
                    description={
                        <div>
                            <p>
                                References are documents or pieces of information that can be included in your chat context. 
                                They help provide background information, guidelines, or specific details that the AI can 
                                reference when responding to your questions.  The can serve as the "memory" of an agent
                                or chat session.
                            </p>
                            <p>
                                You can set references to be inclued automatically in chat sessions, or you can add (or remove) 
                                them manually with the Context panel.  You can also add a reference by mentioning it using 
                                @ref:referenceName in your message. 
                            </p>
                            <p>
                                If you have the internal References tool installed, the AI can create and modify references, and 
                                include them as needed, all based on your instructions in the chat session.
                            </p>
                        </div>
                    }
                />
            );
        }

        // Item view rendering logic
        const reference = references.find(r => r.name === tabState.selectedItemId);
        if (!reference) return null;

        return (
            <div>
                <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0 }}>{reference.name}</h2>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn configure-button" onClick={() => handleEditReference(reference)}>Edit</button>
                        <button className="btn remove-button" onClick={() => handleDeleteReference(reference)}>Delete</button>
                    </div>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: '#666' }}>Description</h3>
                    <p style={{ margin: 0 }}>{reference.description}</p>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: '#666' }}>Priority Level</h3>
                    <p style={{ margin: 0, fontFamily: 'monospace' }}>
                        {reference.priorityLevel.toString().padStart(3, '0')}
                    </p>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: '#666' }}>Status</h3>
                    <p style={{ margin: 0 }}>{reference.enabled ? 'Enabled' : 'Disabled'}</p>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: '#666' }}>Include</h3>
                    <p style={{ margin: 0 }}>
                        {reference.include === 'always' ? 'Always (included in new sessions)' :
                         reference.include === 'manual' ? 'Manual (user can add/remove)' :
                         'Agent (agent can add/remove)'}
                    </p>
                </div>
                <div>
                    <h3 style={{ margin: '0 0 8px 0', color: '#666' }}>Content</h3>
                    <div style={{ 
                        padding: '16px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)'
                    }}>
                        <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                                p: ({node, ...props}) => <p style={{ 
                                    margin: '0 0 1em 0',
                                    whiteSpace: 'pre-line',
                                    color: 'var(--text-primary)'
                                }} {...props} />,
                                pre: ({node, ...props}) => <pre style={{ 
                                    whiteSpace: 'pre-wrap',
                                    margin: '0 0 1em 0',
                                    padding: '1em',
                                    backgroundColor: 'var(--bg-tertiary)',
                                    borderRadius: '4px',
                                    color: 'var(--text-primary)'
                                }} {...props} />
                            }}
                        >
                            {reference.text}
                        </ReactMarkdown>
                    </div>
                </div>
            </div>
        );
    };

    if (id !== activeTabId) return null;

    return (
        <div className={`tab-content ${activeTabId === id ? 'active' : ''}`}>
            {isEditing ? (
                <EditReferenceModal
                    reference={editingReference}
                    onSave={handleSaveReference}
                    onCancel={() => {
                        setIsEditing(false);
                        setEditingReference(undefined);
                    }}
                />
            ) : (
                <div className="tab-items-container">
                    <div className="sidebar">
                        <div className="sidebar-header">
                            <h2>References</h2>
                            <button className="btn add-button" onClick={handleAddReference}>Add</button>
                        </div>
                        <div className="tab-items-list">
                            <div 
                                className={`tab-items-item ${tabState.mode === 'about' ? 'selected' : ''}`}
                                onClick={() => {
                                    setTabState({ mode: 'about' });
                                    setSelectedReference(null);
                                }}
                            >
                                <span className="info-icon">ℹ️</span>
                                <span>About References</span>
                            </div>
                            {references.map(reference => (
                                <div
                                    key={reference.name}
                                    className={`tab-items-item ${selectedReference?.name === reference.name ? 'selected' : ''}`}
                                    onClick={() => {
                                        if (!isEditing) {
                                            setSelectedReference(reference);
                                            setTabState({ mode: 'item', selectedItemId: reference.name });
                                        }
                                    }}
                                >
                                    <span className="reference-priority">
                                        {reference.priorityLevel.toString().padStart(3, '0')}
                                    </span>
                                    <span>{reference.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="references-main">
                        {renderContent()}
                    </div>
                </div>
            )}
        </div>
    );
}; 