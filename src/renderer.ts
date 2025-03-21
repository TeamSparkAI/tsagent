// Add type declarations at the top of the file
declare global {
  interface Window {
    api: {
      sendMessage: (message: string) => Promise<string>;
      switchModel: (modelType: string) => Promise<boolean>;
      toggleDevTools: () => Promise<boolean>;
    }
  }
}

import { LLMFactory } from './llm/llmFactory.js';
import { LLMType } from './llm/types.js';

class ChatUI {
  private chatContainer: HTMLDivElement;
  private messageInput: HTMLInputElement;
  private modelSelect: HTMLSelectElement;
  private modelDisplayNames: Record<string, string> = {
    'test': 'Test LLM',
    'gemini': 'Gemini',
    'claude': 'Claude',
    'openai': 'OpenAI'
  };

  constructor() {
    this.chatContainer = document.getElementById('chat-container') as HTMLDivElement;
    this.messageInput = document.getElementById('message-input') as HTMLInputElement;
    this.modelSelect = document.getElementById('model-select') as HTMLSelectElement;

    // Update model options to match CLI
    this.modelSelect.innerHTML = `
      <option value="test">Test LLM</option>
      <option value="gemini">Gemini</option>
      <option value="claude">Claude</option>
      <option value="openai">OpenAI</option>
    `;

    document.getElementById('send-button')?.addEventListener('click', () => this.sendMessage());
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });
    this.modelSelect.addEventListener('change', () => this.switchModel());
    document.getElementById('debug-button')?.addEventListener('click', () => {
      window.api.toggleDevTools();
    });

    // Add welcome message
    this.addMessage('system', 'Welcome to TeamSpark AI Workbench!');
  }

  private async sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message) return;

    console.log('Renderer sending message:', message);
    this.addMessage('user', message);
    this.messageInput.value = '';

    try {
      console.log('Waiting for response...');
      const response = await window.api.sendMessage(message);
      console.log('Received response:', response);
      this.addMessage('ai', response);
    } catch (error) {
      console.error('Error in renderer:', error);
      this.addMessage('error', 'Failed to get response from AI');
    }
  }

  private async switchModel() {
    const modelType = this.modelSelect.value;
    try {
      const success = await window.api.switchModel(modelType);
      if (success) {
        const displayName = this.modelDisplayNames[modelType] || modelType;
        this.addMessage('system', `Switched to ${displayName} model`);
      } else {
        this.addMessage('error', 'Failed to switch model');
      }
    } catch (error) {
      this.addMessage('error', 'Failed to switch model');
      console.error(error);
    }
  }

  private addMessage(type: 'user' | 'ai' | 'system' | 'error', content: string) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.innerHTML = `<strong>${type.toUpperCase()}:</strong> ${content}`;
    this.chatContainer.appendChild(messageDiv);
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }
}

// Initialize the UI when the document is loaded
new ChatUI(); 