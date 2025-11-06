/**
 * Context Tracking Types
 * 
 * These types support tracking how context items (rules, references, and tools)
 * enter sessions and are selected for each request, enabling transparency and debugging.
 */

/**
 * Base discriminated union for type-safe context items
 * Ensures type safety by requiring serverName for tools
 */
export type ContextItemBase = 
  | { type: 'rule'; name: string }
  | { type: 'reference'; name: string }
  | { type: 'tool'; name: string; serverName: string };

/**
 * Session context item - base + session include modes only
 * Items in session context are either 'always' (auto-added) or 'manual' (user-added)
 */
export type SessionContextItem = ContextItemBase & {
  includeMode: 'always' | 'manual';
};

/**
 * Request context item - extends base with all include modes + optional score
 * Items in request context can be 'always', 'manual', or 'agent' (semantically selected)
 */
export type RequestContextItem = ContextItemBase & {
  includeMode: 'always' | 'manual' | 'agent';
  similarityScore?: number;  // Optional, typically present when includeMode is 'agent'
};

/**
 * Request context - represents the context items actually used for a specific request/response pair
 * Built fresh for each request by combining session context + agent-selected items
 */
export interface RequestContext {
  items: RequestContextItem[];  // All items used for this request (session + agent items)
}

