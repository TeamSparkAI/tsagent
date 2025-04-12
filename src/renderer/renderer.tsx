import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../renderer/components/App';
import log from 'electron-log';

// Add logging to verify renderer process is loading
log.info('[RENDERER] Renderer process is loading');

// Initialize the app
const initApp = async () => {
  try {
    log.info('[RENDERER] Initializing app with API available');
    
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
  } catch (error) {
    log.error('[RENDERER] Error initializing app:', error);
  }
};

// Handle any uncaught errors
window.onerror = (message, source, lineno, colno, error) => {
  log.error('Window error:', { message, source, lineno, colno, error });
  return false;
};

// Handle any unhandled promise rejections
window.onunhandledrejection = (event) => {
  log.error('Unhandled promise rejection:', event.reason);
};

// Start initialization when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  log.info('[RENDERER] DOMContentLoaded event fired');
  initApp();
}); 