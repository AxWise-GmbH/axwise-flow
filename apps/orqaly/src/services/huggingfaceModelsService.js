/**
 * Frontend client for /api/app?path=huggingface-models.
 * Live Hugging Face model search that powers the Marketplace "Download" sub-tab.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { normalizeHfModel } from '../utils/hfModel';

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

function getBase() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

const WEIGHT_EXT = /\.(gguf|safetensors|bin|pt|onnx)$/i;

// Pull a quantization / precision tag out of a weight filename, e.g.
// "...-IQ4_XS.gguf" -> "IQ4_XS", "...Q4_K_M.gguf" -> "Q4_K_M", "...-BF16" -> "BF16".
function quantOf(name) {
  const m = String(name).match(/(IQ\d[\w]*|Q\d(?:_[A-Z0-9]+)*|BF16|F16|F32|FP\d+|\d+bit)/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * List the downloadable weight files (quants) in a HF repo, with sizes and
 * direct download URLs. Called on-demand when the user opens the Download
 * dialog. Keyless + CORS-friendly; returns [] on failure.
 */
export async function listModelFiles(repoId, { signal } = {}) {
  const res = await fetch(
    `https://huggingface.co/api/models/${repoId}/tree/main?recursive=true`,
    { signal }
  );
  if (!res.ok) throw new Error(`Hugging Face returned ${res.status}`);
  const tree = await res.json();
  const files = (Array.isArray(tree) ? tree : [])
    .filter((f) => f?.type === 'file' && WEIGHT_EXT.test(f.path || ''))
    .map((f) => {
      const path = f.path;
      const shortName = path.split('/').pop();
      const size = Number(f.size ?? f.lfs?.size) || 0;
      return {
        path,
        name: shortName,
        quant: quantOf(shortName),
        size,
        // ?download=true makes HF send Content-Disposition: attachment.
        url: `https://huggingface.co/${repoId}/resolve/main/${path.split('/').map(encodeURIComponent).join('/')}?download=true`,
      };
    })
    .sort((a, b) => a.size - b.size);
  return files;
}

// First HF pipeline_tag for each category, used only by the keyless direct
// fallback (which can issue a single request). The backend handler owns the
// richer multi-sub-query merge - keep the primary tag here roughly aligned.
const CATEGORY_PRIMARY_TAG = {
  text: 'text-generation',
  coding: 'text-generation',
  image: 'text-to-image',
  video: 'text-to-video',
  audio: 'text-to-speech',
  multimodal: 'image-text-to-text',
  embeddings: 'feature-extraction',
  '3d': 'text-to-3d',
  research: null,
};

// Direct (keyless) HF fallback - used when our backend endpoint is unreachable
// (e.g. dev proxies /api to a deploy without this handler yet). HF allows CORS.
async function searchHuggingFaceDirect(query, limit, category, signal) {
  const params = new URLSearchParams({
    limit: String(limit),
    sort: 'downloads',
    direction: '-1',
    full: 'true',
    config: 'true',
    cardData: 'true',
  });
  if (query) params.set('search', query);
  const tag = category ? CATEGORY_PRIMARY_TAG[category] : null;
  if (tag) params.set('pipeline_tag', tag);
  const res = await fetch(`https://huggingface.co/api/models?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Hugging Face returned ${res.status}`);
  const data = await res.json();
  const raw = Array.isArray(data) ? data : [];
  return raw.map(normalizeHfModel).filter(Boolean).slice(0, limit);
}

/**
 * Search Hugging Face models. Returns a list of detailed, normalized records
 * (see the handler for the shape). An empty `query` returns the most-downloaded
 * models, which the Download tab uses to resolve a seeded default view.
 *
 * Prefers our backend endpoint (uses the stored HF key + higher rate limits),
 * and falls back to a direct keyless HF call so browsing works even before the
 * backend handler is deployed.
 */
/**
 * Resolve a curated, rank-ordered list of models to live HF records.
 *
 * Each `list` entry is `{ name, query }`; we resolve the top HF match for every
 * query in parallel, attach `displayName` (the friendly label) and `rank` (1-based
 * position), dedupe by repo id, and PRESERVE the input order - the list order is
 * the intended ranking, so results are never re-sorted by downloads.
 */
export async function resolveCuratedModels(list = [], { signal } = {}) {
  const results = await Promise.allSettled(
    list.map((s) => searchHuggingFaceModels(s.query, { limit: 1, signal }))
  );
  const seen = new Set();
  const out = [];
  results.forEach((r, i) => {
    const top = r.status === 'fulfilled' ? r.value[0] : null;
    if (top && !seen.has(top.repoId)) {
      seen.add(top.repoId);
      out.push({ ...top, displayName: list[i].name, rank: i + 1 });
    }
  });
  return out;
}

export async function searchHuggingFaceModels(query = '', { limit = 24, category, signal } = {}) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (limit) params.set('limit', String(limit));
  if (category) params.set('category', category);
  try {
    const res = await fetch(`${getBase()}/api/app?path=huggingface-models&${params.toString()}`, {
      headers: await getHeaders(),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to search Hugging Face models');
    return Array.isArray(data.models) ? data.models : [];
  } catch (err) {
    if (signal?.aborted) throw err;
    return searchHuggingFaceDirect(query, limit, category, signal);
  }
}
