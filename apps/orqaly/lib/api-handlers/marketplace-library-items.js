/**
 * Live library items - fetch a single curated Marketplace library's real items
 * from its public source, one page at a time, so the "Import From..." dialog can
 * offer dozens/hundreds of items with Load More and keyword search instead of
 * the few bundled samples in src/config/marketplaceImportSources.js.
 *
 * GET /api/app?path=marketplace-library-items&category=<cat>&sourceId=<id>&offset=0&limit=50&q=<text>
 *   -> { sourceId, category, items, total, hasMore, live }
 *      items match the tab's item schema (see marketplaceImportSources.js header).
 *      live=false means no live adapter exists (or the upstream failed); the
 *      client then falls back to the library's bundled items.
 *
 * All external calls run server-side. Each source's full normalized list is
 * cached best-effort per warm instance so paging/search reuse one upstream call
 * and stay within upstream rate limits.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { marketplaceLibraryItemsQuerySchema } from '../../api/_lib/validate.js';

const log = createLogger('marketplace-library-items');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h - these public sources rarely change
const cache = new Map(); // sourceId -> { at, items }

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function humanize(s) {
  return String(s || '')
    .replace(/[-_/]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function sizeClass(contextLength) {
  const n = Number(contextLength) || 0;
  if (n <= 8192) return 'sm';
  if (n <= 32768) return 'md';
  if (n <= 131072) return 'lg';
  return 'xl';
}

/**
 * Minimal RFC-4180 CSV parser: handles quoted fields, embedded commas/quotes
 * ("" escape), and CRLF/newlines inside quotes. Returns an array of string[].
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

// ── Adapters: public source -> normalized tab items ────────────────────────

// Awesome ChatGPT Prompts: a raw CSV of {act, prompt} personas (~200 rows).
async function loadAwesomePrompts() {
  const res = await fetchWithRetry(
    'https://raw.githubusercontent.com/f/awesome-chatgpt-prompts/main/prompts.csv',
    { method: 'GET' },
    { timeoutMs: 8000, retries: 1 }
  );
  if (!res.ok) throw new Error(`awesome-chatgpt-prompts returned ${res.status}`);
  const rows = parseCsv(await res.text());
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  const actIdx = header.findIndex((h) => h.trim().toLowerCase() === 'act');
  const promptIdx = header.findIndex((h) => h.trim().toLowerCase() === 'prompt');
  const a = actIdx === -1 ? 0 : actIdx;
  const p = promptIdx === -1 ? 1 : promptIdx;
  const seen = new Set();
  const items = [];
  for (const r of body) {
    const act = (r[a] || '').trim();
    const prompt = (r[p] || '').trim();
    if (!act || !prompt) continue;
    const sl = slug(act);
    if (!sl || seen.has(sl)) continue;
    seen.add(sl);
    items.push({
      id: `acp-${sl}`,
      slug: sl,
      name: act,
      category: 'prompt-engineering',
      description: prompt.length > 140 ? `${prompt.slice(0, 137)}...` : prompt,
      tags: ['prompt', 'persona'],
      compatible_roles: ['all'],
      icon: 'psychology',
      content: `# ${act}\n\n${prompt}`,
    });
  }
  return items;
}

// Anthropic Agent Skills: read the repo tree once and treat each folder with a
// SKILL.md as one skill (content links back to the source to avoid N fetches).
async function loadAnthropicSkills() {
  const res = await fetchWithRetry(
    'https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1',
    { method: 'GET', headers: { Accept: 'application/vnd.github+json' } },
    { timeoutMs: 8000, retries: 1 }
  );
  if (!res.ok) throw new Error(`anthropics/skills returned ${res.status}`);
  const data = await res.json();
  const tree = Array.isArray(data?.tree) ? data.tree : [];
  const seen = new Set();
  const items = [];
  for (const node of tree) {
    if (node.type !== 'blob' || !/\/SKILL\.md$/i.test(node.path)) continue;
    const folder = node.path.replace(/\/SKILL\.md$/i, '');
    const name = folder.split('/').pop();
    const sl = slug(folder);
    if (!sl || seen.has(sl)) continue;
    seen.add(sl);
    const human = humanize(name);
    items.push({
      id: `anth-skill-${sl}`,
      slug: sl,
      name: human,
      category: 'ops',
      description: `Official Anthropic Agent Skill: ${human}.`,
      tags: ['skill', 'claude'],
      compatible_roles: ['all'],
      icon: 'extension',
      content: `# ${human}\n\nOfficial Agent Skill from anthropics/skills (folder \`${folder}\`).\nSee https://github.com/anthropics/skills/tree/main/${folder}`,
    });
  }
  return items;
}

// OpenRouter models: hundreds of hosted models, keyless.
async function loadOpenRouterModels() {
  const res = await fetchWithRetry(
    'https://openrouter.ai/api/v1/models',
    { method: 'GET', headers: { 'Content-Type': 'application/json' } },
    { timeoutMs: 8000, retries: 1 }
  );
  if (!res.ok) throw new Error(`OpenRouter returned ${res.status}`);
  const data = await res.json();
  const models = Array.isArray(data) ? data : data?.data || [];
  return models
    .filter((m) => m && m.id)
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
        description: m.description || 'Hosted model routed via OpenRouter.',
      };
    });
}

const ADAPTERS = {
  'awesome-chatgpt-prompts': { category: 'skills', load: loadAwesomePrompts },
  'anthropic-skills': { category: 'skills', load: loadAnthropicSkills },
  'openrouter-models': { category: 'models', load: loadOpenRouterModels },
};

function hay(item) {
  const arr = (v) => (Array.isArray(v) ? v.join(' ') : '');
  return [
    item.name,
    item.description,
    item.slug,
    item.category,
    item.exactModel,
    item.provider,
    arr(item.tags),
    arr(item.capabilities),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

// Test hook: drop the in-memory cache so each case controls its own fetch.
export function _resetCacheForTests() {
  cache.clear();
}

async function loadItems(sourceId) {
  const cached = cache.get(sourceId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.items;
  const items = await ADAPTERS[sourceId].load();
  cache.set(sourceId, { at: Date.now(), items });
  return items;
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
    key: `marketplace-library-items:${getRateLimitIdentifier(req, user.id)}`,
    limit: 60,
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

  const parsed = marketplaceLibraryItemsQuerySchema.safeParse(req.query || {});
  if (!parsed.success) {
    done({ status: 400 });
    return jsonError(res, 400, parsed.error.issues[0]?.message || 'Invalid query');
  }
  const { category, sourceId, q, offset, limit } = parsed.data;

  const adapter = ADAPTERS[sourceId];
  // No live adapter, or wrong category for this source: let the client fall
  // back to the library's bundled items (still a 200 so the UI degrades cleanly).
  if (!adapter || adapter.category !== category) {
    done({ status: 200 });
    return res.status(200).json({ sourceId, category, items: [], total: 0, hasMore: false, live: false });
  }

  try {
    const all = await loadItems(sourceId);
    const needle = q.toLowerCase();
    const filtered = needle ? all.filter((it) => hay(it).includes(needle)) : all;
    const page = filtered.slice(offset, offset + limit);
    done({ status: 200 });
    return res.status(200).json({
      sourceId,
      category,
      items: page,
      total: filtered.length,
      hasMore: offset + limit < filtered.length,
      live: true,
    });
  } catch (err) {
    // Upstream fetch/parse failed: fall back to bundled items on the client.
    log.warn(req, 'source.error', { sourceId, err: err.message });
    done({ status: 200 });
    return res.status(200).json({
      sourceId,
      category,
      items: [],
      total: 0,
      hasMore: false,
      live: false,
      error: 'source_unavailable',
    });
  }
}
