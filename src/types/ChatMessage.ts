export interface ChatMessage {
    type: 'user' | 'ai' | 'system' | 'error';
    content: string;
} 