import type { IndexedChunk } from '../managers/semantic-indexer.js';

// Rule interface
export interface Rule {
  name: string;
  description: string;
  priorityLevel: number;
  text: string;
  include: 'always' | 'manual' | 'agent';
  embeddings?: IndexedChunk[];  // Semantic embeddings for JIT indexing (Phase 5a)
}