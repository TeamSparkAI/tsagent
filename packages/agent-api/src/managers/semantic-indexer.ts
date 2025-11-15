import { pipeline, env } from '@xenova/transformers';
import { Rule } from '../types/rules.js';
import { Reference } from '../types/references.js';
import { SessionContextItem, RequestContextItem } from '../types/context.js';
import type { Agent } from '../types/agent.js';
import type { Logger } from '../types/common.js';
import { McpClient } from '../mcp/types.js';
import os from 'node:os';
import path from 'node:path';

/**
 * Indexed chunk with embedding
 * Used for storing embeddings on rules/references
 */
export interface IndexedChunk {
  text: string;
  embedding: number[];
  chunkIndex: number;
}


/**
 * Semantic indexer for agent rules, references, and tools using local embeddings
 * Supports JIT (Just-In-Time) indexing - embeddings generated on-demand
 * Works with context items as the primary abstraction
 */
export class SemanticIndexer {
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
    
    // Set cache directory (WASM config is set at module load time)
    env.localModelPath = cacheDir;
    
    // Use a lightweight, fast model for local embeddings
    // Xenova/all-MiniLM-L6-v2 is a good choice - small, fast, pure JS
    // The model is automatically downloaded and cached by @xenova/transformers
    try {
      this.embeddingPipeline = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        { quantized: true } // Use quantized model for faster loading
      );
      this.logger.info('Embedding model loaded');
    } catch (error) {
      this.logger.error('Failed to load embedding model:', error);
      throw error;
    }
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
   * 
   * NOTE: This function assumes vectors are already normalized (unit length = 1).
   * Embeddings from @xenova/transformers pipeline are generated with `normalize: true`,
   * so we can use dot product directly without computing norms.
   * 
   * For normalized vectors:
   * - normA = normB = 1
   * - cosine similarity = dotProduct / (normA * normB) = dotProduct / 1 = dotProduct
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    // Compute dot product
    //
    // NOTE: Since vectors are normalized (from pipeline with normalize: true), cosine similarity = dot product (no need to compute norms or divide)
    // 
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }

    return dotProduct;
  }

  /**
   * Index a single rule (JIT - generates embeddings if missing)
   * Stores embeddings on the rule object in place
   * @returns true if embeddings were generated, false if already indexed or disabled
   */
  private async indexRule(rule: Rule): Promise<boolean> {
    if (rule.embeddings) {
      // Already indexed, nothing to do
      return false;
    }

    this.logger.debug(`Indexing rule: ${rule.name}`);
    
    // Combine name: description, then text for indexing
    const header = rule.description ? `${rule.name}: ${rule.description}` : rule.name;
    const fullText = rule.text ? `${header}\n\n${rule.text}` : header;
    
    if (!fullText) {
      return false;
    }

    // Chunk the text appropriately
    const textChunks = this.chunkText(fullText);
    const indexedChunks: IndexedChunk[] = [];
    
    // Generate embeddings for each chunk
    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      
      try {
        const embeddingResult = await this.generateEmbedding(chunk);
        indexedChunks.push({
          text: chunk,
          embedding: embeddingResult.embedding,
          chunkIndex: i,
        });
      } catch (error) {
        this.logger.error(`Failed to generate embedding for chunk ${i} of rule ${rule.name}:`, error);
      }
    }

    // Store embeddings on the rule
    rule.embeddings = indexedChunks;
    return true;
  }

  /**
   * Index a single reference (JIT - generates embeddings if missing)
   * Stores embeddings on the reference object in place
   * @returns true if embeddings were generated, false if already indexed
   */
  private async indexReference(reference: Reference): Promise<boolean> {
    if (reference.embeddings) {
      // Already indexed, nothing to do
      return false;
    }

    this.logger.debug(`Indexing reference: ${reference.name}`);
    
    // Combine name: description, then text for indexing
    const header = reference.description ? `${reference.name}: ${reference.description}` : reference.name;
    const fullText = reference.text ? `${header}\n\n${reference.text}` : header;
    
    if (!fullText) {
      return false;
    }

    // Chunk the text appropriately
    const textChunks = this.chunkText(fullText);
    const indexedChunks: IndexedChunk[] = [];
    
    // Generate embeddings for each chunk
    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      
      try {
        const embeddingResult = await this.generateEmbedding(chunk);
        indexedChunks.push({
          text: chunk,
          embedding: embeddingResult.embedding,
          chunkIndex: i,
        });
      } catch (error) {
        this.logger.error(`Failed to generate embedding for chunk ${i} of reference ${reference.name}:`, error);
      }
    }

    // Store embeddings on the reference
    reference.embeddings = indexedChunks;
    return true;
  }

  /**
   * Index a single tool (JIT - generates embeddings if missing)
   * Stores embeddings on the client's toolEmbeddings map in place
   * @returns true if embeddings were generated, false if already indexed or failed
   */
  private async indexTool(tool: { name: string; description?: string }, client: McpClient): Promise<boolean> {
    // Ensure embeddings map exists
    if (!client.toolEmbeddings) {
      client.toolEmbeddings = new Map();
    }

    // Check if already indexed
    if (client.toolEmbeddings.has(tool.name)) {
      return false;
    }

    this.logger.debug(`Indexing tool: ${tool.name}`);
    
    const text = tool.description ? `${tool.name}: ${tool.description}` : tool.name;
    if (!text) {
      return false;
    }

    try {
      const embeddingResult = await this.generateEmbedding(text);
      const indexedChunk: IndexedChunk = {
        text: text,
        embedding: embeddingResult.embedding,
        chunkIndex: 0,
      };
      
      // Store embeddings on the client
      client.toolEmbeddings.set(tool.name, [indexedChunk]);
      return true;
    } catch (error) {
      this.logger.error(`Failed to generate embedding for tool ${tool.name}:`, error);
      return false;
    }
  }

  /**
   * Index context items (JIT - generates embeddings if missing)
   * Works with SessionContextItem[] and accesses underlying Rule/Reference/Tool objects via agent
   * Note: Requires embeddings fields on items/clients (added in Phases 5b/5c)
   */
  async indexContextItems(items: SessionContextItem[], agent: Agent): Promise<void> {
    const toIndex: SessionContextItem[] = [];

    // Collect items that need indexing
    for (const item of items) {
      if (item.type === 'rule') {
        const rule = agent.getRule(item.name);
        if (rule && !rule.embeddings) {
          toIndex.push(item);
        }
      } else if (item.type === 'reference') {
        const reference = agent.getReference(item.name);
        if (reference && !reference.embeddings) {
          toIndex.push(item);
        }
      } else if (item.type === 'tool') {
        // For tools, we need to check the client's toolEmbeddings map
        const clients = agent.getAllMcpClientsSync();
        const client = clients[item.serverName];
        if (client) {
          if (!client.toolEmbeddings || !client.toolEmbeddings.has(item.name)) {
            toIndex.push(item);
          }
        }
      }
    }

    if (toIndex.length === 0) {
      return;
    }

    this.logger.debug(`Indexing ${toIndex.length} context item(s)`);

    // Index items by type
    for (const item of toIndex) {
      try {
        if (item.type === 'rule') {
          const rule = agent.getRule(item.name);
          if (rule) {
            await this.indexRule(rule);
          }
        } else if (item.type === 'reference') {
          const reference = agent.getReference(item.name);
          if (reference) {
            await this.indexReference(reference);
          }
        } else if (item.type === 'tool') {
          const clients = agent.getAllMcpClientsSync();
          const client = clients[item.serverName];
          if (client) {
            // Find the tool in the client's serverTools
            const tool = client.serverTools?.find(t => t.name === item.name);
            if (tool) {
              await this.indexTool(tool, client);
            }
          }
        }
      } catch (error) {
        this.logger.error(`Failed to index ${item.type} ${item.name}:`, error);
      }
    }
  }

  /**
   * Search context items and return RequestContextItem[] with similarity scores
   * Works with SessionContextItem[] and accesses embeddings via agent
   * Handles JIT indexing internally - ensures all items are indexed before searching
   * Returns RequestContextItem[] with similarityScore attached
   * 
   * @param query - The search query string
   * @param items - The context items to search
   * @param agent - The agent to access rules/references/tools from
   * @param options - Search options
   * @param options.topK - Max embedding matches to consider (default: 20)
   * @param options.topN - Target number of results to return after grouping (default: 5)
   * @param options.includeScore - Always include items with this similarity score or higher, even if it exceeds topN (default: 0.7)
   */
  async searchContextItems(
    query: string,
    items: SessionContextItem[],
    agent: Agent,
    options: {
      topK?: number;  // Max embedding matches to consider
      topN?: number;  // Target number of results to return (after grouping)
      includeScore?: number;  // Always include items with this score or higher (can exceed topN)
    } = {}
  ): Promise<RequestContextItem[]> {
    const topK = options.topK ?? 20;  // Default: consider top 20 chunk matches
    const topN = options.topN ?? 5;   // Default: return top 5 items
    const includeScore = options.includeScore ?? 0.7;  // Default: always include items with score >= 0.7
    const startTime = Date.now();
    
    // Step 1: Ensure all items are indexed (JIT indexing)
    await this.indexContextItems(items, agent);
    
    // Step 2: Collect all chunks from items with their context item metadata
    const allChunks: Array<{
      item: SessionContextItem;
      chunkIndex: number;
      text: string;
      embedding: number[];
    }> = [];

    const clients = agent.getAllMcpClientsSync();

    // Collect chunks from rules
    for (const item of items) {
      if (item.type === 'rule') {
        const rule = agent.getRule(item.name);
        if (rule && rule.embeddings) {
          for (const chunk of rule.embeddings) {
            allChunks.push({
              item,
              chunkIndex: chunk.chunkIndex,
              text: chunk.text,
              embedding: chunk.embedding,
            });
          }
        }
      } else if (item.type === 'reference') {
        const reference = agent.getReference(item.name);
        if (reference && reference.embeddings) {
          for (const chunk of reference.embeddings) {
            allChunks.push({
              item,
              chunkIndex: chunk.chunkIndex,
              text: chunk.text,
              embedding: chunk.embedding,
            });
          }
        }
      } else if (item.type === 'tool') {
        const client = clients[item.serverName];
        if (client && client.toolEmbeddings) {
          const chunks = client.toolEmbeddings.get(item.name);
          if (chunks) {
            for (const chunk of chunks) {
              allChunks.push({
                item,
                chunkIndex: chunk.chunkIndex,
                text: chunk.text,
                embedding: chunk.embedding,
              });
            }
          }
        }
      }
    }

    if (allChunks.length === 0) {
      return [];
    }

    // Generate embedding for query
    const queryEmbeddingResult = await this.generateEmbedding(query);
    const queryEmbedding = queryEmbeddingResult.embedding;

    // Calculate similarity scores for all chunks
    const scores = allChunks.map(chunk => ({
      item: chunk.item,
      score: this.cosineSimilarity(queryEmbedding, chunk.embedding),
      chunkText: chunk.text,
    }));

    // Sort by score (descending) and get top K chunk matches
    const topChunkMatches = scores
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter(result => result.score > 0); // Only return positive similarity

    // Group by item (using type + name + serverName for tools), keep best score per item
    const itemMap = new Map<string, { item: SessionContextItem; score: number }>();
    
    for (const result of topChunkMatches) {
      // Create a unique key for each context item
      let key: string;
      if (result.item.type === 'tool') {
        key = `${result.item.type}:${result.item.serverName}:${result.item.name}`;
      } else {
        key = `${result.item.type}:${result.item.name}`;
      }
      
      const existing = itemMap.get(key);
      if (!existing || result.score > existing.score) {
        itemMap.set(key, {
          item: result.item,
          score: result.score,
        });
      }
    }

    // Convert to RequestContextItem[] with similarityScore
    const allResults: RequestContextItem[] = Array.from(itemMap.values())
      .sort((a, b) => b.score - a.score)
      .map(({ item, score }) => ({
        ...item,
        includeMode: 'agent' as const,
        similarityScore: score,
      }));

    // Apply includeScore threshold: always include items with score >= includeScore
    const highScoreResults = allResults.filter(result => (result.similarityScore ?? 0) >= includeScore);
    const otherResults = allResults.filter(result => (result.similarityScore ?? 0) < includeScore);

    // Combine: high-score items first, then top N remaining items
    const finalResults: RequestContextItem[] = [
      ...highScoreResults,
      ...otherResults.slice(0, Math.max(0, topN - highScoreResults.length))
    ];

    const elapsedMs = Date.now() - startTime;
    this.logger.debug(`Semantic search completed in ${elapsedMs}ms, found ${finalResults.length} result(s) (${highScoreResults.length} above threshold ${includeScore})`);
    
    return finalResults;
  }
}
