/**
 * Live provider catalog - fetch a real external provider's catalog so the user
 * can browse it and import items into a Marketplace tab.
 *
 * GET /api/app?path=provider-catalog&provider=<id>&category=<cat>&q=<text>
 *   provider: composio (-> tools) | openrouter | huggingface (-> models)
 *   -> { provider, category, items } where items match the tab's item schema
 *      (see the header of src/config/marketplaceImportSources.js).
 *
 * All external calls run server-side; provider keys never reach the browser.
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
import { composioHeaders, composioBaseUrl, isComposioConfigured } from '../composio/client.js';
import { providerCatalogQuerySchema } from '../../api/_lib/validate.js';

const log = createLogger('provider-catalog');

const MAX_ITEMS = 100;

// Which category each provider feeds. A mismatch is a 400.
const PROVIDER_CATEGORY = {
  composio: 'tools',
  openrouter: 'models',
  huggingface: 'models',
};

function sizeClass(contextLength) {
  const n = Number(contextLength) || 0;
  if (n <= 8192) return 'sm';
  if (n <= 32768) return 'md';
  if (n <= 131072) return 'lg';
  return 'xl';
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function matchesQuery(item, q) {
  if (!q) return true;
  const hay = `${item.name || ''} ${item.description || ''}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

// ── Adapters: provider payload -> tab item schema ──────────────────

function transformComposioApps(raw, q) {
  const apps = Array.isArray(raw) ? raw : raw?.items || raw?.apps || [];
  return apps
    .map((app) => {
      const key = app.key || app.appId || app.name;
      const cat = (Array.isArray(app.categories) ? app.categories[0] : app.category) || 'mcp';
      return {
        id: `composio-${slug(key)}`,
        name: app.name || key,
        description: app.description || '',
        connectionType: 'composio',
        status: 'active',
        category: String(cat).toLowerCase(),
      };
    })
    .filter((item) => item.name && matchesQuery(item, q))
    .slice(0, MAX_ITEMS);
}

function transformOpenRouterModels(raw, q) {
  const models = Array.isArray(raw) ? raw : raw?.data || [];
  return models
    .map((m) => {
      const ctx = m.context_length || m.top_provider?.context_length || 0;
      return {
        id: `or-${slug(m.id)}`,
        name: m.name || m.id,
        exactModel: m.id,
        provider: '@openrouter',
        hardware: 'Hosted (gateway)',
        ram: 'n/a',
        contextLength: ctx,
        pricePerHour: 0,
        tokensPerSecond: null,
        status: 'online',
        sizeClass: sizeClass(ctx),
        description: m.description || `Hosted model routed via OpenRouter.`,
        // display-only chips (ignored on import)
        pipelineTag: 'hosted',
      };
    })
    .filter((item) => item.exactModel && matchesQuery(item, q))
    .slice(0, MAX_ITEMS);
}

function transformHuggingFaceModels(raw) {
  const models = Array.isArray(raw) ? raw : raw?.models || [];
  return models
    .map((m) => {
      const modelId = m.modelId || m.id;
      return {
        id: `hf-${slug(modelId)}`,
        name: modelId,
        exactModel: modelId,
        provider: '@huggingface',
        hardware: 'Self-hosted',
        ram: 'n/a',
        contextLength: 0,
        pricePerHour: 0,
        tokensPerSecond: null,
        status: 'online',
        sizeClass: 'md',
        description: `${m.pipeline_tag || 'model'} - ${(m.downloads || 0).toLocaleString()} downloads`,
        // display-only chips (ignored on import)
        pipelineTag: m.pipeline_tag || 'model',
        downloads: m.downloads || 0,
        likes: m.likes || 0,
      };
    })
    .filter((item) => item.exactModel)
    .slice(0, MAX_ITEMS);
}

// ── Provider fetchers ──────────────────────────────────────────────

async function fetchComposio(q) {
  if (!isComposioConfigured()) {
    return { error: { status: 503, message: 'Composio is not configured' } };
  }
  const res = await fetchWithRetry(
    `${composioBaseUrl()}/apps?limit=${MAX_ITEMS}`,
    { method: 'GET', headers: composioHeaders() },
    { timeoutMs: 8000, retries: 1 }
  );
  if (!res.ok) return { error: { status: 502, message: `Composio returned ${res.status}` } };
  const data = await res.json();
  return { items: transformComposioApps(data, q) };
}

async function fetchOpenRouter(q) {
  const res = await fetchWithRetry(
    'https://openrouter.ai/api/v1/models',
    { method: 'GET', headers: { 'Content-Type': 'application/json' } },
    { timeoutMs: 8000, retries: 1 }
  );
  if (!res.ok) return { error: { status: 502, message: `OpenRouter returned ${res.status}` } };
  const data = await res.json();
  return { items: transformOpenRouterModels(data, q) };
}

async function fetchHuggingFace(q, userId) {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const { key } = await resolveUserKey({
      userId,
      provider: 'data:huggingface',
      envVar: 'HUGGINGFACE_API_KEY',
      requireUser: false,
      reason: 'provider_catalog',
    });
    if (key) headers.Authorization = `Bearer ${key}`;
  } catch {
    // keyless is fine - just lower rate limits
  }
  const params = new URLSearchParams({
    limit: String(MAX_ITEMS),
    sort: 'downloads',
    direction: '-1',
  });
  if (q) params.set('search', q);
  const res = await fetchWithRetry(
    `https://huggingface.co/api/models?${params.toString()}`,
    { method: 'GET', headers },
    { timeoutMs: 8000, retries: 1 }
  );
  if (!res.ok) return { error: { status: 502, message: `Hugging Face returned ${res.status}` } };
  const data = await res.json();
  return { items: transformHuggingFaceModels(data) };
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
    key: `provider-catalog:${getRateLimitIdentifier(req, user.id)}`,
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

  const parsed = providerCatalogQuerySchema.safeParse(req.query || {});
  if (!parsed.success) {
    done({ status: 400 });
    return jsonError(res, 400, parsed.error.issues[0]?.message || 'Invalid query');
  }
  const { provider, category, q } = parsed.data;

  if (PROVIDER_CATEGORY[provider] !== category) {
    done({ status: 400 });
    return jsonError(res, 400, `Provider "${provider}" does not serve category "${category}"`);
  }

  try {
    let out;
    if (provider === 'composio') out = await fetchComposio(q);
    else if (provider === 'openrouter') out = await fetchOpenRouter(q);
    else out = await fetchHuggingFace(q, user.id);

    if (out.error) {
      log.warn(req, 'provider.error', { provider, ...out.error });
      done({ status: out.error.status });
      return jsonError(res, out.error.status, out.error.message);
    }

    done({ status: 200 });
    return res.status(200).json({ provider, category, items: out.items });
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'provider-catalog');
  }
}
