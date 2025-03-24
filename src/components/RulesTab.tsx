import React, { useState, useEffect } from 'react';
import { Rule } from '../types/Rule';
import ReactMarkdown from 'react-markdown';
import { TabProps } from '../types/TabProps';

interface EditRuleModalProps {
    rule?: Rule;
    onSave: (rule: Rule) => void;
    onCancel: () => void;
}

const EditRuleModal: React.FC<EditRuleModalProps> = ({ rule, onSave, onCancel }) => {
    const [name, setName] = useState(rule?.name || '');
    const [description, setDescription] = useState(rule?.description || '');
    const [priorityLevel, setPriorityLevel] = useState(rule?.priorityLevel || 500);
    const [enabled, setEnabled] = useState(rule?.enabled ?? true);
    const [text, setText] = useState(rule?.text || '');

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
            <h2 style={{ marginTop: 0 }}>{rule ? 'Edit Rule' : 'New Rule'}</h2>
            
            {/* Metadata fields in a table layout */}
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

            {/* Rule text section */}
            <div style={{ marginBottom: '20px' }}>
                <label style={{ 
                    display: 'block', 
                    fontWeight: 'bold',
                    marginBottom: '8px' 
                }}>
                    Rule Text (Markdown)
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

            {/* Action buttons */}
            <div style={{ 
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px'
            }}>
                <button 
                    onClick={onCancel}
                    style={{ padding: '6px 12px' }}
                >
                    Cancel
                </button>
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

export const RulesTab: React.FC<TabProps> = ({ id, activeTabId, name, type }) => {
    const [rules, setRules] = useState<Rule[]>([]);
    const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editingRule, setEditingRule] = useState<Rule | undefined>(undefined);

    useEffect(() => {
        loadRules();
    }, []);

    const loadRules = async () => {
        const loadedRules = await window.api.getRules();
        setRules(loadedRules);
    };

    const handleAddRule = () => {
        setEditingRule(undefined);
        setIsEditing(true);
        setSelectedRule(null);
    };

    const handleEditRule = (rule: Rule) => {
        setEditingRule(rule);
        setIsEditing(true);
    };

    const handleSaveRule = async (rule: Rule) => {
        await window.api.saveRule(rule);
        setIsEditing(false);
        await loadRules();
        setSelectedRule(rule);
    };

    const handleDeleteRule = async (rule: Rule) => {
        if (confirm(`Are you sure you want to delete the rule "${rule.name}"?`)) {
            await window.api.deleteRule(rule.name);
            setSelectedRule(null);
            loadRules();
        }
    };

    if (id !== activeTabId) return null;

    return (
        <div style={{ display: 'flex', height: '100%' }}>
            {/* Left side - Rules List */}
            <div style={{ width: '250px', borderRight: '1px solid #ccc', overflow: 'auto' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0 }}>Rules</h2>
                    <button onClick={handleAddRule}>Add Rule</button>
                </div>
                <div>
                    {rules.map(rule => (
                        <div
                            key={rule.name}
                            onClick={() => !isEditing && setSelectedRule(rule)}
                            style={{
                                padding: '8px 16px',
                                cursor: isEditing ? 'not-allowed' : 'pointer',
                                backgroundColor: selectedRule?.name === rule.name ? '#e0e0e0' : 'transparent',
                                opacity: rule.enabled ? 1 : 0.5,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                filter: isEditing ? 'grayscale(0.5)' : 'none',
                                pointerEvents: isEditing ? 'none' : 'auto'
                            }}
                        >
                            <span style={{ fontFamily: 'monospace', color: '#666' }}>
                                {rule.priorityLevel.toString().padStart(3, '0')}
                            </span>
                            <span>{rule.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right side - Rule Details or Edit Form */}
            <div style={{ flex: 1, padding: '20px', overflow: 'auto' }}>
                {isEditing ? (
                    <EditRuleModal
                        rule={editingRule}
                        onSave={handleSaveRule}
                        onCancel={() => setIsEditing(false)}
                    />
                ) : selectedRule ? (
                    <div>
                        <h2>{selectedRule.name}</h2>
                        <p>{selectedRule.description}</p>
                        <div style={{ margin: '16px 0' }}>
                            <button onClick={() => handleEditRule(selectedRule)}>Edit</button>
                            <button 
                                onClick={() => handleDeleteRule(selectedRule)}
                                style={{ marginLeft: '8px' }}
                            >
                                Delete
                            </button>
                        </div>
                        <div style={{ marginTop: '16px', padding: '16px', background: '#f5f5f5', borderRadius: '4px' }}>
                            <ReactMarkdown>{selectedRule.text}</ReactMarkdown>
                        </div>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', color: '#666', marginTop: '40px' }}>
                        Select a rule to view or edit it, or click Add Rule to create a new one.
                    </div>
                )}
            </div>
        </div>
    );
}; 