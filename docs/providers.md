## Providers

## Model metadata from provider APIs

Bedrock
    modelId: 'mistral.pixtral-large-2502-v1:0',
    modelName: 'Pixtral Large (25.02)',
    outputModalities: [ 'TEXT' ], // some add 'IMAGE', 'VIDEO'
    providerName: 'Mistral AI',
    modelLifecycle: { status: 'ACTIVE' }, // or 'LEGACY'
    inferenceTypesSupported: [ 'ON_DEMAND' ], // and/or 'PROVISIONED', 'INFERENCE_PROFILE'
    
Ollama
    name: 'llama3.2:latest',
    model: 'llama3.2:latest',
    modified_at: '2025-04-09T14:45:37.566736658-07:00',
    size: 2019393189,
    digest: 'a80c4f17acd55265feec403c7aef86be0c25983ab279d83f3bcd3abbcb5b8b72',
    details: {
      parent_model: '',
      format: 'gguf',
      family: 'llama',
      families: [Array],
      parameter_size: '3.2B',
      quantization_level: 'Q4_K_M'
    }

Open AI
    id: 'gpt-4-turbo-2024-04-09',
    object: 'model',
    created: 1712601677,
    owned_by: 'system' // sometimes 'openai' or 'openai-internal'

Claude
    type: 'model',
    id: 'claude-3-opus-20240229',
    display_name: 'Claude 3 Opus',
    created_at: '2024-02-29T00:00:00Z'

Gemini (no API currently - model data is hardcoded)
- Issue for exposing API: https://github.com/googleapis/js-genai/issues/473