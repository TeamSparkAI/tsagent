import React, { useState } from 'react';

interface SecretEditFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

/** Match Tools.tsx env/header value inputs (flex row + global.css border). */
const inputStyle: React.CSSProperties = {
  flex: 1,
  width: '100%',
  minWidth: 0,
  padding: '4px 8px',
  paddingRight: '36px',
  boxSizing: 'border-box',
  lineHeight: 'normal',
};

const wrapperStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  position: 'relative',
  display: 'flex',
  alignSelf: 'stretch',
};

const eyeButtonStyle: React.CSSProperties = {
  position: 'absolute',
  right: '8px',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#666',
};

export const SecretEditField: React.FC<SecretEditFieldProps> = ({
  value,
  onChange,
  placeholder = 'Value',
  style,
}) => {
  const [show, setShow] = useState(false);

  return (
    <div style={{ ...wrapperStyle, ...style }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
        autoComplete="off"
      />
      <button
        type="button"
        style={eyeButtonStyle}
        onClick={() => setShow((v) => !v)}
        tabIndex={0}
        aria-label={show ? 'Hide value' : 'Show value'}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#333';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#666';
        }}
      >
        {show ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-5.523 0-10-4.03-10-7 0-1.13.47-2.21 1.325-3.175M6.62 6.62A9.956 9.956 0 0112 5c5.523 0 10 4.03 10 7 0 1.13-.47 2.21-1.325 3.175M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </div>
  );
};
