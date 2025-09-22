import React, { useState, useEffect } from 'react';
import { Rule } from '@tsagent/core';
import ReactMarkdown from 'react-markdown';
import { TabProps } from '../types/TabProps';
import { TabState, TabMode } from '../types/TabState';
import { AboutView } from './AboutView';
import remarkGfm from 'remark-gfm';
import log from 'electron-log';

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
    const [include, setInclude] = useState<'always' | 'manual' | 'agent'>(rule?.include || 'manual');
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
                setError('Rule name can only contain letters, numbers, underscores, and dashes');
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
            setError(err instanceof Error ? err.message : 'Failed to save rule');
            // Keep the modal open when there's an error
            return;
        }
    };

    return (
        <div style={{ padding: '20px' }}>
            <h2 style={{ marginTop: 0 }}>{rule ? 'Edit Rule' : 'New Rule'}</h2>
            
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

export const RulesTab: React.FC<TabProps> = ({ id, activeTabId, name, type }) => {
    const [rules, setRules] = useState<Rule[]>([]);
    const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editingRule, setEditingRule] = useState<Rule | undefined>(undefined);
    const [tabState, setTabState] = useState<TabState>({ mode: 'about' });

    useEffect(() => {
        log.info('[RULES TAB] Component mounted, loading initial rules');
        loadRules();
        
        // Add event listener for rule changes
        log.info('[RULES TAB] Setting up rules-changed event listener');
        const listener = window.api.onRulesChanged(() => {
            log.info('[RULES TAB] Rules changed event received, reloading rules');
            loadRules();
        });
        
        // Cleanup event listener on unmount
        return () => {
            log.info('[RULES TAB] Component unmounting, cleaning up event listener');
            if (listener) {
                window.api.offRulesChanged(listener);
                log.info('[RULES TAB] Successfully removed rules-changed listener');
            }
        };
    }, []);

    const loadRules = async () => {
        try {
            const loadedRules = await window.api.getRules();
            log.info(`[RULES TAB] Rules loaded successfully: ${loadedRules.length} rules found`);
            setRules(loadedRules);
        } catch (error) {
            log.error('[RULES TAB] Error loading rules:', error);
        }
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
        try {
            // Check if there's already a rule with this name (excluding the current one being edited)
            const existingRule = rules.find(r => 
                r.name === rule.name && 
                (!editingRule || r.name !== editingRule.name)
            );
            
            if (existingRule) {
                throw new Error(`A rule with the name "${rule.name}" already exists`);
            }

            // If we're editing an existing rule and the name has changed
            if (editingRule && editingRule.name !== rule.name) {
                // Delete the old rule first
                await window.api.deleteRule(editingRule.name);
            }
            await window.api.saveRule(rule);
            setIsEditing(false);
            await loadRules();
            setSelectedRule(rule);
            // Update tabState to show the new rule in the details panel
            setTabState({ mode: 'item', selectedItemId: rule.name });
        } catch (error) {
            // Re-throw the error to be handled by the EditRuleModal
            throw error;
        }
    };

    const handleDeleteRule = async (rule: Rule) => {
        if (confirm(`Are you sure you want to delete the rule "${rule.name}"?`)) {
            await window.api.deleteRule(rule.name);
            setSelectedRule(null);
            setTabState({ mode: 'about' });
            loadRules();
        }
    };

    const renderContent = () => {
        if (tabState.mode === 'about') {
            return (
                <AboutView
                    title="About Rules"
                    description={
                        <div>
                            <p>
                                Rules are guidelines or constraints that help shape the AI's behavior and responses. 
                                They can be used to enforce specific policies, maintain consistency, guide problem solving,
                                or provide additional context for how the AI should interact.
                            </p>
                            <p>
                                You can set rules to be inclued automatically in chat sessions, or you can add (or remove) 
                                them manually with the Context panel.  You can also add a rule by mentioning it using 
                                @rule:ruleName in your message. 
                            </p>
                            <p>
                                If you have the internal Rules tool installed, the AI can create and modify rules, and 
                                include them as needed, all based on your instructions in the chat session.
                            </p>

                        </div>
                    }
                />
            );
        }

        // Item view rendering logic
        const rule = rules.find(r => r.name === tabState.selectedItemId);
        if (!rule) return null;

        return (
            <div>
                <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0 }}>{rule.name}</h2>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn configure-button" onClick={() => handleEditRule(rule)}>Edit</button>
                        <button className="btn remove-button" onClick={() => handleDeleteRule(rule)}>Delete</button>
                    </div>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: '#666' }}>Description</h3>
                    <p style={{ margin: 0 }}>{rule.description}</p>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: '#666' }}>Priority Level</h3>
                    <p style={{ margin: 0, fontFamily: 'monospace' }}>
                        {rule.priorityLevel.toString().padStart(3, '0')}
                    </p>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: '#666' }}>Status</h3>
                    <p style={{ margin: 0 }}>{rule.enabled ? 'Enabled' : 'Disabled'}</p>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: '#666' }}>Include</h3>
                    <p style={{ margin: 0 }}>
                        {rule.include === 'always' ? 'Always (included in new sessions)' :
                         rule.include === 'manual' ? 'Manual (user can add/remove)' :
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
                            {rule.text}
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
                <EditRuleModal
                    rule={editingRule}
                    onSave={handleSaveRule}
                    onCancel={() => {
                        setIsEditing(false);
                        setEditingRule(undefined);
                    }}
                />
            ) : (
                <div className="tab-items-container">
                    <div className="sidebar">
                        <div className="sidebar-header">
                            <h2>Rules</h2>
                            <button className="btn add-button" onClick={handleAddRule}>Add</button>
                        </div>
                        <div className="tab-items-list">
                            <div 
                                className={`tab-items-item ${tabState.mode === 'about' ? 'selected' : ''}`}
                                onClick={() => {
                                    setTabState({ mode: 'about' });
                                    setSelectedRule(null);
                                }}
                            >
                                <span className="info-icon">ℹ️</span>
                                <span>About Rules</span>
                            </div>
                            {rules.map(rule => (
                                <div
                                    key={rule.name}
                                    className={`tab-items-item ${selectedRule?.name === rule.name ? 'selected' : ''} ${isEditing ? 'disabled' : ''}`}
                                    onClick={() => {
                                        if (!isEditing) {
                                            setSelectedRule(rule);
                                            setTabState({ mode: 'item', selectedItemId: rule.name });
                                        }
                                    }}
                                    style={{
                                        opacity: rule.enabled ? 1 : 0.5,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    <span className="reference-priority">
                                        {rule.priorityLevel.toString().padStart(3, '0')}
                                    </span>
                                    <span>{rule.name}</span>
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
}