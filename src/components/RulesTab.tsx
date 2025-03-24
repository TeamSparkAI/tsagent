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
        <div className="modal">
            <div className="modal-content">
                <h2>{rule ? 'Edit Rule' : 'New Rule'}</h2>
                <div>
                    <label>Name:</label>
                    <input 
                        type="text" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
                <div>
                    <label>Description:</label>
                    <input 
                        type="text" 
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>
                <div>
                    <label>Priority Level (0-999):</label>
                    <input 
                        type="number" 
                        min="0"
                        max="999"
                        value={priorityLevel}
                        onChange={(e) => setPriorityLevel(parseInt(e.target.value))}
                    />
                </div>
                <div>
                    <label>Enabled:</label>
                    <input 
                        type="checkbox" 
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                    />
                </div>
                <div>
                    <label>Rule Text (Markdown):</label>
                    <textarea 
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={10}
                    />
                </div>
                <div className="modal-buttons">
                    <button onClick={handleSave}>Save</button>
                    <button onClick={onCancel}>Cancel</button>
                </div>
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
    };

    const handleEditRule = (rule: Rule) => {
        setEditingRule(rule);
        setIsEditing(true);
    };

    const handleSaveRule = async (rule: Rule) => {
        await window.api.saveRule(rule);
        setIsEditing(false);
        loadRules();
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
        <div>
            <button onClick={handleAddRule}>Add Rule</button>
            {rules.map(rule => (
                <div key={rule.name}>
                    <h3>{rule.name}</h3>
                    <p>{rule.description}</p>
                    <p>Priority: {rule.priorityLevel}</p>
                    <p>Enabled: {rule.enabled ? 'Yes' : 'No'}</p>
                    <button onClick={() => handleEditRule(rule)}>Edit</button>
                    <button onClick={() => handleDeleteRule(rule)}>Delete</button>
                    <div>
                        <ReactMarkdown>{rule.text}</ReactMarkdown>
                    </div>
                </div>
            ))}
            {isEditing && (
                <EditRuleModal
                    rule={editingRule}
                    onSave={handleSaveRule}
                    onCancel={() => setIsEditing(false)}
                />
            )}
        </div>
    );
}; 