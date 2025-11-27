import { z } from 'zod';

/**
 * Rule schema - single source of truth.
 * 
 * Structure:
 * - name: string (required)
 * - description: string (required)
 * - priorityLevel: number (0-999, integer, required)
 * - text: string (required)
 * - include: 'always' | 'manual' | 'agent' (required, defaults to 'manual' if not provided)
 * - embeddings?: number[][] (optional) - Array of embedding vectors, each vector is an array of numbers
 */
export const RuleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  priorityLevel: z.number().int().min(0, "Priority level must be between 0 and 999").max(999, "Priority level must be between 0 and 999"),
  text: z.string().min(1, "Text is required"),
  include: z.enum(['always', 'manual', 'agent']).default('manual'),
  embeddings: z.array(z.array(z.number())).optional(), // Array of embedding vectors (number arrays)
});

// Type inferred from schema (single source of truth)
export type Rule = z.infer<typeof RuleSchema>;