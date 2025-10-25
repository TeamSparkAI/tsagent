import React, { useState, useEffect } from 'react';
import { ChatAPI } from '../api/ChatAPI';
import log from 'electron-log';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatApi: ChatAPI | null;
  tabId: string;
  onContextChange?: () => void;
}

interface Rule {
  name: string;
  description: string;
  priorityLevel: number;
}

export const RulesModal: React.FC<RulesModalProps> = ({
  isOpen,
  onClose,
  chatApi,
  tabId,
  onContextChange
}) => {
  const [availableRules, setAvailableRules] = useState<Rule[]>([]);
  const [activeRules, setActiveRules] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && chatApi) {
      loadRulesData();
    }
  }, [isOpen, chatApi]);

  const loadRulesData = async () => {
    if (!chatApi) return;
    
    setLoading(true);
    try {
      // Load available rules
      const rules = await window.api.getRules();
      setAvailableRules(rules.map(rule => ({ 
        name: rule.name, 
        description: rule.description, 
        priorityLevel: rule.priorityLevel 
      })));

      // Load active rules
      const activeRulesList = await chatApi.getActiveRules();
      setActiveRules(activeRulesList);
    } catch (error) {
      log.error('Error loading rules data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRuleToggle = async (ruleName: string, isActive: boolean) => {
    if (!chatApi) return;
    
    try {
      if (isActive) {
        const success = await chatApi.removeRule(ruleName);
        if (success) {
          setActiveRules(prev => prev.filter(name => name !== ruleName));
          onContextChange?.();
        }
      } else {
        const success = await chatApi.addRule(ruleName);
        if (success) {
          setActiveRules(prev => [...prev, ruleName]);
          onContextChange?.();
        }
      }
    } catch (error) {
      log.error('Error toggling rule:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Manage Rules</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Manage which rules are available to the current chat session context
            </p>
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-content">
          {loading ? (
            <div className="loading">Loading rules...</div>
          ) : (
            <div className="rules-list">
              {availableRules.map(rule => {
                const isActive = activeRules.includes(rule.name);
                return (
                  <div key={rule.name} className={`rule-item ${isActive ? 'active' : ''}`}>
                    <div className="rule-item-header">
                      <span className="priority">{rule.priorityLevel.toString().padStart(3, '0')}</span>
                      <span className="name" title={rule.description}>{rule.name}</span>
                      <button 
                        className={`toggle-button ${isActive ? 'remove' : 'add'}`}
                        onClick={() => handleRuleToggle(rule.name, isActive)}
                      >
                        {isActive ? 'Remove' : 'Add'}
                      </button>
                    </div>
                    <div className="rule-item-description">{rule.description}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
