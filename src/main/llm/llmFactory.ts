import { ILLM, LLMType, LLMProviderInfo } from '../../shared/llm';
import { TestLLM } from './testLLM';
import { ClaudeLLM } from './claudeLLM';
import { OpenAILLM } from './openaiLLM';
import { GeminiLLM } from './geminiLLM';
import log from 'electron-log';
import { OllamaLLM } from './ollamaLLM';
import { BedrockLLM } from './bedrockLLM';
import { WorkspaceManager } from '../state/WorkspaceManager';

export class LLMFactory {
  private workspace: WorkspaceManager;

  constructor(workspace: WorkspaceManager) {
    this.workspace = workspace;
  }

  // Get provider information for all available LLM providers
  getProvidersInfo(): Record<LLMType, LLMProviderInfo> {
    return {
      [LLMType.Bedrock]: BedrockLLM.getInfo(),
      [LLMType.Claude]: ClaudeLLM.getInfo(),
      [LLMType.Gemini]: GeminiLLM.getInfo(),
      [LLMType.Ollama]: OllamaLLM.getInfo(),
      [LLMType.OpenAI]: OpenAILLM.getInfo(),
      [LLMType.Test]: TestLLM.getInfo(),
    };
  }

  getLLMTypeByName(name: string): LLMType | null {
    switch (name.toLowerCase()) {
      case 'bedrock':
        return LLMType.Bedrock;
      case 'claude':
        return LLMType.Claude;
      case 'gemini':
        return LLMType.Gemini;
      case 'ollama':
        return LLMType.Ollama;
      case 'openai':
        return LLMType.OpenAI;
      case 'test':
        return LLMType.Test;
      default:
        return null;
    }
  }

  async validateConfiguration(type: LLMType): Promise<{ isValid: boolean, error?: string }> {
    switch (type) {
      case LLMType.Bedrock:
        return BedrockLLM.validateConfiguration(this.workspace);
      case LLMType.Claude:
        return ClaudeLLM.validateConfiguration(this.workspace);
      case LLMType.Gemini:  
        return GeminiLLM.validateConfiguration(this.workspace);
      case LLMType.Ollama:
        return OllamaLLM.validateConfiguration(this.workspace);
      case LLMType.OpenAI:
        return OpenAILLM.validateConfiguration(this.workspace);
      case LLMType.Test:
        return TestLLM.validateConfiguration(this.workspace);
      default:
        return { isValid: false, error: `Unsupported model type: ${type}` };
    }
  }

  create(modelType: LLMType, modelId?: string): ILLM {
    if (!this.workspace) {
      throw new Error('LLMFactory not initialized with Workspace');
    }

    log.info('LLMFactory creating model:', modelType, modelId ? `with model ID: ${modelId}` : '');

    switch (modelType) {
      case LLMType.Bedrock:
        log.info('Creating Bedrock LLM instance');
        return new BedrockLLM(modelId || 'amazon.nova-pro-v1:0', this.workspace);
      case LLMType.Claude:
        log.info('Creating Claude LLM instance');
        return new ClaudeLLM(modelId || 'claude-3-7-sonnet-20250219', this.workspace);
      case LLMType.Gemini:
        log.info('Creating Gemini LLM instance');
        return new GeminiLLM(modelId || 'gemini-2.0-flash', this.workspace);
      case LLMType.Ollama:
        log.info('Creating Ollama LLM instance');
        return new OllamaLLM(modelId || 'llama3.2', this.workspace);
      case LLMType.OpenAI:
        log.info('Creating OpenAI LLM instance');
        return new OpenAILLM(modelId || 'gpt-3.5-turbo', this.workspace);
      case LLMType.Test:
        log.info('Creating Test LLM instance');
        return new TestLLM(this.workspace);
      default:
        throw new Error(`Unsupported model type: ${modelType}`);
    }
  }
}