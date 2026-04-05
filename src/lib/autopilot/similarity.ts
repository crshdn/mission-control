import { logger } from '@/lib/logger';
/**
 * Idea Similarity Detection & Deduplication
 *
 * Computes lightweight text embeddings using feature hashing (the "hashing trick")
 * and cosine similarity to detect duplicate/similar ideas before they reach the
 * swipe deck. No external API calls or vector DB needed — works in pure JS for
 * <10K ideas per product.
 *
 * Thresholds:
 *  - >0.90 similarity to a rejected idea → auto-suppress (don't insert)
 *  - >0.75 similarity to any existing idea → flag with badge in SwipeDeck
 */

import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';

// --- Constants ---

/** Embedding vector dimensionality (feature hashing buckets) */
const EMBEDDING_DIM = 256;

/** Above this similarity to a rejected idea, auto-suppress the new idea */
const AUTO_SUPPRESS_THRESHOLD = 0.90;

/** Above this similarity to any idea, flag it with a visual badge */
const FLAG_SIMILARITY_THRESHOLD = 0.75;

/** Common English stop words — removed before embedding to improve signal */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'as', 'be', 'was', 'are',
  'this', 'that', 'the', 'will', 'can', 'has', 'have', 'had', 'been',
  'would', 'could', 'should', 'may', 'might', 'do', 'does', 'did',
  'not', 'no', 'so', 'if', 'its', 'than', 'into', 'also', 'just',
  'more', 'some', 'such', 'very', 'about', 'up', 'out', 'all', 'any',
  'each', 'how', 'which', 'when', 'what', 'where', 'who', 'them',
  'then', 'there', 'these', 'those', 'other', 'new', 'both', 'after',
  'before', 'between', 'over', 'under', 'through', 'during', 'only',
  'most', 'same', 'own', 'our', 'your', 'their', 'we', 'they', 'you',
  'he', 'she', 'me', 'my', 'his', 'her',
]);

// --- Core Embedding ---

/**
 * Hash a single word to a bucket index in [0, EMBEDDING_DIM).
 * Uses FNV-1a-inspired hash for decent distribution.
 */
function hashWord(word: string): number {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < word.length; i++) {
    hash ^= word.charCodeAt(i);
    hash = (hash * 16777619) | 0; // FNV prime, keep as 32-bit int
  }
  return Math.abs(hash) % EMBEDDING_DIM;
}

/**
 * Tokenize and normalize text for embedding.
 * Lowercase, strip punctuation, remove stop words, split on whitespace.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Compute a fixed-size embedding vector for a text string.
 * Uses feature hashing: each word maps to a bucket via hash, incrementing that dimension.
 * The vector is then L2-normalized for cosine similarity.
 *
 * Also includes bigrams to capture phrase-level patterns
 * (e.g., "dark mode" vs "dark" + "mode" separately).
 */
export function computeEmbedding(text: string): number[] {
  const tokens = tokenize(text);
  const vec = new Float64Array(EMBEDDING_DIM);

  // Unigrams (weight 1.0)
  for (const token of tokens) {
    vec[hashWord(token)] += 1.0;
  }

  // Bigrams (weight 0.5 — captures phrases without dominating)
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = tokens[i] + '_' + tokens[i + 1];
    vec[hashWord(bigram)] += 0.5;
  }

  // L2 normalize
  let magnitude = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    magnitude += vec[i] * vec[i];
  }
  magnitude = Math.sqrt(magnitude);

  if (magnitude > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      vec[i] /= magnitude;
    }
  }

  return Array.from(vec);
}

/**
 * Cosine similarity between two embedding vectors.
 * Vectors are already L2-normalized, so dot product = cosine similarity.
 * Returns a value in [-1, 1] where 1 = identical, 0 = orthogonal.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

// --- Database Operations ---

interface StoredEmbedding {
  id: string;
  idea_id: string;
  product_id: string;
  embedding: string; // JSON array
  text_hash: string;
}

interface IdeaWithStatus {
  id: string;
  title: string;
  status: string;
}

/**
 * Compute a simple hash of the text content for cache-busting.
 * If the text hasn't changed, we don't need to recompute the embedding.
 */
function textHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

/**
 * Store an embedding for an idea.
 */
export function storeEmbedding(ideaId: string, productId: string, title: string, description: string): void {
  const fullText = `${title} ${description}`;
  const hash = textHash(fullText);
  const embedding = computeEmbedding(fullText);

  // Upsert
  const existing = queryOne<{ id: string }>('SELECT id FROM idea_embeddings WHERE idea_id = ?', [ideaId]);

  if (existing) {
    run(
      'UPDATE idea_embeddings SET embedding = ?, text_hash = ?, updated_at = ? WHERE idea_id = ?',
      [JSON.stringify(embedding), hash, new Date().toISOString(), ideaId]
    );
  } else {
    run(
      'INSERT INTO idea_embeddings (id, idea_id, product_id, embedding, text_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), ideaId, productId, JSON.stringify(embedding), hash, new Date().toISOString(), new Date().toISOString()]
    );
  }
}

/**
 * Load all embeddings for a product. For <10K ideas this is fine in memory.
 */
function loadProductEmbeddings(productId: string): Array<{ ideaId: string; embedding: number[]; status: string; title: string }> {
  const rows = queryAll<StoredEmbedding & { idea_status: string; idea_title: string }>(
    `SELECT e.*, i.status as idea_status, i.title as idea_title
     FROM idea_embeddings e
     JOIN ideas i ON i.id = e.idea_id
     WHERE e.product_id = ?`,
    [productId]
  );

  return rows.map(row => ({
    ideaId: row.idea_id,
    embedding: JSON.parse(row.embedding) as number[],
    status: row.idea_status,
    title: row.idea_title,
  }));
}

// --- Similarity Detection ---

export interface SimilarityMatch {
  ideaId: string;
  title: string;
  status: string;
  similarity: number;
}

export interface SimilarityCheckResult {
  /** Should this idea be auto-suppressed (>0.9 similar to rejected)? */
  autoSuppress: boolean;
  /** Reason for suppression */
  suppressReason?: string;
  /** Similar ideas above the flag threshold */
  similarIdeas: SimilarityMatch[];
  /** The highest similarity score found */
  maxSimilarity: number;
  /** The similarity flag JSON to store on the idea (if flagged) */
  similarityFlag?: string;
}

/**
 * Check a candidate idea against all existing ideas for a product.
 * Returns dedup decision + similarity data.
 */
export function checkSimilarity(
  productId: string,
  title: string,
  description: string
): SimilarityCheckResult {
  const candidateEmbedding = computeEmbedding(`${title} ${description}`);
  const existingEmbeddings = loadProductEmbeddings(productId);

  const similarIdeas: SimilarityMatch[] = [];
  let maxSimilarity = 0;
  let autoSuppress = false;
  let suppressReason: string | undefined;

  for (const existing of existingEmbeddings) {
    const sim = cosineSimilarity(candidateEmbedding, existing.embedding);

    if (sim > maxSimilarity) {
      maxSimilarity = sim;
    }

    // Auto-suppress: >0.9 similar to a rejected idea
    if (sim >= AUTO_SUPPRESS_THRESHOLD && existing.status === 'rejected') {
      autoSuppress = true;
      suppressReason = `${Math.round(sim * 100)}% similar to rejected idea: "${existing.title}"`;
    }

    // Flag: >0.75 similar to any idea
    if (sim >= FLAG_SIMILARITY_THRESHOLD) {
      similarIdeas.push({
        ideaId: existing.ideaId,
        title: existing.title,
        status: existing.status,
        similarity: Math.round(sim * 100) / 100,
      });
    }
  }

  // Sort by similarity descending
  similarIdeas.sort((a, b) => b.similarity - a.similarity);

  // Build the flag JSON for storage
  let similarityFlag: string | undefined;
  if (similarIdeas.length > 0) {
    similarityFlag = JSON.stringify(
      similarIdeas.slice(0, 3).map(s => ({
        idea_id: s.ideaId,
        title: s.title,
        status: s.status,
        similarity: s.similarity,
      }))
    );
  }

  return {
    autoSuppress,
    suppressReason,
    similarIdeas,
    maxSimilarity: Math.round(maxSimilarity * 100) / 100,
    similarityFlag,
  };
}

/**
 * Batch check a list of candidate ideas against existing ideas.
 * Optimized: loads embeddings once, checks all candidates.
 * Returns parallel arrays of results + the ideas that survived (not suppressed).
 */
export function batchCheckSimilarity(
  productId: string,
  candidates: Array<{ title: string; description: string; index: number }>
): Array<{ index: number; result: SimilarityCheckResult }> {
  const existingEmbeddings = loadProductEmbeddings(productId);
  const results: Array<{ index: number; result: SimilarityCheckResult }> = [];

  // Also build embeddings for candidates to cross-check within the batch
  const candidateEmbeddings: Array<{ index: number; embedding: number[]; title: string }> = [];

  for (const candidate of candidates) {
    const candidateEmbedding = computeEmbedding(`${candidate.title} ${candidate.description}`);
    candidateEmbeddings.push({ index: candidate.index, embedding: candidateEmbedding, title: candidate.title });

    const similarIdeas: SimilarityMatch[] = [];
    let maxSimilarity = 0;
    let autoSuppress = false;
    let suppressReason: string | undefined;

    // Check against existing ideas in DB
    for (const existing of existingEmbeddings) {
      const sim = cosineSimilarity(candidateEmbedding, existing.embedding);

      if (sim > maxSimilarity) maxSimilarity = sim;

      if (sim >= AUTO_SUPPRESS_THRESHOLD && existing.status === 'rejected') {
        autoSuppress = true;
        suppressReason = `${Math.round(sim * 100)}% similar to rejected idea: "${existing.title}"`;
      }

      if (sim >= FLAG_SIMILARITY_THRESHOLD) {
        similarIdeas.push({
          ideaId: existing.ideaId,
          title: existing.title,
          status: existing.status,
          similarity: Math.round(sim * 100) / 100,
        });
      }
    }

    // Also check against earlier candidates in this batch (avoid intra-batch duplicates)
    for (const prev of candidateEmbeddings.slice(0, -1)) {
      const sim = cosineSimilarity(candidateEmbedding, prev.embedding);
      if (sim >= FLAG_SIMILARITY_THRESHOLD) {
        similarIdeas.push({
          ideaId: `batch_${prev.index}`,
          title: prev.title,
          status: 'pending',
          similarity: Math.round(sim * 100) / 100,
        });
      }
    }

    similarIdeas.sort((a, b) => b.similarity - a.similarity);

    let similarityFlag: string | undefined;
    if (similarIdeas.length > 0) {
      similarityFlag = JSON.stringify(
        similarIdeas.slice(0, 3).map(s => ({
          idea_id: s.ideaId,
          title: s.title,
          status: s.status,
          similarity: s.similarity,
        }))
      );
    }

    results.push({
      index: candidate.index,
      result: {
        autoSuppress,
        suppressReason,
        similarIdeas,
        maxSimilarity: Math.round(maxSimilarity * 100) / 100,
        similarityFlag,
      },
    });
  }

  return results;
}

/**
 * Backfill embeddings for all ideas in a product that don't have them yet.
 * Useful after enabling similarity detection on an existing product.
 */
export function backfillEmbeddings(productId: string): number {
  const ideas = queryAll<{ id: string; title: string; description: string }>(
    `SELECT i.id, i.title, i.description FROM ideas i
     LEFT JOIN idea_embeddings e ON e.idea_id = i.id
     WHERE i.product_id = ? AND e.id IS NULL`,
    [productId]
  );

  for (const idea of ideas) {
    storeEmbedding(idea.id, productId, idea.title, idea.description);
  }

  logger.info(`[Similarity] Backfilled ${ideas.length} embeddings for product ${productId}`);
  return ideas.length;
}
