import { z } from 'zod';
import type { IndexedChunk } from '../managers/semantic-indexer.js';

/**
 * Reference schema - single source of truth.
 * 
 * Structure:
 * - name: string (required)
 * - description: string (required)
 * - priorityLevel: number (0-999, integer, required)
 * - text: string (required)
 * - include: 'always' | 'manual' | 'agent' (required, defaults to 'manual' if not provided)
 * - embeddings?: IndexedChunk[] (optional)
 */
export const ReferenceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  priorityLevel: z.number().int().min(0, "Priority level must be between 0 and 999").max(999, "Priority level must be between 0 and 999"),
  text: z.string().min(1, "Text is required"),
  include: z.enum(['always', 'manual', 'agent']).default('manual'),
  embeddings: z.array(z.any()).optional(), // IndexedChunk would need its own schema if we want full validation
});

// Type inferred from schema (single source of truth)
export type Reference = z.infer<typeof ReferenceSchema>;
