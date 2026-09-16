/**
 * Memory retrieval: given a query string (typically the new goal's title +
 * description), return the top-K most-similar memories from prior goals
 * for the same user, ranked by cosine similarity on the embedding.
 *
 * Falls back to recency-only retrieval when pgvector cosine is not
 * available (e.g. local dev without the extension).
 */
import { createLogger } from '../../api/_lib/logger.js';
import { generateEmbedding } from '../_shared/embeddings.js';

const log = createLogger('memory.retrieve');

function candidateRows(rows, { userId, kinds, excludeGoalId }) {
  return (rows || [])
    .filter((row) => row?.goal_id)
    .filter((row) => row.user_id === undefined || row.user_id === userId)
    .filter((row) => !excludeGoalId || row.goal_id !== excludeGoalId)
    .filter((row) => !kinds || kinds.includes(row.kind));
}

function publicMemoryRow(row) {
  const { user_id: _userId, goals: _sourceGoal, ...memory } = row;
  return memory;
}

async function validateRpcSourceGoals(admin, rows, userId) {
  const goalIds = [...new Set(rows.map((row) => row.goal_id))];
  if (goalIds.length === 0) return { ok: true, rows: [] };

  try {
    const { data, error } = await admin
      .from('goals')
      .select('id, user_id, status')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .in('id', goalIds);
    if (error) {
      log.warn(null, 'retrieve.source-validation.failed', { error: error.message });
      return { ok: false, rows: [] };
    }
    const eligibleGoalIds = new Set(
      (data || [])
        .filter((goal) => goal.user_id === userId && goal.status === 'completed')
        .map((goal) => goal.id)
    );
    return {
      ok: true,
      rows: rows.filter((row) => eligibleGoalIds.has(row.goal_id)).map(publicMemoryRow),
    };
  } catch (err) {
    log.warn(null, 'retrieve.source-validation.failed', { error: err.message });
    return { ok: false, rows: [] };
  }
}

function fallbackSourceIsEligible(row, userId) {
  const embedded = Array.isArray(row.goals) ? row.goals : [row.goals];
  return (
    row.user_id === userId &&
    embedded.some(
      (goal) => goal?.id === row.goal_id && goal.user_id === userId && goal.status === 'completed'
    )
  );
}

/**
 * @param {object} params
 * @param {string} params.userId
 * @param {string} [params.businessType]   Limit retrieval to this class (optional).
 * @param {string} params.query             The text to embed and match against.
 * @param {number} [params.k]               Top-K (default 8).
 * @param {string[]} [params.kinds]         Filter by memory kinds (default all).
 * @param {string}   [params.excludeGoalId] Don't return memories from this goal.
 */
export async function retrieveRelevant(
  admin,
  { userId, businessType, query, k = 8, kinds, excludeGoalId }
) {
  if (!userId || !query) return [];

  let queryEmbedding = null;
  try {
    queryEmbedding = await generateEmbedding(query.slice(0, 1024));
  } catch (err) {
    log.warn(null, 'retrieve.embed.failed', { error: err.message });
  }

  // Try pgvector RPC if available. Otherwise fall back to a plain SELECT
  // ordered by recency — still better than nothing.
  if (queryEmbedding) {
    try {
      const { data, error } = await admin.rpc('match_goal_memory', {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_business_type: businessType || null,
        match_count: k,
      });
      if (!error && Array.isArray(data)) {
        const filtered = candidateRows(data, { userId, kinds, excludeGoalId });
        const validated = await validateRpcSourceGoals(admin, filtered, userId);
        if (validated.ok) return validated.rows.slice(0, k);
      }
    } catch {
      // RPC may not exist yet — fall through.
    }
  }

  // Fallback: recency-ordered. Same shape as the RPC return.
  let q = admin
    .from('goal_memory')
    .select(
      'id, user_id, goal_id, kind, content, metadata, created_at, business_type, goals!inner(id, user_id, status)'
    )
    .eq('user_id', userId)
    .eq('goals.user_id', userId)
    .eq('goals.status', 'completed')
    .order('created_at', { ascending: false })
    .limit(k * 3);
  if (businessType) q = q.eq('business_type', businessType);
  if (kinds) q = q.in('kind', kinds);
  const { data, error } = await q;
  if (error) {
    log.warn(null, 'retrieve.fallback.failed', { error: error.message });
    return [];
  }
  return candidateRows(data, { userId, kinds, excludeGoalId })
    .filter((row) => fallbackSourceIsEligible(row, userId))
    .map(publicMemoryRow)
    .slice(0, k);
}

/**
 * Format retrieved memories as a markdown block that can be prepended to
 * an LLM prompt. Stays compact — at most ~4000 chars total.
 */
export function formatMemoriesForPrompt(memories) {
  if (!memories || memories.length === 0) return '';
  const lines = [
    '## Past relevant context (from completed goals)',
    "Use this to avoid re-discovering what already worked or didn't. Reference past decisions when relevant.",
    '',
  ];
  let budget = 3500;
  for (const m of memories) {
    const header = `- (${m.kind}${m.business_type ? `, ${m.business_type}` : ''})`;
    const snippet = m.content.slice(0, 360);
    const line = `${header} ${snippet}`;
    if (budget - line.length < 0) break;
    budget -= line.length;
    lines.push(line);
  }
  return lines.join('\n');
}
