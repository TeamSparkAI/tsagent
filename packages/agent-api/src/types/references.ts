import type { IndexedChunk } from '../managers/semantic-indexer.js';

// Reference interface
export interface Reference {
  name: string;
  description: string;
  priorityLevel: number;
  text: string;
  include: 'always' | 'manual' | 'agent';
  embeddings?: IndexedChunk[];  // Semantic embeddings for JIT indexing (Phase 5a)
}
