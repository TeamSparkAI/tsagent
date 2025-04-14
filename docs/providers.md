## Model metadata

API provider is top level (Anthropic Claude, OpenAI, Google Gemini, Amazon Bedrock, Ollama)

Common fields
  ModelId (what we use to select model internally)
  ModelName (what we show in the UX)
  Provider Name
  - For Bedrock we might want to select by this?
  - For OpenAI, Claude, Gemini, provider is implied
  - Ollama we could use details.family?

## Model metadata from provider APIs

Bedrock
    modelId: 'mistral.pixtral-large-2502-v1:0',
    modelName: 'Pixtral Large (25.02)',
    outputModalities: [ 'TEXT' ], // some add 'IMAGE', 'VIDEO'
    providerName: 'Mistral AI',
    modelLifecycle: { status: 'LEGACY' }, // or 'ACTIVE'
    
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

Gemini (no API currently, but it is imminent)
    ???

## Model config

What does each provider (model) support?

API method to get/set?