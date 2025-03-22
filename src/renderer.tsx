import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';

console.log('Renderer starting...');

// Setup debug button
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, setting up debug button');
  document.getElementById('debug-button')?.addEventListener('click', () => {
    console.log('Debug button clicked');
    window.api.toggleDevTools();
  });
});

// Initialize React app
const container = document.querySelector('.tab-container');
console.log('Found container:', container);
if (container) {
  console.log('Creating React root');
  const root = createRoot(container);
  console.log('Rendering App');
  root.render(<App />);
} 