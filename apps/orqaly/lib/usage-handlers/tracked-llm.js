/**
 * Tracked LLM executors — thin wrappers around executeLlm / executeLlmV2 that
 * record exactly one llm_usage row per call (success OR failure) via the shared
 * recordLlmUsage writer. This makes usage analytics cover every call site
 * uniformly and captures wasted spend on errors/timeouts (the columns added in
 * migration 159: status, error_type, finish_reason, cached_tokens).
 *
 * Drop-in replacements: identical opts and return value as the underlying
 * executor. Pass an extra `usage` context object to enable recording; omit it
 * (or its `admin` client) and the wrapper is a transparent passthrough, so it
 * is always safe to swap in.
 *
 *   await executeLlmV2Tracked({
 *     prompt, systemPrompt, provider, model,
 *     usage: {
 *       admin,                      // Supabase admin client (required to record)
 *       userId, goalId, jobId, taskId,
 *       organizationId, teamId, agentId, agentName, consiliumId,
 *       operation, source, description, phaseIndex,
 *       updateTask, updateGoalRollup, // forwarded to recordLlmUsage
 *       usingPlatformCredits,        // true for the capped "Use platform credits"
 *                                    // path — accumulates actual spend into the
 *                                    // platform_credit_usage ledger on success
 *                                    // (migration 186), read by the pre-flight
 *                                    // hard-cap check in resolve-user-key.js.
 *     },
 *   });
 *
 * Recording is best-effort and never throws — a failed insert must not break
 * the LLM call. On executor failure the wrapper records a status row, then
 * re-throws the original error so caller control flow is unchanged.
 * `usage.userId` also supplies the executor's BYOK user scope when no explicit
 * top-level `userId` is present; no other usage field is forwarded.
 */
import { executeLlm } from '../agent-handlers/llm-executor.js';
import { executeLlmV2 } from '../concilium-handlers/llm-executor-v2.js';
import { recordLlmUsage, extractTokenUsage } from '../goal-handlers/_helpers.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('tracked-llm');

// Markers the executors throw on their soft-timeout / pinned-timeout paths.
const TIMEOUT_MARKERS = ['LLM_SLOW_TIMEOUT', 'PINNED_TIMEOUT', 'did not respond'];

/** Classify a thrown executor error into a status + short error_type. */
export function classifyLlmError(err) {
  const msg = err?.message || String(err || '');
  const status = TIMEOUT_MARKERS.some((m) => msg.includes(m)) ? 'timeout' : 'error';
  let errorType;
  if (status === 'timeout') errorType = 'timeout';
  else if (/PLATFORM_CREDIT_LIMIT_EXCEEDED/.test(msg)) errorType = 'platform_credit_limit';
  else if (/BYOK_REQUIRED|API key not configured|SYSTEM_API_KEY_MISSING/i.test(msg))
    errorType = 'no_api_key';
  else if (/billing|credit balance|insufficient/i.test(msg)) errorType = 'billing';
  else if (/\b429\b|rate.?limit/i.test(msg)) errorType = 'rate_limit';
  else if (/\b403\b|access denied/i.test(msg)) errorType = 'access_denied';
  else if (/\b5\d\d\b/.test(msg)) errorType = 'server_error';
  else if (/\b4\d\d\b/.test(msg)) errorType = 'client_error';
  else errorType = 'llm_error';
  return { status, errorType };
}

async function recordSuccess(ctx, result) {
  const { admin, ...rest } = ctx;
  if (!admin || !result) return;
  const { promptTokens, completionTokens, totalTokens, cachedTokens } = extractTokenUsage(result);
  const estimatedCostUsd = Number(result.estimatedCostUsd || 0);
  try {
    await recordLlmUsage(admin, {
      ...rest,
      provider: result.provider || rest.provider || 'unknown',
      model: result.model || rest.model || 'unknown',
      promptTokens,
      completionTokens,
      totalTokens,
      cachedTokens,
      estimatedCostUsd,
      durationMs: Number(result.durationMs || 0),
      finishReason: result.finishReason || result.finish_reason || null,
      status: 'ok',
      errorType: null,
    });
  } catch (e) {
    log.warn(null, 'tracked-llm.record-success.failed', { error: e.message, source: rest.source });
  }
  if (rest.usingPlatformCredits && rest.userId) {
    await recordPlatformCreditsSpend(admin, rest.userId, estimatedCostUsd);
  }
}

/**
 * Accumulate actual spend into the platform_credit_usage running-total ledger
 * (migration 186). Best-effort — a failed write must not break the LLM call;
 * the pre-flight hard-cap check (resolve-user-key.js) fails CLOSED on its own
 * read, so an unrecorded call here is a rare undercount, never an overcount
 * that would falsely block a user.
 */
async function recordPlatformCreditsSpend(admin, userId, costUsd) {
  if (!costUsd || costUsd <= 0) return;
  try {
    const { data: existing, error: fetchErr } = await admin
      .from('platform_credit_usage')
      .select('total_cost_usd')
      .eq('user_id', userId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    const nextTotal = (existing ? Number(existing.total_cost_usd) || 0 : 0) + costUsd;
    const { error: upsertErr } = await admin
      .from('platform_credit_usage')
      .upsert({ user_id: userId, total_cost_usd: nextTotal, updated_at: new Date().toISOString() });
    if (upsertErr) throw upsertErr;
  } catch (e) {
    log.warn(null, 'tracked-llm.record-platform-credits-spend.failed', {
      error: e.message,
      userId,
    });
  }
}

async function recordFailure(ctx, err, durationMs) {
  const { admin, ...rest } = ctx;
  if (!admin) return;
  const { status, errorType } = classifyLlmError(err);
  try {
    await recordLlmUsage(admin, {
      ...rest,
      provider: rest.provider || 'unknown',
      model: rest.model || 'unknown',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      estimatedCostUsd: 0,
      durationMs: durationMs || 0,
      finishReason: null,
      status,
      errorType,
    });
  } catch (e) {
    log.warn(null, 'tracked-llm.record-failure.failed', { error: e.message, source: rest.source });
  }
}

function makeTracked(executor) {
  return async function trackedExecute(opts = {}) {
    const { usage: ctx, ...execOpts } = opts;
    // Goal-stage callers historically put the owner id in the usage context
    // because that is also what attributes the llm_usage row. The underlying
    // executors, however, need the same id at the top level to resolve the
    // owner's encrypted BYOK credential. Copy only this non-secret identifier;
    // never forward the usage/admin context or any credential material.
    //
    // An explicit executor userId remains authoritative (including an
    // explicit null, which some system callers use to opt out of user scope).
    const hasExplicitUserId = Object.prototype.hasOwnProperty.call(execOpts, 'userId');
    const effectiveUserId = hasExplicitUserId ? execOpts.userId : ctx?.userId;
    const effectiveExecOpts =
      !hasExplicitUserId && effectiveUserId !== undefined
        ? { ...execOpts, userId: effectiveUserId }
        : execOpts;

    // No recording context — skip recording after stripping `usage`; the
    // optional owner propagation above still applies for BYOK resolution.
    if (!ctx || !ctx.admin) return executor(effectiveExecOpts);

    // Carry the requested provider/model + caller's userId into the context so a
    // failure (which never returns a result) still attributes the row correctly.
    const baseCtx = {
      provider: execOpts.provider,
      model: execOpts.model,
      ...ctx,
      userId: effectiveUserId ?? null,
    };
    const startedAt = Date.now();
    let result;
    try {
      result = await executor(effectiveExecOpts);
    } catch (err) {
      await recordFailure(baseCtx, err, Date.now() - startedAt);
      throw err;
    }
    await recordSuccess(baseCtx, result);
    return result;
  };
}

export const executeLlmTracked = makeTracked(executeLlm);
export const executeLlmV2Tracked = makeTracked(executeLlmV2);
