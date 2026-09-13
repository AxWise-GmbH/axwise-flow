/**
 * research-github — Andrei Volkov's daily GitHub intelligence scan.
 *
 * Pulls trending AI-agent repos from GitHub REST, extracts a structured
 * offer per repo via a small LLM call, and writes new offers into the
 * Knowledge Base under category 'github-offer' so they show up in the
 * "Github offers" tab.
 *
 * Callable:
 *   POST /api/agent?path=research-github
 *     Authorization: Bearer <Supabase JWT>   — manual trigger by a user
 *     Body: { source?: 'manual' | 'cron', limit?: number, queries?: string[] }
 *
 *   GET  /api/agent?path=research-github
 *     Authorization: Bearer $CRON_SECRET     — Vercel cron trigger (future)
 *
 * NOTE: v1 handles manual triggers only. Cron wiring for a shared/system
 * user is a follow-up — see the plan file. For manual triggers, offers are
 * scoped to the requesting user (standard KB RLS).
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { executeLlmTracked } from '../usage-handlers/tracked-llm.js';
import { defaultProvider, defaultModel } from '../_shared/llm-defaults.js';

const log = createLogger('research-github');

const GH_API = 'https://api.github.com';
const DEFAULT_QUERIES = [
  'topic:ai-agents stars:>200',
  'topic:llm-agent stars:>100',
  'topic:autonomous-agents stars:>100',
  'topic:multi-agent stars:>100',
];
const DEFAULT_LIMIT = 5;

function ghHeaders() {
  const h = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'orchestratori-andrei-volkov',
  };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

async function searchRepos(query, perPage = 5) {
  const url = `${GH_API}/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=${perPage}`;
  const res = await fetchWithRetry(url, { headers: ghHeaders() }, { retries: 2 });
  if (!res.ok) throw new Error(`GitHub search ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

async function getReadme(owner, repo) {
  try {
    const res = await fetchWithRetry(
      `${GH_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
      { headers: ghHeaders() },
      { retries: 1 }
    );
    if (!res.ok) return '';
    const data = await res.json();
    if (!data?.content) return '';
    const decoded = Buffer.from(data.content, data.encoding || 'base64').toString('utf-8');
    return decoded.slice(0, 6000);
  } catch {
    return '';
  }
}

async function existingUrls(admin, userId) {
  const { data } = await admin
    .from('knowledge_documents')
    .select('url')
    .eq('user_id', userId)
    .eq('category', 'github-offer');
  return new Set((data || []).map((r) => (r.url || '').toLowerCase()).filter(Boolean));
}

/**
 * Extract { topic, benefits[] } from a repo + README using a small LLM call.
 * Returns null if parsing fails — caller will skip.
 */
async function extractOffer({ repo, readme, req, admin, userId }) {
  const userPrompt = [
    `Repo: ${repo.full_name}`,
    `Description: ${repo.description || '(none)'}`,
    `Primary language: ${repo.language || 'unknown'}`,
    `Topics: ${(repo.topics || []).join(', ') || 'none'}`,
    `Stars: ${repo.stargazers_count}`,
    '',
    '--- README (truncated) ---',
    readme || '(no readme)',
  ].join('\n');

  const systemPrompt = `You are extracting a structured "Github offer" for the Orqaly AI platform.
Return STRICT JSON only, no markdown fences. Shape:
{ "topic": string, "benefits": string[] }
Rules:
- topic: 2-5 word category label (e.g. "Multi-Agent Orchestration", "Long-Term Memory", "Tool Calling")
- benefits: 2-4 short phrases (<60 chars each) describing what Orqaly would GAIN by studying this repo. Concrete capabilities, not marketing claims.
- No hype words. No emojis. No trailing prose.`;

  const result = await executeLlmTracked({
    prompt: userPrompt,
    systemPrompt,
    provider: defaultProvider(),
    model: defaultModel(),
    temperature: 0.2,
    maxTokens: 300,
    req,
    usage: {
      admin,
      userId,
      source: 'research-github',
      operation: 'extract-offer',
    },
  });

  const raw = (result?.content || '').trim();
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    if (typeof parsed.topic !== 'string' || !Array.isArray(parsed.benefits)) return null;
    const benefits = parsed.benefits
      .filter((b) => typeof b === 'string' && b.trim())
      .map((b) => b.trim().slice(0, 120))
      .slice(0, 5);
    if (benefits.length === 0) return null;
    return { topic: parsed.topic.trim().slice(0, 80), benefits };
  } catch {
    return null;
  }
}

function buildDoc({ userId, repo, topic, description, benefits }) {
  return {
    user_id: userId,
    title: topic,
    content: description,
    source: 'andrei-volkov',
    category: 'github-offer',
    content_type: 'link',
    owner_type: 'user',
    tags: ['github-offer', 'github', 'research'],
    url: repo.html_url,
    url_meta: {
      title: repo.full_name,
      description: repo.description || '',
    },
    metadata: {
      topic,
      description,
      link: repo.html_url,
      benefits,
      stars: repo.stargazers_count || 0,
      language: repo.language || null,
      license: repo.license?.spdx_id || null,
      pushed_at: repo.pushed_at || null,
      source_agent: 'Andrei Volkov',
      captured_at: new Date().toISOString(),
    },
  };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonError(res, 405, 'Method not allowed');
  }

  const token = getBearerToken(req);
  const cronSecret = process.env.CRON_SECRET;
  const isCron = req.method === 'GET' && cronSecret && token === cronSecret;

  let userId = null;
  if (!isCron) {
    const user = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Unauthorized');
    userId = user.id;

    const rlKey = `research-github:${getRateLimitIdentifier(req, userId)}`;
    const rl = checkRateLimit({ key: rlKey, limit: 5, windowMs: 60 * 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded — try again later');
  } else {
    return jsonError(res, 501, 'Cron trigger not enabled yet — see plan file');
  }

  if (!process.env.GITHUB_TOKEN) {
    log.warn(req, 'research.github.no-token', {
      msg: 'Set GITHUB_TOKEN env var for 5000 req/hr limit',
    });
  }

  const done = log.startTimer(req, 'research-github.run', { userId });

  try {
    const body = req.body || {};
    const limit = Math.min(Math.max(parseInt(body.limit, 10) || DEFAULT_LIMIT, 1), 10);
    const queries =
      Array.isArray(body.queries) && body.queries.length > 0
        ? body.queries.slice(0, 6)
        : DEFAULT_QUERIES;

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    const seen = await existingUrls(admin, userId);

    const candidates = [];
    for (const q of queries) {
      try {
        const items = await searchRepos(q, Math.ceil(limit * 1.5));
        for (const item of items) {
          const url = (item.html_url || '').toLowerCase();
          if (!url || seen.has(url)) continue;
          if (candidates.find((c) => c.html_url === item.html_url)) continue;
          candidates.push(item);
          if (candidates.length >= limit * 2) break;
        }
      } catch (err) {
        log.warn(req, 'research.github.search.failed', { query: q, error: err.message });
      }
      if (candidates.length >= limit * 2) break;
    }

    const added = [];
    const errors = [];
    let skipped = 0;

    for (const repo of candidates) {
      if (added.length >= limit) break;
      try {
        const readme = await getReadme(repo.owner?.login, repo.name);
        const extracted = await extractOffer({ repo, readme, req, admin, userId });
        if (!extracted) {
          skipped++;
          continue;
        }
        const doc = buildDoc({
          userId,
          repo,
          topic: extracted.topic,
          description: repo.description || '(no description)',
          benefits: extracted.benefits,
        });
        const { error: insertErr } = await admin.from('knowledge_documents').insert(doc);
        if (insertErr) {
          errors.push({ repo: repo.full_name, error: insertErr.message });
          continue;
        }
        added.push({
          repo: repo.full_name,
          topic: extracted.topic,
          stars: repo.stargazers_count,
        });
      } catch (err) {
        errors.push({ repo: repo.full_name, error: err.message });
      }
    }

    skipped += Math.max(0, candidates.length - added.length - errors.length);

    done({ status: 200, added: added.length, skipped, errors: errors.length });
    return res.status(200).json({
      ok: true,
      added: added.length,
      skipped,
      errors,
      details: added,
    });
  } catch (err) {
    done({ status: 500, error: err.message });
    return handleApiError(res, err, 'research-github');
  }
}
