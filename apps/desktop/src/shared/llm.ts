export enum LLMType {
  Test = 'test',
  Claude = 'claude',
  OpenAI = 'openai',
  Gemini = 'gemini',
  Ollama = "ollama",
  Bedrock = "bedrock"
}

export interface ILLMConfigValue {
  caption?: string;
  hint?: string;
  key: string;
  secret?: boolean;
  required?: boolean;
  default?: string;
}

export interface LLMProviderInfo {
  name: string;
  description: string;
  website?: string;
  configValues?: ILLMConfigValue[];
}

export interface ILLMModel {
  provider: LLMType;
  id: string;
  name: string;
  description?: string;
  modelSource: string;
}