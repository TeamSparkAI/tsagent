import { ProviderType, parseModelString } from '@tsagent/core';

export interface AgentModelDetails {
  provider: ProviderType;
  modelId: string;
  modelName: string;
}

// Application-level cache for agent's default model
let cachedAgentModel: AgentModelDetails | null = null;
let cachedModelString: string | null = null;

/**
 * Set cached agent model details (called when we have details, e.g., from picker)
 */
export function setCachedAgentModel(modelString: string, details: AgentModelDetails): void {
  cachedModelString = modelString;
  cachedAgentModel = details;
}

/**
 * Get cached agent model details (synchronous, returns null if not cached or model changed)
 */
export function getCachedAgentModel(modelString: string | undefined): AgentModelDetails | null {
  if (!modelString) {
    return null;
  }
  // Cache is valid only if model string matches
  if (modelString === cachedModelString && cachedAgentModel) {
    return cachedAgentModel;
  }
  return null;
}

/**
 * Get agent model details with async fallback
 * Checks cache first, fetches if needed, then caches the result
 */
export async function getAgentModelDetails(
  modelString: string | undefined,
  fetchFn: (provider: ProviderType) => Promise<any[]>
): Promise<AgentModelDetails | null> {
  if (!modelString) {
    return null;
  }

  // Check cache first
  const cached = getCachedAgentModel(modelString);
  if (cached) {
    return cached;
  }

  // Cache miss: fetch and cache
  const parsed = parseModelString(modelString);
  if (!parsed) {
    return null;
  }

  try {
    const models = await fetchFn(parsed.provider);
    const foundModel = models.find(m => m.id === parsed.modelId);
    if (foundModel) {
      const details: AgentModelDetails = {
        provider: parsed.provider,
        modelId: parsed.modelId,
        modelName: foundModel.name
      };
      setCachedAgentModel(modelString, details);
      return details;
    }
  } catch (error) {
    console.error('Error fetching agent model details:', error);
  }

  return null;
}

