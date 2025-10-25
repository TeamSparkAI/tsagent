import React, { useState, useEffect } from 'react';
import { ChatAPI } from '../api/ChatAPI';
import log from 'electron-log';

interface ReferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatApi: ChatAPI | null;
  tabId: string;
  onContextChange?: () => void;
}

interface Reference {
  name: string;
  description: string;
  priorityLevel: number;
}

export const ReferencesModal: React.FC<ReferencesModalProps> = ({
  isOpen,
  onClose,
  chatApi,
  tabId,
  onContextChange
}) => {
  const [availableReferences, setAvailableReferences] = useState<Reference[]>([]);
  const [activeReferences, setActiveReferences] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && chatApi) {
      loadReferencesData();
    }
  }, [isOpen, chatApi]);

  const loadReferencesData = async () => {
    if (!chatApi) return;
    
    setLoading(true);
    try {
      // Load available references
      const references = await window.api.getReferences();
      setAvailableReferences(references.map(ref => ({ 
        name: ref.name, 
        description: ref.description, 
        priorityLevel: ref.priorityLevel 
      })));

      // Load active references
      const activeRefs = await chatApi.getActiveReferences();
      setActiveReferences(activeRefs);
    } catch (error) {
      log.error('Error loading references data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReferenceToggle = async (referenceName: string, isActive: boolean) => {
    if (!chatApi) return;
    
    try {
      if (isActive) {
        const success = await chatApi.removeReference(referenceName);
        if (success) {
          setActiveReferences(prev => prev.filter(name => name !== referenceName));
          onContextChange?.();
        }
      } else {
        const success = await chatApi.addReference(referenceName);
        if (success) {
          setActiveReferences(prev => [...prev, referenceName]);
          onContextChange?.();
        }
      }
    } catch (error) {
      log.error('Error toggling reference:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Manage References</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-content">
          {loading ? (
            <div className="loading">Loading references...</div>
          ) : (
            <div className="references-list">
              {availableReferences.map(reference => {
                const isActive = activeReferences.includes(reference.name);
                return (
                  <div key={reference.name} className={`reference-item ${isActive ? 'active' : ''}`}>
                    <div className="reference-item-header">
                      <span className="priority">{reference.priorityLevel.toString().padStart(3, '0')}</span>
                      <span className="name" title={reference.description}>{reference.name}</span>
                      <button 
                        className={`toggle-button ${isActive ? 'remove' : 'add'}`}
                        onClick={() => handleReferenceToggle(reference.name, isActive)}
                      >
                        {isActive ? 'Remove' : 'Add'}
                      </button>
                    </div>
                    <div className="reference-item-description">{reference.description}</div>
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
