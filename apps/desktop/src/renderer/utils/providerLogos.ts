import { ProviderId } from '@tsagent/core';

// Cache for provider icons
const iconCache: Map<ProviderId, string | null> = new Map();

/**
 * Get provider icon URL from agent-api
 * Returns cached value if available, otherwise fetches from API
 */
export async function getProviderIcon(providerType: ProviderId): Promise<string | null> {
  // Check cache first
  if (iconCache.has(providerType)) {
    return iconCache.get(providerType) || null;
  }

  try {
    const iconUrl = await window.api.getProviderIcon(providerType);
    iconCache.set(providerType, iconUrl);
    return iconUrl;
  } catch (error) {
    console.error(`Failed to get icon for provider ${providerType}:`, error);
    iconCache.set(providerType, null);
    return null;
  }
}

/**
 * Get provider icon synchronously from cache
 * Returns null if not yet cached (use getProviderIcon for async loading)
 */
export function getProviderIconSync(providerType: ProviderId): string | null {
  return iconCache.get(providerType) || null;
}

