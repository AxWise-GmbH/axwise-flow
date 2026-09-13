/**
 * agent-tool-scout — decide which tools an agent should carry.
 *
 * POST /api/concilium?path=agent-tool-scout
 *   { agent_ids?: string[], all_untooled?: boolean, dry_run?: boolean, limit?: number }
 *   -> { scouted: [{ agent_id, name, picked, needs_credential }], hasMore, remaining, dryRun }
 *
 * Why: agents imported from third-party libraries are pure system prompts — they
 * declare no Orqaly tool ids, so `metadata.tools` lands empty and the agent can
 * only think, never act. Nothing else in the platform assigns tools to an agent:
 * tool-provisioning works per GOAL, from task tool_requirements, and explicitly
 * refuses to infer ("those over-suggest tools"). This fills that gap per AGENT,
 * once, cached in the row.
 *
 * Safety notes:
 *  - `tool-*` ids are always offerable. Composio (`mcp-*`) ids are offered only
 *    when a platform COMPOSIO_API_KEY is set (else picking one hands the agent a
 *    guaranteed failure) AND never to third-party agents — Composio actions run
 *    outward under the user's own OAuth identity, so they carry the same
 *    can't-be-undone risk as WRITE_TOOLS below.
 *  - `tool-http-client` is withheld: `url`/`method`/`headers`/`body` are entirely
 *    LLM-controlled with no scheme check, allowlist or private-IP block
 *    (tool-runner.js:367-386). Its name is a magnet for capability matching, and
 *    these agents' prompts come from public repos nobody here has read.
 *  - Every returned id is validated against the catalog; hallucinations are dropped.
 *  - The response reports which picks lack a credential. It never returns a key.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import {
  checkRateLimit,
  applyRateLimitHeaders,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { agentToolScoutSchema } from '../../api/_lib/validate.js';
import { PREDEFINED_TOOLS } from '../../src/config/predefinedTools.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';
import { defaultProvider, defaultCheapModel } from '../_shared/llm-defaults.js';
import { parseLlmJson } from '../agent-handlers/llm-executor.js';
import { resolveToolCredential } from '../agent-handlers/tool-credentials.js';
import { isComposioConfigured } from '../composio/client.js';

const log = createLogger('agent-tool-scout');

// Serverless timeout guard: each agent costs one LLM round trip.
const MAX_PER_REQUEST = 25;
const MIN_PICKS = 3;
const MAX_PICKS = 8;

/** Ids the scout must never hand out to anyone, regardless of how well they match. */
const WITHHELD = new Set(['tool-http-client']);

/**
 * Tools that act outward under the user's own identity, and cannot be undone:
 * commits and pull requests on their GitHub, mail from their domain, deploys.
 *
 * Withheld from any agent whose prompt came from outside. The chain we refuse is
 * untrusted instructions (10k+ lines of third-party system prompt nobody here has
 * read) + untrusted input (these agents read the live web via tool-web-search /
 * tool-browser, and content-guard is NOT wired into the execution path) + write
 * access. Any two of those is survivable; all three is not.
 *
 * First-party agents may hold them — their prompts are the user's own.
 */
const WRITE_TOOLS = new Set(['tool-github', 'tool-email', 'tool-vercel']);

/** True when the agent's prompt came from a third-party library rather than the user. */
export function isThirdParty(agent) {
  return Boolean(agent?.metadata?.imported_from);
}

/**
 * The tools the scout may choose from FOR THIS AGENT.
 * Filtered per agent, not globally, so a re-run cannot silently re-grant a write
 * tool that was pruned — the guard travels with the agent, not the batch.
 */
export function scoutableTools(agent) {
  const denyWrite = isThirdParty(agent);
  const composioReady = isComposioConfigured();
  return PREDEFINED_TOOLS.filter((t) => {
    const isPlatform = t.id.startsWith('tool-');
    const isComposio = t.id.startsWith('mcp-');
    if (!isPlatform && !isComposio) return false;
    if (WITHHELD.has(t.id)) return false;
    // Composio: only when the platform key is set, and never for third-party
    // agents (they act outward under the user's identity — same risk as writes).
    if (isComposio && (!composioReady || denyWrite)) return false;
    if (denyWrite && WRITE_TOOLS.has(t.id)) return false;
    return true;
  });
}

export function catalogSummaryForScout(agent) {
  return scoutableTools(agent)
    .map((t) => `${t.id}: ${t.name} — ${(t.description || '').slice(0, 120)}`)
    .join('\n');
}

export function buildScoutPrompt(agent) {
  const prompt = String(agent?.metadata?.system_prompt || '').slice(0, 1500);
  return [
    `Agent role: ${agent.name}`,
    agent.category ? `Division: ${agent.category}` : '',
    agent.description ? `Description: ${agent.description}` : '',
    prompt ? `How it works:\n${prompt}` : '',
    '',
    'Available tools:',
    catalogSummaryForScout(agent),
    '',
    `Pick the ${MIN_PICKS}-${MAX_PICKS} tools this agent would genuinely use to do its job.`,
    'Choose only from the ids listed above. Do not invent ids. Fewer, well-matched tools beat more.',
    'Respond with JSON only: {"tool_ids":["tool-x","tool-y"],"reason":"one sentence"}',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Keep only ids allowed for THIS agent. Narrowing the prompt is not a control —
 * the model can still name anything — so the same per-agent filter is enforced
 * here, on the way out. A hallucinated or withheld id must never reach
 * metadata.tools: toolkit-resolver pushes agent tools through unconditionally,
 * bypassing every credential and status check downstream.
 */
export function validatePicks(ids, agent) {
  const allowed = new Set(scoutableTools(agent).map((t) => t.id));
  const seen = new Set();
  const picked = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id !== 'string' || !allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    picked.push(id);
    if (picked.length >= MAX_PICKS) break;
  }
  return picked;
}

export default async function handler(req, res) {
  const safeReq = req && typeof req === 'object' ? req : {};
  if (!safeReq.headers) safeReq.headers = {};
  cors(res, safeReq);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const user = await verifySupabaseToken(getBearerToken(safeReq));
    if (!user) return jsonError(res, 401, 'Unauthorized');

    // One LLM call per agent, up to 25 per request — costlier than plain CRUD.
    const rl = checkRateLimit({
      key: `agent-tool-scout:${getRateLimitIdentifier(req, user.id)}`,
      limit: 10,
      windowMs: 60_000,
    });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');

    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    const parsed = agentToolScoutSchema.safeParse(req.body || {});
    if (!parsed.success)
      return jsonError(res, 400, parsed.error.issues[0]?.message || 'Invalid body');
    const { agent_ids: agentIds, all_untooled: allUntooled, dry_run: dryRun, limit } = parsed.data;

    if (!agentIds?.length && !allUntooled) {
      return jsonError(res, 400, 'Provide agent_ids or set all_untooled');
    }

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    // Always scoped to the caller: an agent id is not a capability.
    let query = admin
      .from('agents')
      .select('id, name, description, category, metadata')
      .eq('user_id', user.id);
    if (agentIds?.length) query = query.in('id', agentIds);

    const { data: allAgents, error: loadErr } = await query;
    if (loadErr) return handleApiError(res, loadErr, 'agent-tool-scout:load');

    const candidates = (allAgents || []).filter((a) =>
      allUntooled ? !(a.metadata?.tools || []).length : true
    );
    const batch = candidates.slice(0, Math.min(limit, MAX_PER_REQUEST));

    const scouted = [];
    for (const agent of batch) {
      let picked = [];
      let reason = '';
      try {
        const result = await executeLlmV2Tracked({
          prompt: buildScoutPrompt(agent),
          systemPrompt:
            'You match AI agents to the tools they need. You answer with JSON only, choosing exclusively from the supplied tool ids.',
          provider: defaultProvider(),
          model: defaultCheapModel(),
          temperature: 0.2,
          maxTokens: 400,
          jsonMode: true,
          usage: {
            admin,
            userId: user.id,
            agentId: agent.id,
            agentName: agent.name,
            source: 'agent-tool-scout',
            operation: 'tool-match',
          },
        });
        const json = parseLlmJson(result?.content) || {};
        picked = validatePicks(json.tool_ids, agent);
        reason = typeof json.reason === 'string' ? json.reason.slice(0, 200) : '';
      } catch (err) {
        log.warn(req, 'scout.llm-failed', { agentId: agent.id, error: err.message });
        scouted.push({
          agent_id: agent.id,
          name: agent.name,
          picked: [],
          needs_credential: [],
          error: 'llm_failed',
        });
        continue;
      }

      // Which picks cannot actually run yet, so the caller knows what to connect.
      // resolveToolCredential returns the key; we deliberately keep only `ready`.
      const needsCredential = [];
      for (const id of picked) {
        const def = PREDEFINED_TOOLS.find((d) => d.id === id);
        const { data: row } = await admin
          .from('tools')
          .select('data')
          .eq('id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        const cred = await resolveToolCredential({ def, row, userId: user.id });
        if (!cred.ready) needsCredential.push(id);
      }

      if (!dryRun && picked.length) {
        const { error: updErr } = await admin
          .from('agents')
          .update({
            metadata: { ...(agent.metadata || {}), tools: picked },
            updated_at: new Date().toISOString(),
          })
          .eq('id', agent.id)
          .eq('user_id', user.id);
        if (updErr)
          log.warn(req, 'scout.update-failed', { agentId: agent.id, error: updErr.message });
      }

      scouted.push({
        agent_id: agent.id,
        name: agent.name,
        picked,
        reason,
        needs_credential: needsCredential,
      });
    }

    return res.status(200).json({
      scouted,
      dryRun: Boolean(dryRun),
      hasMore: candidates.length > batch.length,
      remaining: Math.max(0, candidates.length - batch.length),
    });
  } catch (err) {
    return handleApiError(res, err, 'agent-tool-scout');
  }
}
