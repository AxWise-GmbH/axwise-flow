/**
 * Consilium Supervisor: active monitoring loop for all agents.
 *
 * POST /api/concilium?path=supervisor
 * Triggered periodically (cron/worker) or on-demand.
 *
 * For each active agent, checks:
 * - Cost breach → auto-pause
 * - Failure rate → auto-pause + alert
 * - Missed check-ins → auto-pause
 * - Security violations → terminate
 *
 * Handles in-flight jobs on pause (30s grace, then cancel).
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
import { clearJobLease, hasCompleteJobLease } from '../agent-handlers/job-lease-runtime.js';

const log = createLogger('consilium-supervisor');

const GRACE_PERIOD_MS = 30_000; // 30s grace for in-flight jobs

export default async function handler(req, res) {
  const safeReq = req && typeof req === 'object' ? req : {};
  if (!safeReq.headers) safeReq.headers = {};
  cors(res, safeReq);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'POST only');

  try {
    const token = getBearerToken(safeReq);
    const user = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Unauthorized');

    const rlKey = getRateLimitIdentifier(req, user.id);
    const rl = checkRateLimit({ key: rlKey, limit: 5, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    const endTimer = log.startTimer();

    // Load active agents for this user
    const { data: agents, error: agentsErr } = await admin
      .from('concilium_agents')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'accepted']);

    if (agentsErr) return handleApiError(res, agentsErr, 'supervisor:load-agents');

    if (!agents || agents.length === 0) {
      endTimer('supervisor:no-agents');
      return res.status(200).json({ message: 'No active agents', actions: [] });
    }

    // Load supervisor rules
    const { data: rules } = await admin
      .from('consilium_supervisor_rules')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    // Load rate limits for all agents
    const agentIds = agents.map((a) => a.id);
    const { data: rateLimits } = await admin
      .from('concilium_rate_limits')
      .select('*')
      .eq('user_id', user.id)
      .eq('entity_type', 'agent')
      .in('entity_id', agentIds);

    const rateLimitMap = {};
    for (const rl of rateLimits || []) {
      rateLimitMap[rl.entity_id] = rl;
    }

    // Check each agent
    const actions = [];
    const now = new Date();

    for (const agent of agents) {
      const issues = [];

      // 1. Cost breach check
      const agentRl = rateLimitMap[agent.id];
      if (agentRl) {
        const costBreachRule = (rules || []).find((r) => r.condition_type === 'cost_breach');
        const maxCost =
          costBreachRule?.threshold?.max_cost_day_usd || Number(agent.max_cost_per_day_usd) || 10;
        if (Number(agentRl.current_cost_day_usd) >= maxCost) {
          issues.push({
            type: 'cost_breach',
            severity: 'high',
            detail: `Daily cost $${agentRl.current_cost_day_usd} >= limit $${maxCost}`,
          });
        }
      }

      // 2. Missed check-ins
      const timeoutRule = (rules || []).find((r) => r.condition_type === 'timeout');
      const maxMissed = timeoutRule?.threshold?.max_missed_checkins || 3;
      if (agent.missed_check_ins >= maxMissed) {
        issues.push({
          type: 'timeout',
          severity: 'medium',
          detail: `${agent.missed_check_ins} missed check-ins (max: ${maxMissed})`,
        });
      }

      // 3. Check-in staleness
      if (agent.last_check_in) {
        const interval = agent.check_in_interval_ms || 300000;
        const staleSince = now.getTime() - new Date(agent.last_check_in).getTime();
        if (staleSince > interval * 3) {
          issues.push({
            type: 'timeout',
            severity: 'medium',
            detail: `Last check-in ${Math.round(staleSince / 60000)}min ago (interval: ${interval / 60000}min)`,
          });
        }
      }

      // 4. Security violations
      const { data: secEvents } = await admin
        .from('concilium_security_events')
        .select('id, severity')
        .eq('user_id', user.id)
        .gte('created_at', new Date(now.getTime() - 86400_000).toISOString())
        .in('severity', ['high', 'critical'])
        .limit(5);

      if (secEvents && secEvents.length > 0) {
        const secRule = (rules || []).find((r) => r.condition_type === 'security');
        if (secRule) {
          issues.push({
            type: 'security',
            severity: 'critical',
            detail: `${secEvents.length} security event(s) in last 24h`,
          });
        }
      }

      // Take action based on worst issue
      if (issues.length === 0) continue;

      const worstSeverity = issues.some((i) => i.severity === 'critical')
        ? 'critical'
        : issues.some((i) => i.severity === 'high')
          ? 'high'
          : 'medium';

      let action;
      if (worstSeverity === 'critical') {
        action = 'terminate';
      } else if (worstSeverity === 'high') {
        action = 'pause';
      } else {
        action = 'pause';
      }

      // Apply action
      const updates = {
        status: action === 'terminate' ? 'terminated' : 'paused',
        updated_at: now.toISOString(),
      };
      if (action === 'terminate') {
        updates.terminated_at = now.toISOString();
        updates.termination_reason = `Supervisor: ${issues.map((i) => i.detail).join('; ')}`;
      } else {
        updates.paused_at = now.toISOString();
      }

      await admin
        .from('concilium_agents')
        .update(updates)
        .eq('id', agent.id)
        .eq('user_id', user.id);

      // Handle in-flight jobs
      let cancelledJobs = 0;
      let reassignedJobs = 0;
      if (action === 'pause' || action === 'terminate') {
        cancelledJobs = await handleInFlightJobs(admin, agent, now);
        reassignedJobs = await reassignAgentJobs(admin, agent, agents, now);
      }

      // Create supervisor report
      await admin.from('concilium_agent_reports').insert({
        user_id: user.id,
        agent_id: agent.id,
        board_id: agent.board_id,
        report_type: 'supervisor_intervention',
        summary: `Agent ${action}d by Consilium Supervisor`,
        details: {
          action,
          issues,
          cancelled_jobs: cancelledJobs,
          reassigned_jobs: reassignedJobs,
          timestamp: now.toISOString(),
        },
        verified: true,
      });

      actions.push({
        agent_id: agent.id,
        agent_name: agent.name,
        action,
        issues,
        cancelled_jobs: cancelledJobs,
        reassigned_jobs: reassignedJobs,
      });

      log.warn(req, `supervisor.${action}`, { agentId: agent.id, issues });
    }

    endTimer('supervisor:run');

    return res.status(200).json({
      checked: agents.length,
      actions,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    return handleApiError(res, err, 'supervisor');
  }
}

/**
 * Handle in-flight jobs when pausing/terminating an agent.
 * 30s grace period: jobs running < 30s are allowed to finish.
 */
export async function handleInFlightJobs(admin, agent, now) {
  const { data: runningJobs } = await admin
    .from('agent_jobs')
    .select(
      'id, user_id, created_at, started_at, status, lease_token, heartbeat_at, lease_expires_at'
    )
    .eq('user_id', agent.user_id)
    .eq('status', 'running')
    .or(`payload->>agentId.eq.${agent.id},payload->>agent_id.eq.${agent.id}`);

  if (!runningJobs || runningJobs.length === 0) return 0;

  let cancelled = 0;
  for (const job of runningJobs) {
    const startedAt = new Date(job.started_at || job.created_at);
    const elapsed = now.getTime() - startedAt.getTime();

    if (elapsed > GRACE_PERIOD_MS) {
      if (!hasCompleteJobLease(job)) continue;
      const { data: revoked } = await admin
        .from('agent_jobs')
        .update({
          status: 'failed',
          error: 'Agent paused by Consilium Supervisor',
          finished_at: now.toISOString(),
          updated_at: now.toISOString(),
          ...clearJobLease(),
        })
        .eq('id', job.id)
        .eq('user_id', agent.user_id)
        .eq('status', 'running')
        .eq('lease_token', job.lease_token)
        .eq('lease_expires_at', job.lease_expires_at)
        .select('id')
        .maybeSingle();
      if (revoked?.id) cancelled++;
    }
  }

  return cancelled;
}

/**
 * Bridge 5: Reassign active jobs from a paused/terminated agent to the next best available agent.
 * Uses simple keyword overlap scoring (zero LLM cost).
 */
export async function reassignAgentJobs(admin, pausedAgent, allAgents, now) {
  const { data: activeJobs } = await admin
    .from('jobs')
    .select('id, description, requirements, category, assigned_agent_id')
    .eq('user_id', pausedAgent.user_id)
    .eq('assigned_agent_id', pausedAgent.id)
    .in('status', ['active', 'paused']);

  if (!activeJobs || activeJobs.length === 0) return 0;

  // Find other available agents (exclude the paused one)
  const available = allAgents.filter(
    (a) => a.id !== pausedAgent.id && ['active', 'accepted'].includes(a.status)
  );
  if (available.length === 0) return 0;

  let reassigned = 0;
  for (const job of activeJobs) {
    // Simple keyword overlap scoring
    const jobText =
      `${job.description || ''} ${job.requirements || ''} ${job.category || ''}`.toLowerCase();
    const jobWords = jobText.split(/\s+/).filter((w) => w.length > 2);

    let bestAgent = null;
    let bestScore = -1;

    for (const agent of available) {
      const agentText =
        `${agent.name || ''} ${agent.role || ''} ${(agent.capabilities || []).join(' ')} ${(agent.tools || []).join(' ')}`.toLowerCase();
      const matches = jobWords.filter((w) => agentText.includes(w)).length;
      const score = jobWords.length > 0 ? matches / jobWords.length : 0;
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    if (bestAgent) {
      await admin
        .from('jobs')
        .update({
          assigned_agent_id: bestAgent.id,
          assigned_agent_name: bestAgent.name || bestAgent.role || '',
          updated_at: now.toISOString(),
        })
        .eq('id', job.id)
        .eq('user_id', pausedAgent.user_id)
        .eq('assigned_agent_id', pausedAgent.id);
      reassigned++;
    }
  }

  return reassigned;
}
