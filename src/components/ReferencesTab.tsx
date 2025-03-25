import React, { useState, useEffect } from 'react';
import { Reference } from '../types/Reference';
import ReactMarkdown from 'react-markdown';
import { TabProps } from '../types/TabProps';

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

    useEffect(() => {
        loadReferences();
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

    if (id !== activeTabId) return null;

    return (
        <div style={{ display: 'flex', height: '100%' }}>
            {/* Left side - References List */}
            <div style={{ width: '250px', borderRight: '1px solid #ccc', overflow: 'auto' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0 }}>References</h2>
                    <button onClick={handleAddReference}>Add</button>
                </div>
                <div>
                    {references.map(reference => (
                        <div
                            key={reference.name}
                            onClick={() => !isEditing && setSelectedReference(reference)}
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

            {/* Right side - Reference Details or Edit Form */}
            <div style={{ flex: 1, padding: '20px', overflow: 'auto' }}>
                {isEditing ? (
                    <EditReferenceModal
                        reference={editingReference}
                        onSave={handleSaveReference}
                        onCancel={() => setIsEditing(false)}
                    />
                ) : selectedReference ? (
                    <div>
                        <h2>{selectedReference.name}</h2>
                        <p>{selectedReference.description}</p>
                        <div style={{ margin: '16px 0' }}>
                            <button onClick={() => handleEditReference(selectedReference)}>Edit</button>
                            <button 
                                onClick={() => handleDeleteReference(selectedReference)}
                                style={{ marginLeft: '8px' }}
                            >
                                Delete
                            </button>
                        </div>
                        <div style={{ marginTop: '16px', padding: '16px', background: '#f5f5f5', borderRadius: '4px' }}>
                            <ReactMarkdown>{selectedReference.text}</ReactMarkdown>
                        </div>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', color: '#666', marginTop: '40px' }}>
                        Select a reference to view or edit it, or click Add Reference to create a new one.
                    </div>
                )}
            </div>
        </div>
    );
}; 