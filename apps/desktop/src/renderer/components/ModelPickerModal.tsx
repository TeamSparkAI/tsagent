import React, { useState, useEffect } from 'react';
import { ProviderType, parseModelString, ProviderModel } from '@tsagent/core';
import { ModelPickerPanel } from './ModelPickerPanel';
import './ModelPickerModal.css';

export interface ModelDetails {
  provider: ProviderType;
  modelId: string;
  modelName: string;
  model?: ProviderModel;
}

interface ModelPickerModalProps {
  currentModel?: string; // Format: "provider:modelId" or undefined
  onSelect: (modelString: string | undefined, details?: ModelDetails) => void; // Returns "provider:modelId" and optional details
  onCancel: () => void;
  isOpen: boolean;
}

export const ModelPickerModal: React.FC<ModelPickerModalProps> = ({
  currentModel,
  onSelect,
  onCancel,
  isOpen
}) => {
  const [initialProvider, setInitialProvider] = useState<ProviderType | undefined>();
  const [initialModelId, setInitialModelId] = useState<string>('');

  // Parse currentModel to extract provider and modelId for initial selection
  useEffect(() => {
    if (isOpen && currentModel) {
      const parsed = parseModelString(currentModel);
      if (parsed) {
        setInitialProvider(parsed.provider);
        setInitialModelId(parsed.modelId);
      } else {
        setInitialProvider(undefined);
        setInitialModelId('');
      }
    } else if (isOpen) {
      setInitialProvider(undefined);
      setInitialModelId('');
    }
  }, [currentModel, isOpen]);

  const handleModelSelect = (provider: ProviderType, modelId: string, model: ProviderModel) => {
    // Auto-apply when model is selected (panel's Apply button behavior)
    const modelString = `${provider}:${modelId}`;
    const details: ModelDetails = {
      provider,
      modelId,
      modelName: model.name,
      model
    };
    onSelect(modelString, details);
  };

  const handleClose = () => {
    onCancel();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="model-picker-modal-overlay" onClick={handleClose}>
      <div className="model-picker-modal-content" onClick={(e) => e.stopPropagation()}>
        <ModelPickerPanel
          selectedModel={initialProvider}
          initialModelId={initialModelId}
          onModelSelect={handleModelSelect}
          onClose={handleClose}
          id="modal" // Not used in modal context
        />
      </div>
    </div>
  );
};

