import { pipeline, env } from '@xenova/transformers';
import { Rule } from '../types/rules.js';
import { Reference } from '../types/references.js';
import { SessionContextItem, RequestContextItem } from '../types/context.js';
import type { Agent } from '../types/agent.js';
import type { Logger } from '../types/common.js';
import { McpClient } from '../mcp/types.js';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Compute SHA-256 hash of text chunk (used for embedding validation)
 * @param text The text to hash
 * @returns Hexadecimal hash string
 */
export function computeTextHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
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
   * Chunk query text into smaller pieces for better semantic matching
   * Splits by sentences and truncates any sentence longer than maxChunkSize
   */
  private chunkQueryText(text: string, maxChunkSize: number = 500): string[] {
    // Split by sentences - one chunk per sentence
    const sentences = text.split(/[.!?]+\s+/).filter(s => s.trim().length > 0);
    
    return sentences.map(sentence => {
      const trimmed = sentence.trim();
      // Truncate if longer than maxChunkSize
      return trimmed.length > maxChunkSize ? trimmed.substring(0, maxChunkSize) : trimmed;
    }).filter(s => s.length > 0);
  }

  /**
   * Chunk context item text into smaller pieces for better semantic matching
   * Splits by paragraphs and sentences, truncates any paragraph or sentence longer than maxChunkSize
   */
  private chunkContextItemText(text: string, maxChunkSize: number = 500): string[] {
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
    const textChunks = this.chunkContextItemText(fullText);
    const embeddings: number[][] = [];
    
    // Generate embeddings for each chunk
    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      
      try {
        const embeddingResult = await this.generateEmbedding(chunk);
        embeddings.push(embeddingResult.embedding);
      } catch (error) {
        this.logger.error(`Failed to generate embedding for chunk ${i} of rule ${rule.name}:`, error);
      }
    }

    // Store embeddings on the rule (just the vectors, no text/chunkIndex)
    rule.embeddings = embeddings;
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
    const textChunks = this.chunkContextItemText(fullText);
    const embeddings: number[][] = [];
    
    // Generate embeddings for each chunk
    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      
      try {
        const embeddingResult = await this.generateEmbedding(chunk);
        embeddings.push(embeddingResult.embedding);
      } catch (error) {
        this.logger.error(`Failed to generate embedding for chunk ${i} of reference ${reference.name}:`, error);
      }
    }

    // Store embeddings on the reference (just the vectors, no text/chunkIndex)
    reference.embeddings = embeddings;
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
      const hash = computeTextHash(text);
      
      // Store embeddings and hash on the client (number[][] format, matching rules/references)
      client.toolEmbeddings.set(tool.name, {
        embeddings: [embeddingResult.embedding],
        hash: hash
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to generate embedding for tool ${tool.name}:`, error);
      return false;
    }
  }

  /**
   * Check which items need indexing (without loading the model)
   * Returns array of items that need indexing
   */
  private checkItemsNeedingIndex(items: SessionContextItem[], agent: Agent): SessionContextItem[] {
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

    return toIndex;
  }

  /**
   * Index context items (JIT - generates embeddings if missing)
   * Works with SessionContextItem[] and accesses underlying Rule/Reference/Tool objects via agent
   * Note: Requires embeddings fields on items/clients (added in Phases 5b/5c)
   * Only loads the model if items actually need indexing
   * 
   * @param items - Items to index (should already be filtered to only items needing index)
   * @param agent - Agent to access rules/references/tools from
   */
  async indexContextItems(items: SessionContextItem[], agent: Agent): Promise<void> {
    if (items.length === 0) {
      return;
    }

    this.logger.debug(`Indexing ${items.length} context item(s)`);

    // Track which tools were indexed (for persisting to config)
    const indexedTools: Array<{ serverName: string; toolName: string }> = [];

    // Index items by type
    for (const item of items) {
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
              const wasIndexed = await this.indexTool(tool, client);
              if (wasIndexed) {
                indexedTools.push({ serverName: item.serverName, toolName: item.name });
              }
            }
          }
        }
      } catch (error) {
        this.logger.error(`Failed to index ${item.type} ${item.name}:`, error);
      }
    }

    // Persist tool embeddings to config after batch indexing
    if (indexedTools.length > 0) {
      const clients = agent.getAllMcpClientsSync();
      const serversToUpdate = new Map<string, Set<string>>(); // serverName -> Set of toolNames

      // Collect tools by server
      for (const { serverName, toolName } of indexedTools) {
        if (!serversToUpdate.has(serverName)) {
          serversToUpdate.set(serverName, new Set());
        }
        serversToUpdate.get(serverName)!.add(toolName);
      }

      // Update each server config
      for (const [serverName, toolNames] of serversToUpdate) {
        try {
          const serverConfig = await agent.getMcpServer(serverName);
          if (!serverConfig) {
            this.logger.warn(`Server ${serverName} not found, skipping tool embeddings persistence`);
            continue;
          }

          const client = clients[serverName];
          if (!client || !client.toolEmbeddings) {
            continue;
          }

          // Initialize toolEmbeddings in config if needed
          if (!serverConfig.config.toolEmbeddings) {
            serverConfig.config.toolEmbeddings = { tools: {} };
          }
          if (!serverConfig.config.toolEmbeddings.tools) {
            serverConfig.config.toolEmbeddings.tools = {};
          }

          // Update each tool's embeddings in config
          for (const toolName of toolNames) {
            const embeddingData = client.toolEmbeddings.get(toolName);
            if (embeddingData) {
              serverConfig.config.toolEmbeddings.tools![toolName] = {
                embeddings: embeddingData.embeddings,
                hash: embeddingData.hash
              };
            }
          }

          // Save the updated server config
          await agent.saveMcpServer(serverConfig);
        } catch (error) {
          this.logger.error(`Failed to persist tool embeddings for server ${serverName}:`, error);
        }
      }
    }

    // Save agent config after batch indexing to persist embeddings
    // This ensures all embeddings generated in this batch are saved in a single operation
    await agent.save();
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
    
    // Step 1: Check if any items need indexing (before loading model)
    const itemsNeedingIndex = this.checkItemsNeedingIndex(items, agent);
    
    // Step 2: Only index if items actually need indexing (JIT - loads model only when needed)
    if (itemsNeedingIndex.length > 0) {
      await this.indexContextItems(itemsNeedingIndex, agent);
    }
    
    // Step 3: Collect all chunks from items with their context item metadata
    const allContextItemChunks: Array<{
      item: SessionContextItem;
      chunkIndex: number;
      embedding: number[];
    }> = [];

    const clients = agent.getAllMcpClientsSync();

    // Collect chunks from rules
    for (const item of items) {
      if (item.type === 'rule') {
        const rule = agent.getRule(item.name);
        if (rule && rule.embeddings && rule.embeddings.length > 0) {
          rule.embeddings.forEach((embedding, chunkIndex) => {
            allContextItemChunks.push({
              item,
              chunkIndex,
              embedding,
            });
          });
        }
      } else if (item.type === 'reference') {
        const reference = agent.getReference(item.name);
        if (reference && reference.embeddings && reference.embeddings.length > 0) {
          reference.embeddings.forEach((embedding, chunkIndex) => {
            allContextItemChunks.push({
              item,
              chunkIndex,
              embedding,
            });
          });
        }
      } else if (item.type === 'tool') {
        const client = clients[item.serverName];
        if (client && client.toolEmbeddings) {
          const embeddingData = client.toolEmbeddings.get(item.name);
          if (embeddingData && embeddingData.embeddings && embeddingData.embeddings.length > 0) {
            embeddingData.embeddings.forEach((embedding, chunkIndex) => {
              allContextItemChunks.push({
                item,
                chunkIndex,
                embedding,
              });
            });
          }
        }
      }
    }

    // Early return if no chunks available (no model needed for query embeddings)
    if (allContextItemChunks.length === 0) {
      return [];
    }
    
    // Step 4: Generate query embeddings (only if we have context chunks to search)
    // Chunk the query and generate embeddings for all chunks in parallel
    const queryChunks = this.chunkQueryText(query);
    const allQueryChunks = await Promise.all(
      queryChunks.map(async (chunk, index) => {
        const embeddingResult = await this.generateEmbedding(chunk);
        return {
          chunkIndex: index,
          text: chunk,
          embedding: embeddingResult.embedding,
        };
      })
    );

    // Build M×N scores matrix: M rows (query chunks) × N columns (context item chunks)
    // Each cell: { contextItemIndex: number, score: number }
    const scoresMatrix: Array<Array<{ contextItemIndex: number; score: number }>> = [];
    
    for (const queryChunk of allQueryChunks) {
      const row: Array<{ contextItemIndex: number; score: number }> = [];
      for (let contextItemIndex = 0; contextItemIndex < allContextItemChunks.length; contextItemIndex++) {
        const contextChunk = allContextItemChunks[contextItemIndex];
        const score = this.cosineSimilarity(queryChunk.embedding, contextChunk.embedding);
        row.push({ contextItemIndex, score });
      }
      scoresMatrix.push(row);
    }

    // If only one row, use it as scores; otherwise compute max per column
    let scores: Array<{ contextItemIndex: number; score: number }>;
    if (scoresMatrix.length === 1) {
      scores = scoresMatrix[0];
    } else {
      // Compute max score for each column (context item chunk)
      scores = [];
      for (let contextItemIndex = 0; contextItemIndex < allContextItemChunks.length; contextItemIndex++) {
        const columnScores = scoresMatrix.map(row => row[contextItemIndex].score);
        const maxScore = Math.max(...columnScores);
        scores.push({ contextItemIndex, score: maxScore });
      }
    }

    // Sort by score (descending) and get top K chunk matches
    const topChunkMatches = scores
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter(result => result.score > 0); // Only return positive similarity

    // Group by item (using type + name + serverName for tools), keep best score per item
    const itemMap = new Map<string, { item: SessionContextItem; score: number }>();
    
    for (const result of topChunkMatches) {
      // Look up context chunk using contextItemIndex
      const contextChunk = allContextItemChunks[result.contextItemIndex];
      const item = contextChunk.item;
      
      // Create a unique key for each context item
      let key: string;
      if (item.type === 'tool') {
        key = `${item.type}:${item.serverName}:${item.name}`;
      } else {
        key = `${item.type}:${item.name}`;
      }
      
      const existing = itemMap.get(key);
      if (!existing || result.score > existing.score) {
        itemMap.set(key, {
          item: item,
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
