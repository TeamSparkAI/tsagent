import { pipeline, env } from '@xenova/transformers';
import { Reference, Rule } from '@tsagent/core';
import type { Logger } from '@tsagent/core';
import os from 'node:os';
import path from 'node:path';

export type Scope = 'rules' | 'references' | 'tools';

interface IndexedChunk {
  scope: Scope;
  itemName: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
}

export interface SearchResult {
  scope: Scope;
  itemName: string;
  score: number;
  chunkText?: string;
}

/**
 * Semantic indexer for agent references using local embeddings
 */
export class SemanticIndexer {
  private chunks: IndexedChunk[] = [];
  private embeddingPipeline: any = null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Get the model cache directory path
   */
  private getCacheDirectory(): string {
    // Check if custom cache path is set
    if (env.localModelPath) {
      return env.localModelPath;
    }
    
    // Default cache location
    const homeDir = os.homedir();
    return path.join(homeDir, '.cache', 'transformers');
  }

  /**
   * Initialize the embedding model
   * 
   * The model is automatically downloaded from Hugging Face on first use
   * and cached locally (typically in ~/.cache/transformers on Unix/Mac,
   * or C:\Users\<Username>\.cache\transformers on Windows).
   * Subsequent runs will use the cached model.
   * 
   * Returns the time taken to initialize (in milliseconds)
   */
  private async initializeModel(): Promise<number> {
    if (this.embeddingPipeline) {
      return 0;
    }

    const initStartTime = Date.now();
    const cacheDir = this.getCacheDirectory();
    this.logger.info('Loading embedding model...');
    this.logger.info(`Cache directory: ${cacheDir}`);
    this.logger.info('Note: Model will be downloaded from Hugging Face on first use (~80MB)');
    // Use a lightweight, fast model for local embeddings
    // Xenova/all-MiniLM-L6-v2 is a good choice - small, fast, pure JS
    // The model is automatically downloaded and cached by @xenova/transformers
    this.embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { quantized: true } // Use quantized model for faster loading
    );
    this.logger.info('Embedding model loaded');
    return Date.now() - initStartTime;
  }

  /**
   * Chunk text into smaller pieces for better semantic matching
   */
  private chunkText(text: string, maxChunkSize: number = 500): string[] {
    const chunks: string[] = [];
    
    // Try to split by paragraphs first
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    for (const paragraph of paragraphs) {
      if (paragraph.length <= maxChunkSize) {
        chunks.push(paragraph.trim());
      } else {
        // Split long paragraphs by sentences
        const sentences = paragraph.split(/[.!?]+\s+/).filter(s => s.trim().length > 0);
        let currentChunk = '';
        
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length + 1 <= maxChunkSize) {
            currentChunk += (currentChunk ? ' ' : '') + sentence.trim();
          } else {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = sentence.trim();
          }
        }
        
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
      }
    }
    
    return chunks.length > 0 ? chunks : [text];
  }

  /**
   * Generate embedding for a text chunk
   * Returns the embedding and the model initialization time (if this was the first call)
   */
  private async generateEmbedding(text: string): Promise<{ embedding: number[]; initTimeMs: number }> {
    const initTimeMs = await this.initializeModel();
    
    if (!this.embeddingPipeline) {
      throw new Error('Embedding pipeline not initialized');
    }

    const output = await this.embeddingPipeline(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Convert tensor to array
    return {
      embedding: Array.from(output.data),
      initTimeMs
    };
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Index all rules, references, and tools from an agent
   * Returns indexing statistics
   */
  async indexAll(rules: Rule[], references: Reference[], tools: Array<{ name: string; description: string }>): Promise<{ items: number; chunks: number; modelInitMs: number; indexingMs: number; totalMs: number }> {
    const totalStartTime = Date.now();
    let modelInitMs = 0;
    let indexingStartTime: number | null = null;
    this.chunks = [];
    
    // Index rules (by name, description, and text content)
    for (const rule of rules) {
      if (!rule.enabled) {
        continue;
      }

      this.logger.info(`Indexing rule: ${rule.name}`);
      
      // Combine name: description, then text for indexing
      const header = rule.description ? `${rule.name}: ${rule.description}` : rule.name;
      const fullText = rule.text ? `${header}\n\n${rule.text}` : header;
      
      if (!fullText) {
        continue;
      }

      // Chunk the text appropriately
      const textChunks = this.chunkText(fullText);
      
      // Generate embeddings for each chunk
      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        
        try {
          const beforeCall = Date.now();
          const embeddingResult = await this.generateEmbedding(chunk);
          const afterCall = Date.now();
          
          // Track model initialization time (only on first call)
          if (modelInitMs === 0 && embeddingResult.initTimeMs > 0) {
            modelInitMs = embeddingResult.initTimeMs;
            // Indexing starts after model initialization completes
            indexingStartTime = beforeCall + embeddingResult.initTimeMs;
          } else if (indexingStartTime === null) {
            // Model already initialized, indexing starts now
            indexingStartTime = beforeCall;
          }
          
          this.chunks.push({
            scope: 'rules',
            itemName: rule.name,
            chunkIndex: i,
            text: chunk,
            embedding: embeddingResult.embedding,
          });
        } catch (error) {
          this.logger.error(`Failed to generate embedding for chunk ${i} of rule ${rule.name}:`, error);
        }
      }
    }

    // Index references (by name, description, and text content)
    for (const reference of references) {
      if (!reference.enabled) {
        continue;
      }

      this.logger.info(`Indexing reference: ${reference.name}`);
      
      // Combine name: description, then text for indexing
      const header = reference.description ? `${reference.name}: ${reference.description}` : reference.name;
      const fullText = reference.text ? `${header}\n\n${reference.text}` : header;
      
      if (!fullText) {
        continue;
      }

      // Chunk the text appropriately
      const textChunks = this.chunkText(fullText);
      
      // Generate embeddings for each chunk
      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        
        try {
          const embeddingResult = await this.generateEmbedding(chunk);
          this.chunks.push({
            scope: 'references',
            itemName: reference.name,
            chunkIndex: i,
            text: chunk,
            embedding: embeddingResult.embedding,
          });
        } catch (error) {
          this.logger.error(`Failed to generate embedding for chunk ${i} of reference ${reference.name}:`, error);
        }
      }
    }

    // Index tools (by name and description)
    for (const tool of tools) {
      this.logger.info(`Indexing tool: ${tool.name}`);
      
      const text = tool.description ? `${tool.name}: ${tool.description}` : tool.name;
      if (!text) {
        continue;
      }

      try {
        const embeddingResult = await this.generateEmbedding(text);
        this.chunks.push({
          scope: 'tools',
          itemName: tool.name,
          chunkIndex: 0,
          text: text,
          embedding: embeddingResult.embedding,
        });
      } catch (error) {
        this.logger.error(`Failed to generate embedding for tool ${tool.name}:`, error);
      }
    }

    const totalEndTime = Date.now();
    const totalMs = totalEndTime - totalStartTime;
    const indexingMs = indexingStartTime ? totalEndTime - indexingStartTime : 0;
    const totalItems = rules.length + references.length + tools.length;
    this.logger.info(`Indexed ${this.chunks.length} item(s) from ${totalItems} total (${rules.length} rules, ${references.length} references, ${tools.length} tools)`);
    
    return {
      items: totalItems,
      chunks: this.chunks.length,
      modelInitMs,
      indexingMs,
      totalMs
    };
  }

  /**
   * Search for most relevant items (rules, references, or tools)
   * Returns results and inference time
   */
  async search(query: string, topK: number = 5, scope?: Scope | 'all'): Promise<{ results: SearchResult[]; elapsedMs: number }> {
    const startTime = Date.now();
    
    if (this.chunks.length === 0) {
      return { results: [], elapsedMs: 0 };
    }

    // Generate embedding for query
    const queryEmbeddingResult = await this.generateEmbedding(query);
    const queryEmbedding = queryEmbeddingResult.embedding;

    // Calculate similarity scores for all chunks, optionally filtered by scope
    const filteredChunks = scope && scope !== 'all'
      ? this.chunks.filter(chunk => chunk.scope === scope)
      : this.chunks;

    const scores = filteredChunks.map(chunk => ({
      scope: chunk.scope,
      itemName: chunk.itemName,
      score: this.cosineSimilarity(queryEmbedding, chunk.embedding),
      chunkText: chunk.text,
    }));

    // Sort by score (descending) and get top K
    const topResults = scores
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter(result => result.score > 0); // Only return positive similarity

    // Group by scope and item name, keep best score per item
    const itemMap = new Map<string, SearchResult>();
    
    for (const result of topResults) {
      const key = `${result.scope}:${result.itemName}`;
      const existing = itemMap.get(key);
      if (!existing || result.score > existing.score) {
        itemMap.set(key, {
          scope: result.scope,
          itemName: result.itemName,
          score: result.score,
          chunkText: result.chunkText,
        });
      }
    }

    const elapsedMs = Date.now() - startTime;
    
    // Return sorted by score
    return {
      results: Array.from(itemMap.values())
        .sort((a, b) => b.score - a.score),
      elapsedMs
    };
  }
}

