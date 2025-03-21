export enum LLMType {
  Test = 'test',
  Gemini = 'gemini',
  Claude = 'claude',
  OpenAI = 'openai'
}

export interface ILLM {
  generateResponse(prompt: string): Promise<string>;
} 