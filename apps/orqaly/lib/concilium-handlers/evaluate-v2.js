/**
 * Evaluate v2 handler: wraps the evaluation engine with Phase 1 guards.
 * Called by process-next.js for concilium-evaluate jobs on v2 boards.
 */
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { createLogger } from '../../api/_lib/logger.js';
import { checkConciliumRateLimit } from './rate-limit-check.js';
import { scanInput } from './security-scanner.js';
import { analyzeRequest } from './fraud-detector.js';
import { recordUsage } from './cost-tracker.js';
import { loadOwnedConciliumBoard, runEvaluation } from './evaluation-engine.js';

const log = createLogger('evaluate-v2');

/**
 * Check if a board has v2 members configured.
 * If it does, use the v2 engine. Otherwise fall back to v1.
 */
export async function hasV2Members(admin, conciliumId, expectedUserId) {
  const userId = typeof expectedUserId === 'string' ? expectedUserId.trim() : '';
  const boardId = typeof conciliumId === 'string' ? conciliumId.trim() : '';
  if (!userId) throw new Error('Concilium member lookup requires an expected user owner');
  if (!admin || !boardId) throw new Error('Concilium member lookup requires a board id');

  const { count, error } = await admin
    .from('concilium_members')
    .select('id', { count: 'exact', head: true })
    .eq('concilium_id', boardId)
    .eq('user_id', userId)
    .eq('active', true)
    .eq('quarantined', false);
  if (error) throw new Error(`Unable to inspect Concilium members: ${error.message}`);
  return (count || 0) > 0;
}

/**
 * Run concilium evaluation v2 with all guards.
 */
export async function handleConciliumEvaluateV2(payload, req, runtimeAdmin = null) {
  const { conciliumId: requestedConciliumId, jobId, jobDescription, agentOutput } = payload;
  const conciliumId = typeof requestedConciliumId === 'string' ? requestedConciliumId.trim() : '';
  if (!conciliumId) throw new Error('Missing conciliumId in payload');
  if (!agentOutput) throw new Error('Missing agentOutput in payload');

  const admin = runtimeAdmin || buildSupabaseAdminClient();
  const userId = typeof payload._userId === 'string' ? payload._userId.trim() : '';
  if (!userId) throw new Error('Concilium evaluation requires an expected user owner');
  if (!admin) throw new Error('Database not configured');

  // Service-role reads and rate-limit mutations must not run until the board
  // is proven to belong to the durable queue owner.
  await loadOwnedConciliumBoard(admin, conciliumId, userId);

  // ── Phase 1 guard: rate limit check ──
  const rlResult = await checkConciliumRateLimit(admin, {
    entityType: 'board',
    entityId: conciliumId,
    userId,
    req,
  });
  if (!rlResult.allowed) {
    log.warn('eval-v2.rate_limited', { conciliumId, reason: rlResult.reason });
    throw new Error(`Rate limit exceeded: ${rlResult.reason}`);
  }

  // User-level rate limit check
  await loadOwnedConciliumBoard(admin, conciliumId, userId);
  const userRl = await checkConciliumRateLimit(admin, {
    entityType: 'user',
    entityId: userId,
    userId,
    req,
  });
  if (!userRl.allowed) {
    log.warn('eval-v2.user_rate_limited', { userId, reason: userRl.reason });
    throw new Error(`User rate limit exceeded: ${userRl.reason}`);
  }

  // ── Phase 1 guard: security scan ──
  await loadOwnedConciliumBoard(admin, conciliumId, userId);
  const inputContent = typeof agentOutput === 'string' ? agentOutput : JSON.stringify(agentOutput);
  const scanResult = await scanInput(admin, {
    content: inputContent,
    boardId: conciliumId,
    userId,
    req,
  });
  if (!scanResult.safe) {
    const threatTypes = scanResult.threats.map((t) => t.type).join(', ');
    log.warn('eval-v2.security_blocked', { conciliumId, threats: threatTypes });
    throw new Error(`Security scan failed: ${threatTypes}`);
  }

  // ── Run v2 evaluation engine ──
  await loadOwnedConciliumBoard(admin, conciliumId, userId);
  const result = await runEvaluation(admin, {
    conciliumId,
    jobId,
    jobDescription,
    agentOutput,
    userId,
  });

  // ── Phase 1 guard: track cost + fraud analysis (post-execution) ──
  await loadOwnedConciliumBoard(admin, conciliumId, userId);
  await recordUsage(admin, {
    entityType: 'board',
    entityId: conciliumId,
    tokensUsed: result.usage?.totalTokens || 0,
    costUsd: result.estimatedCostUsd || 0,
    req,
  });

  await loadOwnedConciliumBoard(admin, conciliumId, userId);
  await recordUsage(admin, {
    entityType: 'user',
    entityId: userId,
    tokensUsed: result.usage?.totalTokens || 0,
    costUsd: result.estimatedCostUsd || 0,
    req,
  });

  // Fraud analysis (async, non-blocking)
  await loadOwnedConciliumBoard(admin, conciliumId, userId);
  analyzeRequest(admin, {
    entityType: 'board',
    entityId: conciliumId,
    userId,
    boardId: conciliumId,
    requestCostUsd: result.estimatedCostUsd || 0,
    requestFailed: !result.consensus?.approved,
    req,
  }).catch((err) => {
    log.warn('eval-v2.fraud_analysis.error', { error: err.message });
  });

  return result;
}
