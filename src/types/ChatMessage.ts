// This is the "Renderer" chat message
export interface RendererChatMessage {
    type: 'user' | 'ai' | 'system' | 'error';
    content: string;
}