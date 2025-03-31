import React, { useState, useEffect } from 'react';
import { Reference } from '../types/Reference';
import ReactMarkdown from 'react-markdown';
import { TabProps } from '../types/TabProps';
import { TabState, TabMode } from '../types/TabState';
import { AboutView } from './AboutView';

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

    const handleSave = () => {
        onSave({
            name,
            description,
            priorityLevel,
            enabled,
            text
        });
    };

    return (
        <div style={{ padding: '20px' }}>
            <h2 style={{ marginTop: 0 }}>{reference ? 'Edit Reference' : 'New Reference'}</h2>
            
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

                <label style={{ fontWeight: 'bold' }}>Description:</label>
                <input 
                    type="text" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{ width: '100%', padding: '4px 8px' }}
                />

                <label style={{ fontWeight: 'bold' }}>Priority Level:</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                        type="number" 
                        min="0"
                        max="999"
                        value={priorityLevel}
                        onChange={(e) => setPriorityLevel(parseInt(e.target.value))}
                        style={{ width: '80px', padding: '4px 8px' }}
                    />
                    <span style={{ color: '#666' }}>(000-999)</span>
                </div>

                <label style={{ fontWeight: 'bold' }}>Enabled:</label>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input 
                        type="checkbox" 
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                        style={{ margin: '0' }}
                    />
                </div>
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

export const ReferencesTab: React.FC<TabProps> = ({ id, activeTabId, name, type }) => {
    const [references, setReferences] = useState<Reference[]>([]);
    const [selectedReference, setSelectedReference] = useState<Reference | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editingReference, setEditingReference] = useState<Reference | undefined>(undefined);
    const [tabState, setTabState] = useState<TabState>({ mode: 'about' });

    useEffect(() => {
        loadReferences();
        // Add event listener for reference changes
        window.api.onReferencesChanged(() => {
            loadReferences();
        });
        // Cleanup event listener on unmount
        return () => {
            window.api.onReferencesChanged(() => {});
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
        await window.api.saveReference(reference);
        setIsEditing(false);
        await loadReferences();
        setSelectedReference(reference);
    };

    const handleDeleteReference = async (reference: Reference) => {
        if (confirm(`Are you sure you want to delete the reference "${reference.name}"?`)) {
            await window.api.deleteReference(reference.name);
            setSelectedReference(null);
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
                                reference when responding to your questions.
                            </p>
                            <p>
                                To use a reference in your chat, simply mention it using @ref:referenceName in your message. 
                                The AI will automatically include the reference's content in its context when formulating a response.
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
                        <button onClick={() => handleEditReference(reference)}>Edit</button>
                        <button onClick={() => handleDeleteReference(reference)}>Delete</button>
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
                <div>
                    <h3 style={{ margin: '0 0 8px 0', color: '#666' }}>Content</h3>
                    <div style={{ 
                        padding: '16px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '4px',
                        border: '1px solid #dee2e6'
                    }}>
                        <ReactMarkdown>{reference.text}</ReactMarkdown>
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
                <div className="references-container">
                    <div className="references-sidebar">
                        <div className="sidebar-header">
                            <h3>References</h3>
                            <button onClick={handleAddReference}>Add</button>
                        </div>
                        <div className="references-list">
                            <div 
                                className={`reference-item ${tabState.mode === 'about' ? 'selected' : ''}`}
                                onClick={() => {
                                    setTabState({ mode: 'about' });
                                    setSelectedReference(null);
                                }}
                                style={{
                                    padding: '8px 16px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    backgroundColor: tabState.mode === 'about' ? '#e0e0e0' : 'transparent',
                                }}
                            >
                                <span style={{ color: '#666' }}>ℹ️</span>
                                <span>About References</span>
                            </div>
                            {references.map(reference => (
                                <div
                                    key={reference.name}
                                    className={`reference-item ${selectedReference?.name === reference.name ? 'selected' : ''}`}
                                    onClick={() => {
                                        if (!isEditing) {
                                            setSelectedReference(reference);
                                            setTabState({ mode: 'item', selectedItemId: reference.name });
                                        }
                                    }}
                                    style={{
                                        padding: '8px 16px',
                                        cursor: isEditing ? 'not-allowed' : 'pointer',
                                        backgroundColor: selectedReference?.name === reference.name ? '#e0e0e0' : 'transparent',
                                        opacity: reference.enabled ? 1 : 0.5,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        filter: isEditing ? 'grayscale(0.5)' : 'none',
                                        pointerEvents: isEditing ? 'none' : 'auto'
                                    }}
                                >
                                    <span style={{ fontFamily: 'monospace', color: '#666' }}>
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