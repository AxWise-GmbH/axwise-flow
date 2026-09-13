/**
 * github-agents-import - discover agents published in a public GitHub repo and
 * return them, one page at a time, shaped like the Marketplace importable-agent
 * item. Read-only (GET, no DB writes). Persistence is the client's job via the
 * existing marketplace-imports endpoint; this handler only reads GitHub.
 *
 * GET /api/app?path=github-agents-import&url=<repo>&offset=0&limit=30&q=<text>
 *   -> { repo, items, total, offset, limit, hasMore, rejected, truncated, warnings, live }
 *
 * Recognized formats (see README / docs): front-matter markdown agents
 * (contains-studio/agency-agents family, the primary case) scoped by an optional
 * root divisions.json/agents catalog; Claude Agent SDK .claude/agents/*.md;
 * Orqaly JSON (orqaly.agents.json / .orqaly/agents/*.json / root agents.json);
 * per-file *.agent.json / *.agent.yaml; and CrewAI agents.yaml maps.
 *
 * Safety: only github.com is parsed (SSRF-safe, all fetch URLs are rebuilt from
 * validated components); every system_prompt is screened with screenSystemPrompt
 * before it can be returned; sizes and counts are capped. No Axwise dependency.
 */
import yaml from 'js-yaml';
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
import { githubAgentsImportQuerySchema } from '../../api/_lib/validate.js';
import { parseGithubUrl } from './_shared/github-url.js';
import { screenSystemPrompt } from '../concilium-handlers/agent-config-validator.js';
import { resolveUserKey } from '../security/resolve-user-key.js';
import { defaultProvider, defaultModel } from '../_shared/llm-defaults.js';

const log = createLogger('github-agents-import');

const MAX_BYTES = 20000; // per raw file (mirrors kb-ingest-common.js)
const MAX_MANIFEST_FILES = 25; // JSON/YAML manifest files expanded at inventory time
const MAX_INLINE_AGENTS = 500; // agents extracted from JSON/YAML manifests
const MAX_INVENTORY = 2000; // total candidate agents across a repo
const RAW_CONCURRENCY = 6; // parallel raw fetches per page
const INVENTORY_TTL_MS = 6 * 60 * 60 * 1000; // public repos rarely change

// Generic scan (no divisions catalog) exclusions.
const NON_AGENT_DIRS = new Set([
  '.github',
  'scripts',
  'examples',
  'integrations',
  'node_modules',
  'strategy',
  'test',
  'tests',
  '__tests__',
  'docs',
  'dist',
  'build',
]);
const DOC_BASENAMES = new Set([
  'readme',
  'contributing',
  'license',
  'security',
  'changelog',
  'code_of_conduct',
  'pull_request_template',
  'issue_template',
]);

const inventoryCache = new Map(); // `${owner}/${repo}@${branch}` -> { at, inventory, truncated, warnings, fullName }

export function _resetCacheForTests() {
  inventoryCache.clear();
}

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
// Normalize text for substring search: lowercase, then collapse path/word
// separators (`- _ /`) and runs of whitespace to single spaces — so
// "finance-financial-analyst", "financial analyst" and "financial_analyst" all
// match the same query. Applied to both the searchable text and the query.
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function toArray(v) {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string');
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

function ghHeaders(token, accept) {
  const h = {
    Accept: accept || 'application/vnd.github+json',
    'User-Agent': 'orqaly-agent-import',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghJson(url, token) {
  const res = await fetchWithRetry(
    url,
    { method: 'GET', headers: ghHeaders(token) },
    { timeoutMs: 8000, retries: 1 }
  );
  return res;
}

async function fetchRaw(owner, repo, branch, path, token) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  const res = await fetchWithRetry(
    url,
    { method: 'GET', headers: ghHeaders(token, 'text/plain') },
    { timeoutMs: 8000, retries: 1 }
  );
  if (!res.ok) return null;
  const text = await res.text();
  return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
}

// ── Front-matter markdown ──────────────────────────────────────────────────
function parseFrontMatter(text) {
  const m = /^\uFEFF?---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(text || '');
  if (!m) return { data: null, body: text || '' };
  let data = null;
  try {
    const parsed = yaml.load(m[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
  } catch {
    data = null;
  }
  return { data, body: (text || '').slice(m[0].length) };
}

function baseItem({
  id,
  name,
  description,
  category,
  capabilities,
  systemPrompt,
  confidence,
  path,
  repoUrl,
  persona,
  declaredTools,
}) {
  return {
    _id: id,
    name,
    role: name,
    description: description || '',
    category: category || 'Imported',
    capabilities: capabilities || [],
    connection_type: defaultProvider(),
    model: defaultModel(),
    cost_per_task: 0,
    tools: [], // never carry unvetted tool ids into the agent record; see _declaredTools
    system_prompt: systemPrompt,
    _source: 'github',
    _path: path,
    _url: repoUrl,
    _confidence: confidence,
    ...(persona ? { _persona: persona } : {}),
    ...(declaredTools && declaredTools.length ? { _declaredTools: declaredTools } : {}),
  };
}

function mapFrontMatterAgent(entry, text, repoUrl) {
  const { data, body } = parseFrontMatter(text);
  if (!data) return null; // not an agent file
  const name = String(data.name || data.title || entry.nameGuess || '').trim();
  const systemPrompt = String(body || '').trim();
  if (!name || systemPrompt.length < 10) return null;
  return baseItem({
    id: slug(entry.path),
    name,
    description: typeof data.description === 'string' ? data.description : '',
    category: entry.category,
    capabilities: toArray(data.capabilities || data.tags),
    systemPrompt,
    confidence: entry.confidence,
    path: entry.path,
    repoUrl,
    persona:
      data.color || data.emoji || data.vibe
        ? { color: data.color, emoji: data.emoji, vibe: data.vibe }
        : null,
    declaredTools: toArray(data.tools),
  });
}

// ── JSON / YAML manifest agents ────────────────────────────────────────────
function mapObjectAgent(obj, ctx) {
  if (!obj || typeof obj !== 'object') return null;
  const name = String(obj.name || obj.role || obj.title || '').trim();
  let systemPrompt = obj.system_prompt || obj.systemPrompt || obj.instructions;
  if (!systemPrompt && (obj.role || obj.goal || obj.backstory)) {
    // CrewAI-style: synthesize a prompt from role/goal/backstory.
    systemPrompt = [obj.role, obj.goal, obj.backstory].filter(Boolean).join('\n\n');
  }
  systemPrompt = String(systemPrompt || '').trim();
  if (!name || systemPrompt.length < 10) return null;
  return baseItem({
    id: slug(`${ctx.path}-${name}`),
    name,
    description: typeof obj.description === 'string' ? obj.description : obj.goal || '',
    category: obj.category || ctx.category || 'Imported',
    capabilities: toArray(obj.capabilities || obj.tags),
    systemPrompt,
    confidence: ctx.confidence,
    path: ctx.path,
    repoUrl: ctx.repoUrl,
    declaredTools: toArray(obj.tools),
  });
}

function extractAgentsFromParsed(parsed, ctx) {
  const out = [];
  const push = (a) => {
    if (a) out.push(a);
  };
  if (Array.isArray(parsed)) {
    parsed.forEach((o) => push(mapObjectAgent(o, ctx)));
  } else if (parsed && Array.isArray(parsed.agents)) {
    parsed.agents.forEach((o) => push(mapObjectAgent(o, ctx)));
  } else if (parsed && typeof parsed === 'object') {
    if (parsed.system_prompt || parsed.systemPrompt || parsed.role || parsed.goal) {
      push(mapObjectAgent(parsed, ctx));
    } else {
      // CrewAI map: { agent_key: { role, goal, backstory } }
      for (const [key, val] of Object.entries(parsed)) {
        if (val && typeof val === 'object' && (val.role || val.goal || val.system_prompt)) {
          push(mapObjectAgent({ name: val.role || key, ...val }, ctx));
        }
      }
    }
  }
  return out;
}

function parseManifest(path, text) {
  if (/\.(ya?ml)$/i.test(path)) {
    try {
      return yaml.load(text);
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ── Classification ──────────────────────────────────────────────────────────
function isOrqalyManifest(p) {
  return (
    p === 'orqaly.agents.json' ||
    p === '.orqaly/agents.json' ||
    p === 'agents.json' ||
    /^\.orqaly\/agents\/[^/]+\.json$/i.test(p) ||
    /\.agent\.json$/i.test(p)
  );
}
function isYamlManifest(p) {
  return /(^|\/)agents\.ya?ml$/i.test(p) || /\.agent\.ya?ml$/i.test(p);
}

function docBasename(p) {
  const base = p.split('/').pop().replace(/\.md$/i, '').toLowerCase();
  return DOC_BASENAMES.has(base);
}

/**
 * Build the (mostly content-free) inventory of candidate agents from the tree.
 * Front-matter .md files become lazy 'md' entries; JSON/YAML manifests are
 * fetched and expanded now into 'inline' entries (there are usually only a few).
 */
async function buildInventory({ owner, repo, branch, tree, token, repoUrl, divisions }) {
  const warnings = [];
  const inventory = [];
  const divisionKeys = divisions ? new Set(Object.keys(divisions)) : null;
  const label = (key) => (divisions && divisions[key] && divisions[key].label) || humanize(key);

  const manifestPaths = [];
  const blobs = tree.filter((n) => n.type === 'blob' && typeof n.path === 'string');

  for (const node of blobs) {
    const p = node.path;
    if (isOrqalyManifest(p) || isYamlManifest(p)) {
      manifestPaths.push(p);
      continue;
    }
    if (!/\.md$/i.test(p)) continue;

    const segments = p.split('/');
    const first = segments[0];
    if (divisionKeys) {
      // Scoped mode: only .md directly informed by the division catalog.
      if (segments.length < 2 || !divisionKeys.has(first)) continue;
      const nameGuess = humanize(
        segments[segments.length - 1].replace(/\.md$/i, '').replace(new RegExp(`^${first}-`), '')
      );
      inventory.push({
        type: 'md',
        path: p,
        category: label(first),
        nameGuess,
        confidence: 'high',
        // Include the humanized display name so users can search by it (not just the path).
        searchText: norm(`${p} ${label(first)} ${nameGuess}`),
      });
    } else {
      // Generic mode: any front-matter .md, minus docs and service dirs.
      if (segments.some((s) => NON_AGENT_DIRS.has(s.toLowerCase()))) continue;
      if (docBasename(p)) continue;
      const folder = segments.length > 1 ? segments[segments.length - 2] : '';
      const nameGuess = humanize(segments[segments.length - 1].replace(/\.md$/i, ''));
      inventory.push({
        type: 'md',
        path: p,
        category: folder ? humanize(folder) : 'Imported',
        nameGuess,
        confidence: 'medium',
        // Include the humanized display name so users can search by it (not just the path).
        searchText: norm(`${p} ${folder} ${nameGuess}`),
      });
    }
  }

  // Expand JSON/YAML manifests now (bounded).
  let inlineCount = 0;
  for (const p of manifestPaths.slice(0, MAX_MANIFEST_FILES)) {
    if (inlineCount >= MAX_INLINE_AGENTS) break;
    const text = await fetchRaw(owner, repo, branch, p, token);
    if (!text) continue;
    const parsed = parseManifest(p, text);
    if (!parsed) continue;
    const confidence = /\.ya?ml$/i.test(p) ? 'medium' : 'high';
    const folder = p.includes('/') ? p.split('/').slice(-2, -1)[0] : '';
    const agents = extractAgentsFromParsed(parsed, {
      path: p,
      category: folder ? humanize(folder) : 'Imported',
      confidence,
      repoUrl,
    });
    for (const item of agents) {
      if (inlineCount >= MAX_INLINE_AGENTS) break;
      inlineCount += 1;
      inventory.push({
        type: 'inline',
        item,
        category: item.category,
        searchText: norm(`${item.name} ${item.description} ${item.category}`),
      });
    }
  }
  if (manifestPaths.length > MAX_MANIFEST_FILES) {
    warnings.push(
      `Only the first ${MAX_MANIFEST_FILES} manifest files were read; some agents may be missing.`
    );
  }
  if (inventory.length > MAX_INVENTORY) {
    warnings.push(
      `Repository has more than ${MAX_INVENTORY} candidate agents; the list was capped.`
    );
    inventory.length = MAX_INVENTORY;
  }
  return { inventory, warnings };
}

async function loadRootCatalog(owner, repo, branch, token) {
  // divisions.json scopes front-matter .md folders in the agency-agents family.
  const text = await fetchRaw(owner, repo, branch, 'divisions.json', token);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.divisions && typeof parsed.divisions === 'object') return parsed.divisions;
  } catch {
    /* ignore */
  }
  return null;
}

// Turn a failed GitHub API response into a user-facing error. Rate-limit 403s
// (common from anonymous or shared serverless egress IPs) get an actionable
// message instead of a bare status code, so the UI never confuses "GitHub is
// throttling us" with "this repo has no agents".
function githubError(res) {
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers?.get?.('x-ratelimit-remaining');
    if (res.status === 429 || remaining === '0') {
      return Object.assign(
        new Error(
          'GitHub API rate limit reached. Add a GITHUB_TOKEN (or connect a GitHub token in settings) to raise the limit, then try again.'
        ),
        { status: 502 }
      );
    }
    return Object.assign(new Error('GitHub denied access (403); the repository may be private.'), {
      status: 502,
    });
  }
  return Object.assign(new Error(`GitHub returned ${res.status}`), { status: 502 });
}

async function resolveBranchAndTree({ owner, repo, branch, token }) {
  // Resolve default branch if none supplied.
  let resolvedBranch = branch;
  let fullName = `${owner}/${repo}`;
  if (!resolvedBranch) {
    const metaRes = await ghJson(`https://api.github.com/repos/${owner}/${repo}`, token);
    if (metaRes.status === 404)
      throw Object.assign(new Error('Repository not found'), { status: 404 });
    if (!metaRes.ok) throw githubError(metaRes);
    const meta = await metaRes.json();
    resolvedBranch = meta.default_branch || 'main';
    fullName = meta.full_name || fullName;
  }
  let treeRes = await ghJson(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(resolvedBranch)}?recursive=1`,
    token
  );
  // A supplied branch that doesn't exist: fall back to the default branch.
  if (treeRes.status === 404 && branch) {
    const metaRes = await ghJson(`https://api.github.com/repos/${owner}/${repo}`, token);
    if (metaRes.ok) {
      const meta = await metaRes.json();
      resolvedBranch = meta.default_branch || 'main';
      fullName = meta.full_name || fullName;
      treeRes = await ghJson(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(resolvedBranch)}?recursive=1`,
        token
      );
    }
  }
  if (treeRes.status === 404)
    throw Object.assign(new Error('Repository or branch not found'), { status: 404 });
  if (!treeRes.ok) throw githubError(treeRes);
  const data = await treeRes.json();
  return {
    branch: resolvedBranch,
    fullName,
    tree: Array.isArray(data.tree) ? data.tree : [],
    truncated: Boolean(data.truncated),
  };
}

async function getInventory({ owner, repo, branch, token }) {
  const cacheKeyBranch = branch || '';
  const key = `${owner}/${repo}@${cacheKeyBranch}`;
  const hit = inventoryCache.get(key);
  if (hit && Date.now() - hit.at < INVENTORY_TTL_MS) return hit;

  const {
    branch: resolvedBranch,
    fullName,
    tree,
    truncated,
  } = await resolveBranchAndTree({ owner, repo, branch, token });
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const divisions = await loadRootCatalog(owner, repo, resolvedBranch, token);
  const { inventory, warnings } = await buildInventory({
    owner,
    repo,
    branch: resolvedBranch,
    tree,
    token,
    repoUrl,
    divisions,
  });
  if (truncated) {
    warnings.push(
      'GitHub truncated the repository tree (very large repo); some agents may be missing.'
    );
  }
  const record = {
    at: Date.now(),
    inventory,
    truncated,
    warnings,
    fullName,
    branch: resolvedBranch,
    repoUrl,
  };
  // Never memoize an empty discovery: a transient GitHub hiccup or a not-yet-
  // authenticated request that yields zero agents would otherwise be served from
  // cache for the full 6h TTL, hiding the repo's real (non-empty) contents.
  if (inventory.length > 0) inventoryCache.set(key, record);
  return record;
}

// Hydrate one page: fetch bodies for 'md' entries (bounded concurrency), map,
// then screen every candidate. Returns { items, rejected }.
async function hydratePage({ owner, repo, branch, page, repoUrl }) {
  const results = new Array(page.length).fill(null);
  let rejected = 0;

  for (let i = 0; i < page.length; i += RAW_CONCURRENCY) {
    const batch = page.slice(i, i + RAW_CONCURRENCY);
    const mapped = await Promise.all(
      batch.map(async (entry) => {
        if (entry.type === 'inline') return entry.item;
        const text = await fetchRaw(owner, repo, branch, entry.path, null).catch(() => null);
        if (!text) return null;
        return mapFrontMatterAgent(entry, text, repoUrl);
      })
    );
    for (let j = 0; j < mapped.length; j++) {
      const item = mapped[j];
      if (!item) continue;
      if (screenSystemPrompt(item.system_prompt).decision === 'denied') {
        rejected += 1;
        continue;
      }
      results[i + j] = item;
    }
  }
  return { items: results.filter(Boolean), rejected };
}

export default async function handler(req, res) {
  cors(res, req);
  // Dynamic discovery — never let the browser serve a stale conditional-GET copy
  // (an earlier empty result must not mask a now-populated one via a 304).
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const done = log.startTimer(req, 'request', { method: req.method });
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  const rl = checkRateLimit({
    // A full repo load pages a few times (~3-6 calls); search is client-side and
    // no longer hits this endpoint. 20/min gives comfortable headroom.
    key: `github-agents-import:${getRateLimitIdentifier(req, user.id)}`,
    limit: 20,
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

  const parsedQuery = githubAgentsImportQuerySchema.safeParse(req.query || {});
  if (!parsedQuery.success) {
    done({ status: 400 });
    return jsonError(res, 400, parsedQuery.error.issues[0]?.message || 'Invalid query');
  }
  const { url, branch: branchOverride, offset, limit, q } = parsedQuery.data;

  let ref;
  try {
    ref = parseGithubUrl(url);
  } catch (err) {
    done({ status: 400 });
    return jsonError(res, 400, err.message || 'Invalid GitHub URL');
  }
  const branch = branchOverride || ref.branch || null;
  // Sub-path scoping comes ONLY from the repo URL (e.g. /tree/main/engineering).
  // We must NOT read a `path` query param here: the /api/app dispatcher already
  // uses `?path=<handler>` for routing, so a `path` query value is the handler
  // name, never a repo folder — reading it would filter every agent out.
  const subPath = ref.path || null;

  try {
    // Higher GitHub rate limit when a platform token is configured (public repos
    // work anonymously too). Never exposes the token to the client.
    let ghToken = null;
    try {
      const resolved = await resolveUserKey({
        userId: user.id,
        provider: 'dev:github',
        envVar: 'GITHUB_TOKEN',
        reason: 'github-agent-import',
      });
      ghToken = resolved?.key || null;
    } catch {
      ghToken = null;
    }

    const record = await getInventory({ owner: ref.owner, repo: ref.repo, branch, token: ghToken });

    // Path scoping + keyword filter over the cached inventory.
    let inventory = record.inventory;
    if (subPath) {
      const prefix = subPath.replace(/\/+$/, '');
      inventory = inventory.filter((e) => {
        const p = e.type === 'md' ? e.path : e.item._path;
        return p === prefix || p.startsWith(`${prefix}/`);
      });
    }
    const needle = norm(q || '');
    if (needle) inventory = inventory.filter((e) => e.searchText.includes(needle));

    const total = inventory.length;
    const pageSlice = inventory.slice(offset, offset + limit);
    const { items, rejected } = await hydratePage({
      owner: ref.owner,
      repo: ref.repo,
      branch: record.branch,
      page: pageSlice,
      repoUrl: record.repoUrl,
    });

    const warnings = [...record.warnings];
    if (total === 0) {
      warnings.push(
        'No agents found. Orqaly looks for front-matter markdown agents (name + description + body), ' +
          'orqaly.agents.json / .orqaly/agents/*.json, .claude/agents/*.md, *.agent.json/yaml, or CrewAI agents.yaml.'
      );
    }

    done({ status: 200 });
    return res.status(200).json({
      repo: {
        owner: ref.owner,
        repo: ref.repo,
        branch: record.branch,
        fullName: record.fullName,
        url: record.repoUrl,
      },
      items,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
      rejected,
      truncated: record.truncated,
      warnings,
      live: true,
    });
  } catch (err) {
    if (err?.status === 404) {
      done({ status: 404 });
      return jsonError(res, 404, err.message || 'Repository not found');
    }
    done({ status: err?.status === 502 ? 502 : 500 });
    return handleApiError(res, err, 'github-agents-import');
  }
}
