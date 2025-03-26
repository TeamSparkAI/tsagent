import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import log from 'electron-log';

// Handle any uncaught errors
window.onerror = (message, source, lineno, colno, error) => {
  log.error('Window error:', { message, source, lineno, colno, error });
  return false;
};

// Handle any unhandled promise rejections
window.onunhandledrejection = (event) => {
  log.error('Unhandled promise rejection:', event.reason);
};

// Add event handler for dev tools button
document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.tab-container');
  if (!container) {
    log.error('Tab container not found');
    throw new Error('Tab container not found');
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  // Add event handler for dev tools button
  const debugButton = document.getElementById('debug-button');
  if (debugButton) {
    debugButton.addEventListener('click', () => {
      window.api.toggleDevTools();
    });
  }
}); 