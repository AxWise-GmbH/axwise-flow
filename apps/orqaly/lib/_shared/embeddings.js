/**
 * Shared embedding utilities for knowledge base and agent memory.
 * Used by: knowledge-base.js, job-processor.js
 */
import { fetchWithRetry } from '../../api/_lib/fetch.js';

const EMBEDDING_MODEL = 'all-MiniLM-L6-v2';
export const EMBEDDING_DIM = 384;

/**
 * Generate embeddings using Hugging Face Inference API (free, no key needed for small models)
 * or fall back to a simple hash-based approach.
 */
export async function generateEmbedding(text) {
  const hfKey = process.env.HF_API_KEY || '';

  if (hfKey) {
    const res = await fetchWithRetry(
      `https://api-inference.huggingface.co/pipeline/feature-extraction/${EMBEDDING_MODEL}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: text.slice(0, 512), options: { wait_for_model: true } }),
      },
      { timeoutMs: 15000, retries: 1 },
    );

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length === EMBEDDING_DIM) return data;
      if (Array.isArray(data) && Array.isArray(data[0])) return data[0];
    }
  }

  // Fallback: deterministic hash-based embedding (not semantic, but enables the pipeline)
  return hashEmbedding(text, EMBEDDING_DIM);
}

export function hashEmbedding(text, dim = EMBEDDING_DIM) {
  const vec = new Float32Array(dim);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const words = normalized.split(/\s+/).filter(Boolean);

  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(hash) % dim;
    vec[idx] += 1;
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const result = [];
  for (let i = 0; i < dim; i++) result.push(vec[i] / norm);
  return result;
}

export function estimateTokens(text) {
  return Math.ceil((text || '').split(/\s+/).length * 1.3);
}
