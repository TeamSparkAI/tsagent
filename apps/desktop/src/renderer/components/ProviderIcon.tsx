import React, { useState, useEffect } from 'react';
import { ProviderId } from '@tsagent/core';
import { getProviderIcon } from '../utils/providerLogos';

interface ProviderIconProps {
  providerType: ProviderId;
  className?: string;
  alt?: string;
  style?: React.CSSProperties;
}

export const ProviderIcon: React.FC<ProviderIconProps> = ({ 
  providerType, 
  className, 
  alt,
  style 
}) => {
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  useEffect(() => {
    getProviderIcon(providerType).then(setIconUrl);
  }, [providerType]);

  if (!iconUrl) {
    return null; // Or return a placeholder
  }

  return (
    <img 
      src={iconUrl} 
      alt={alt || providerType}
      className={className}
      style={style}
    />
  );
};

