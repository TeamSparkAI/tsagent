import React, { useState } from 'react';
import { obfuscateSecretValue } from '../../utils/secretField';

interface HideRevealProps {
  value: string;
  obfuscate?: (value: string) => string;
}

export const HideReveal: React.FC<HideRevealProps> = ({
  value,
  obfuscate = obfuscateSecretValue,
}) => {
  const [show, setShow] = useState(false);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <code
        style={{
          padding: '2px 6px',
          backgroundColor: '#fff',
          borderRadius: '4px',
          fontFamily: 'monospace',
        }}
      >
        {show ? value : obfuscate(value)}
      </code>
      <button
        type="button"
        className="btn configure-button"
        style={{ padding: '2px 8px', fontSize: '12px' }}
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide value' : 'Reveal value'}
      >
        {show ? 'Hide' : 'Reveal'}
      </button>
    </span>
  );
};
