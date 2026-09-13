/**
 * Memory indexer: on goal completion, chunk the project_overview,
 * deliverables and decisions, embed each, and write rows into
 * public.goal_memory so future goals (same chain or same business_type)
 * can retrieve relevant prior context.
 */
import { createLogger } from '../../api/_lib/logger.js';
import { generateEmbedding } from '../_shared/embeddings.js';
import { createHash } from 'node:crypto';

const log = createLogger('memory.index');

function hashContent(s) {
  return createHash('sha256')
    .update(String(s || ''))
    .digest('hex')
    .slice(0, 32);
}

function classifyBusinessType(goal) {
  const lower = (goal.parsed_category || goal.title || '').toLowerCase();
  if (/landing|signup|launch/.test(lower)) return 'landing-launch';
  if (/saas|agency/.test(lower)) return 'saas-agency';
  if (/ecom|shop|store|product/.test(lower)) return 'ecommerce';
  if (/content|blog|seo|video/.test(lower)) return 'content';
  if (/research|analysis|report/.test(lower)) return 'research';
  return 'generic';
}

async function insertMemory(admin, { userId, goalId, businessType, kind, content, metadata = {} }) {
  if (!content || !content.trim()) return null;
  const contentHash = hashContent(content);
  // Skip if already indexed (same goal, same kind, same content).
  const { data: existing } = await admin
    .from('goal_memory')
    .select('id')
    .eq('user_id', userId)
    .eq('goal_id', goalId)
    .eq('kind', kind)
    .eq('content_hash', contentHash)
    .maybeSingle();
  if (existing) return existing.id;

  let embedding = null;
  try {
    embedding = await generateEmbedding(content);
  } catch (err) {
    log.warn(null, 'memory.embed.failed', { error: err.message, kind });
  }

  const { data, error } = await admin
    .from('goal_memory')
    .insert({
      user_id: userId,
      goal_id: goalId,
      business_type: businessType,
      kind,
      content: content.slice(0, 8000),
      content_hash: contentHash,
      embedding,
      metadata,
    })
    .select('id')
    .single();
  if (error) {
    log.warn(null, 'memory.insert.failed', { error: error.message, kind });
    return null;
  }
  return data?.id || null;
}

/**
 * Index everything we know about a completed goal. Idempotent — re-runs
 * are safe (content_hash dedupe).
 */
export async function indexCompletedGoal(admin, goal) {
  if (!goal?.id || !goal.user_id) return { ok: false, reason: 'missing goal id/user' };

  // Treat the passed goal as an identifier only. Completion can race with a
  // cancellation (and service-role callers bypass RLS), so indexing must be
  // authorized from the current, explicitly user-scoped source row instead
  // of trusting a stale or forged snapshot supplied by the caller.
  let sourceGoal = null;
  try {
    const { data, error } = await admin
      .from('goals')
      .select('id, user_id, status, title, parsed_category, data')
      .eq('id', goal.id)
      .eq('user_id', goal.user_id)
      .eq('status', 'completed')
      .maybeSingle();
    if (error) {
      log.warn(null, 'memory.source.read-failed', { goalId: goal.id, error: error.message });
      return { ok: false, reason: 'source goal lookup failed' };
    }
    sourceGoal = data;
  } catch (err) {
    log.warn(null, 'memory.source.read-failed', { goalId: goal.id, error: err.message });
    return { ok: false, reason: 'source goal lookup failed' };
  }

  if (
    !sourceGoal ||
    sourceGoal.id !== goal.id ||
    sourceGoal.user_id !== goal.user_id ||
    sourceGoal.status !== 'completed'
  ) {
    return { ok: false, reason: 'source goal is not currently completed by user' };
  }

  const businessType = classifyBusinessType(sourceGoal);
  const overview = sourceGoal.data?.project_overview || {};
  const inserts = [];

  // 1. Whole project overview as one searchable record
  const projectText = [
    sourceGoal.title,
    overview.one_liner,
    overview.summary,
    Array.isArray(overview.objectives_met)
      ? `Objectives: ${overview.objectives_met.join(' | ')}`
      : '',
    Array.isArray(overview.next_steps) ? `Next steps: ${overview.next_steps.join(' | ')}` : '',
    Array.isArray(overview.risks_or_gaps) ? `Risks: ${overview.risks_or_gaps.join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  if (projectText.trim()) {
    inserts.push(
      insertMemory(admin, {
        userId: sourceGoal.user_id,
        goalId: sourceGoal.id,
        businessType,
        kind: 'project_overview',
        content: projectText,
        metadata: { title: sourceGoal.title, completed_at: sourceGoal.data?.completed_at },
      })
    );
  }

  // 2. Each deliverable as a searchable record (title + description)
  for (const d of overview.deliverables || []) {
    const text = `${d.title || ''}\n${d.description || ''}\n${d.url ? `URL: ${d.url}` : ''}`.trim();
    if (text) {
      inserts.push(
        insertMemory(admin, {
          userId: sourceGoal.user_id,
          goalId: sourceGoal.id,
          businessType,
          kind: 'deliverable',
          content: text,
          metadata: { deliverable_type: d.type, url: d.url || null },
        })
      );
    }
  }

  // 3. Roadmap items as decisions (each top item is a strategic call)
  for (const r of (overview.roadmap || []).slice(0, 10)) {
    const text =
      `${r.title || ''}: ${r.description || ''} (impact ${r.impact}, effort ${r.effort}, ${r.timeframe || ''})`.trim();
    if (text) {
      inserts.push(
        insertMemory(admin, {
          userId: sourceGoal.user_id,
          goalId: sourceGoal.id,
          businessType,
          kind: 'decision',
          content: text,
          metadata: {
            category: r.category,
            impact: r.impact,
            effort: r.effort,
            timeframe: r.timeframe,
          },
        })
      );
    }
  }

  await Promise.all(inserts);
  log.info(null, 'memory.indexed', {
    goalId: sourceGoal.id,
    businessType,
    items: inserts.length,
  });
  return { ok: true, businessType, items: inserts.length };
}

/**
 * Record a single agent decision. Lightweight — no embedding, just the
 * structured row. Use when an agent picks an option that future runs
 * could learn from.
 */
export async function recordDecision(
  admin,
  { goalId, agentRole, decision, alternatives = null, rationale = null, inputs = null }
) {
  if (!goalId || !agentRole || !decision) return null;
  try {
    const { data, error } = await admin
      .from('agent_decisions')
      .insert({ goal_id: goalId, agent_role: agentRole, decision, alternatives, rationale, inputs })
      .select('id')
      .single();
    if (error) return null;
    return data?.id || null;
  } catch {
    return null;
  }
}
