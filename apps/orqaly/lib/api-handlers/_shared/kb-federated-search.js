/**
 * Federated "live" KB search. For each of the user's enabled LIVE connections,
 * query the source over its connection at read time and return lightweight hits
 * (title/url/source, live:true) - nothing is stored. Fail-soft: never throws, so
 * a live source being down never blocks local KB search.
 *
 * Only Notion is supported live today (BYOK key, no OAuth). Obsidian is
 * download-only; Google Drive live needs OAuth (not configured).
 */
import { resolveUserKey } from '../../security/resolve-user-key.js';
import { fetchWithRetry } from '../../../api/_lib/fetch.js';

async function searchNotionLive({ userId, query, limit }) {
  const resolved = await resolveUserKey({
    userId,
    provider: 'data:notion',
    reason: 'kb-live-search',
  }).catch(() => ({ key: null }));
  if (!resolved.key) return [];

  const res = await fetchWithRetry(
    'https://api.notion.com/v1/search',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolved.key}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, page_size: Math.min(limit, 10) }),
    },
    { timeoutMs: 8000, retries: 0 }
  );
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return (data.results || []).slice(0, limit).map((p) => ({
    title:
      p.properties?.title?.title?.[0]?.plain_text ||
      p.properties?.Name?.title?.[0]?.plain_text ||
      'Notion page',
    content: '',
    url: p.url || null,
    source: 'notion',
    live: true,
  }));
}

/**
 * @param {object} p
 * @param {object} p.admin  supabase admin client
 * @param {string} p.userId
 * @param {string} p.query
 * @param {number} [p.limit]
 * @returns {Promise<Array>} live hits (may be empty)
 */
export async function federatedLiveSearch({ admin, userId, query, limit = 5 }) {
  if (!admin || !userId || !query) return [];
  try {
    const { data: conns } = await admin
      .from('kb_connections')
      .select('source_type')
      .eq('user_id', userId)
      .eq('is_current', true)
      .eq('enabled', true)
      .eq('mode', 'live');
    const live = conns || [];
    if (!live.length) return [];

    const out = [];
    if (live.some((c) => c.source_type === 'notion')) {
      out.push(...(await searchNotionLive({ userId, query, limit }).catch(() => [])));
    }
    return out.slice(0, limit);
  } catch {
    return [];
  }
}
