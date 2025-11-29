import { ProviderType } from '@tsagent/core';
import TestLogo from '../assets/frosty.png';
import OllamaLogo from '../assets/ollama.png';
import OpenAILogo from '../assets/openai.png';
import GeminiLogo from '../assets/gemini.png';
import AnthropicLogo from '../assets/anthropic.png';
import BedrockLogo from '../assets/bedrock.png';
import LocalLogo from '../assets/local.png';
import DockerLogo from '../assets/docker.png';

export const providerLogos: Record<ProviderType, string> = {
  [ProviderType.Test]: TestLogo,
  [ProviderType.Ollama]: OllamaLogo,
  [ProviderType.OpenAI]: OpenAILogo,
  [ProviderType.Gemini]: GeminiLogo,
  [ProviderType.Claude]: AnthropicLogo,
  [ProviderType.Bedrock]: BedrockLogo,
  [ProviderType.Local]: LocalLogo,
  [ProviderType.Docker]: DockerLogo,
};

