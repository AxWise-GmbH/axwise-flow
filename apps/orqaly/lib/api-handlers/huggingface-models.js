/**
 * Live Hugging Face model search - powers the Marketplace "Download" sub-tab.
 *
 * GET /api/app?path=huggingface-models&q=<text>&limit=<n>
 *   -> { models: [ { id, name, repoId, author, provider, downloads, likes,
 *        license, gated, params, paramsLabel, files, lastModified, pipelineTag,
 *        sizeClass, url, description, source } ] }
 *
 * Detailed model metadata is pulled live from HF. The caller's stored
 * `data:huggingface` token is used when present (higher rate limits), else the
 * platform HUGGINGFACE_API_KEY, else keyless. The key never reaches the browser.
 *
 * Importing a model into the platform is a separate step (marketplace-imports).
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { resolveUserKey } from '../security/resolve-user-key.js';
import { huggingfaceModelSearchSchema } from '../../api/_lib/validate.js';

const log = createLogger('huggingface-models');

// Category -> one or more HF sub-queries. Each sub-query is fetched sorted by
// downloads; multi-query categories are merged, deduped by repo id and re-sorted.
// `pipelineTag` maps to HF's `pipeline_tag`; `filter` maps to HF's tag `filter`.
// Keys must mirror the `category` enum in api/_lib/validate.js and
// MODEL_CATEGORIES in src/config/modelCategories.js.
export const CATEGORY_QUERIES = {
  text: [{ pipelineTag: 'text-generation' }],
  coding: [{ pipelineTag: 'text-generation', filter: 'code' }],
  image: [{ pipelineTag: 'text-to-image' }, { pipelineTag: 'image-to-image' }],
  video: [{ pipelineTag: 'text-to-video' }, { pipelineTag: 'image-to-video' }],
  audio: [
    { pipelineTag: 'text-to-speech' },
    { pipelineTag: 'automatic-speech-recognition' },
  ],
  multimodal: [{ pipelineTag: 'image-text-to-text' }],
  embeddings: [{ pipelineTag: 'feature-extraction' }, { pipelineTag: 'sentence-similarity' }],
  '3d': [{ pipelineTag: 'text-to-3d' }, { pipelineTag: 'image-to-3d' }],
  research: [{ filter: 'biology' }, { filter: 'chemistry' }, { filter: 'medical' }],
};

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

// Human-readable parameter count, e.g. 8.03e9 -> "8B", 6.9e8 -> "690M".
export function formatParams(n) {
  if (!n || n <= 0) return null;
  if (n >= 1e9) {
    const b = n / 1e9;
    return `${b >= 10 ? Math.round(b) : b.toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (n >= 1e6) return `${Math.round(n / 1e6)}M`;
  return String(n);
}

// Bucket a model by parameter count (falls back to medium when unknown).
function paramSizeClass(params) {
  if (!params) return 'md';
  const b = params / 1e9;
  if (b < 13) return 'sm';
  if (b < 34) return 'md';
  if (b < 72) return 'lg';
  return 'xl';
}

function extractLicense(m) {
  if (m.cardData && typeof m.cardData.license === 'string') return m.cardData.license;
  const tags = Array.isArray(m.tags) ? m.tags : [];
  const lic = tags.find((t) => typeof t === 'string' && t.startsWith('license:'));
  return lic ? lic.slice('license:'.length) : null;
}

// Parse a "24B" / "13b" / "3.8B" size hint out of a repo id, for GGUF and other
// quant repos that carry no `safetensors` param count.
function parseParamsFromId(id) {
  const match = String(id || '').match(/(\d+(?:\.\d+)?)\s*b\b/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1e9) : null;
}

function extractParams(m) {
  const total = m.safetensors?.total ?? m.safetensors?.parameters?.total;
  const n = toNumber(total);
  if (n && n > 0) return n;
  return parseParamsFromId(m.id || m.modelId);
}

// HF model payload -> detailed card record. Numeric rent-card fields are
// defaulted so an imported model still renders safely in the (merged) Rent grid.
export function normalizeHfModel(m) {
  const id = m.id || m.modelId;
  if (!id) return null;
  const author = m.author || String(id).split('/')[0] || 'unknown';
  const shortName = String(id).split('/').pop() || id;
  const params = extractParams(m);
  const paramsLabel = formatParams(params);
  const license = extractLicense(m);
  const pipelineTag = m.pipeline_tag || 'text-generation';
  const gated = !!m.gated && m.gated !== false;
  const files = Array.isArray(m.siblings) ? m.siblings.length : 0;
  const description = [
    pipelineTag.replace(/-/g, ' '),
    license ? `${license} license` : null,
    paramsLabel ? `~${paramsLabel} params` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    id: `hf-${slug(id)}`,
    name: shortName,
    repoId: id,
    exactModel: id, // drives brand-logo resolution + Rent-grid compatibility
    author,
    provider: `@${author}`,
    downloads: toNumber(m.downloads) || 0,
    likes: toNumber(m.likes) || 0,
    license,
    gated,
    private: !!m.private,
    params,
    paramsLabel,
    files,
    lastModified: m.lastModified || m.createdAt || null,
    pipelineTag,
    sizeClass: paramSizeClass(params),
    url: `https://huggingface.co/${id}`,
    description,
    source: 'huggingface',
    // Safe defaults so a merged import never crashes the Rent card renderer.
    hardware: 'Self-hosted',
    ram: 'n/a',
    contextLength: 0,
    pricePerHour: 0,
    tokensPerSecond: null,
    status: 'online',
    rating: 0,
    reviewsCount: 0,
  };
}

async function resolveAuthHeaders(userId) {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const { key } = await resolveUserKey({
      userId,
      provider: 'data:huggingface',
      envVar: 'HUGGINGFACE_API_KEY',
      requireUser: false,
      reason: 'huggingface_models',
    });
    if (key) headers.Authorization = `Bearer ${key}`;
  } catch {
    // keyless is fine - just lower rate limits
  }
  return headers;
}

// Build the HF model-search URL for a single sub-query, always sorted by
// downloads descending with full metadata for detailed cards.
function buildHfUrl({ search, pipelineTag, filter, limit }) {
  const params = new URLSearchParams({
    limit: String(limit),
    sort: 'downloads',
    direction: '-1',
    full: 'true',
    config: 'true',
    cardData: 'true',
  });
  if (search) params.set('search', search);
  if (pipelineTag) params.set('pipeline_tag', pipelineTag);
  if (filter) params.set('filter', filter);
  return `https://huggingface.co/api/models?${params.toString()}`;
}

// Fetch + normalize one sub-query. Returns { models } or { error }.
async function fetchOne({ search, pipelineTag, filter, limit, headers }) {
  const res = await fetchWithRetry(
    buildHfUrl({ search, pipelineTag, filter, limit }),
    { method: 'GET', headers },
    { timeoutMs: 8000, retries: 1 }
  );
  if (!res.ok) return { error: { status: 502, message: `Hugging Face returned ${res.status}` } };
  const data = await res.json();
  const raw = Array.isArray(data) ? data : data?.models || [];
  return { models: raw.map(normalizeHfModel).filter(Boolean) };
}

async function fetchHuggingFaceModels({ q, limit, category, userId }) {
  const headers = await resolveAuthHeaders(userId);

  // Plain search / seed view: a single request (unchanged behaviour).
  if (!category) {
    const out = await fetchOne({ search: q, limit, headers });
    if (out.error) return out;
    return { models: out.models.slice(0, limit) };
  }

  // Category browse: fan out to the category's sub-queries, merge the results,
  // dedupe by repo id and re-sort by downloads so the merged top-N is accurate.
  const subQueries = CATEGORY_QUERIES[category];
  if (!subQueries) return { error: { status: 400, message: `Unknown category: ${category}` } };

  const settled = await Promise.allSettled(
    subQueries.map((sub) =>
      fetchOne({
        search: q,
        pipelineTag: sub.pipelineTag,
        filter: sub.filter,
        limit,
        headers,
      })
    )
  );

  const byRepo = new Map();
  let anyOk = false;
  for (const r of settled) {
    if (r.status !== 'fulfilled' || r.value.error) continue;
    anyOk = true;
    for (const m of r.value.models) {
      const prev = byRepo.get(m.repoId);
      if (!prev || (m.downloads || 0) > (prev.downloads || 0)) byRepo.set(m.repoId, m);
    }
  }

  // Only error out when every sub-query failed; partial success still returns.
  if (!anyOk) return { error: { status: 502, message: 'Hugging Face request failed' } };

  const models = Array.from(byRepo.values())
    .sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
    .slice(0, limit);
  return { models };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const done = log.startTimer(req, 'request', { method: req.method });
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  const rl = checkRateLimit({
    key: `huggingface-models:${getRateLimitIdentifier(req, user.id)}`,
    limit: 30,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  if (req.method !== 'GET') {
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  }

  const parsed = huggingfaceModelSearchSchema.safeParse(req.query || {});
  if (!parsed.success) {
    done({ status: 400 });
    return jsonError(res, 400, parsed.error.issues[0]?.message || 'Invalid query');
  }
  const { q, limit, category } = parsed.data;

  try {
    const out = await fetchHuggingFaceModels({ q, limit, category, userId: user.id });
    if (out.error) {
      log.warn(req, 'huggingface.error', out.error);
      done({ status: out.error.status });
      return jsonError(res, out.error.status, out.error.message);
    }
    done({ status: 200 });
    return res.status(200).json({ models: out.models });
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'huggingface-models');
  }
}
