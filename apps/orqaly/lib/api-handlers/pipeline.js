/**
 * Pipeline handler — server-side operations for the request-to-report pipeline.
 * POST /api/app?path=pipeline&action=approve-job|record-performance|generate-report
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseUserClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('pipeline');

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'POST only');

  const done = log.startTimer(req, 'request', { method: req.method });

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  const rlKey = `pipeline:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  const client = buildSupabaseUserClient(token);
  if (!client) {
    done({ status: 503 });
    return jsonError(res, 503, 'Database not configured');
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const action = url.searchParams.get('action');

  try {
    if (action === 'approve-job') return await approveJob(req, res, client, user, done);
    if (action === 'record-performance') return await recordPerformance(req, res, client, done);
    if (action === 'generate-report') return await generateReport(req, res, client, user, done);
    done({ status: 400 });
    return jsonError(res, 400, `Unknown action: ${action}`);
  } catch (err) {
    log.error(req, 'unhandled', err);
    done({ status: 500 });
    return handleApiError(res, err, 'pipeline');
  }
}

// ── Helpers ──────────────────────────────────────────────────
function parseBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
}

// ── Approve / Reject Job ─────────────────────────────────────
async function approveJob(req, res, client, user, done) {
  const { jobId, decision } = parseBody(req);
  if (!jobId || !['approved', 'rejected'].includes(decision)) {
    done({ status: 400 });
    return jsonError(res, 400, 'jobId and decision (approved|rejected) required');
  }

  const { data: job } = await client
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) {
    done({ status: 404 });
    return jsonError(res, 404, 'Job not found');
  }

  if (decision === 'approved') {
    // 1. Mark job completed
    await client.from('jobs').update({
      status: 'completed',
      approval_status: 'approved',
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);

    // 2. Record agent performance (Improvement 1)
    if (job.assigned_agent_id) {
      const { data: tasks } = await client
        .from('team_tasks')
        .select('created_at, updated_at, status')
        .eq('job_pool_id', jobId);

      const doneTasks = (tasks || []).filter((t) => t.status === 'done');
      const completionTimeMs = doneTasks.length > 0
        ? new Date(doneTasks[doneTasks.length - 1].updated_at).getTime() -
          new Date(job.created_at).getTime()
        : 0;

      await upsertPerformance(client, {
        agentId: job.assigned_agent_id,
        qualityScore: 7,
        completionTimeMs,
        costUsd: Number(job.cost_usd || 0),
        success: true,
      });
    }

    // 3. Generate report
    const reportId = await createJobReport(client, job, user?.id);
    if (reportId) {
      await client.from('jobs').update({ report_id: reportId }).eq('id', jobId);
    }

    done({ status: 200 });
    return res.status(200).json({ approved: true, reportId: reportId || null });
  }

  // Rejected: reopen job, reset done tasks
  await client.from('jobs').update({
    approval_status: 'rejected',
    status: 'active',
    updated_at: new Date().toISOString(),
  }).eq('id', jobId);

  await client
    .from('team_tasks')
    .update({ status: 'inProgress', updated_at: new Date().toISOString() })
    .eq('job_pool_id', jobId)
    .eq('status', 'done');

  done({ status: 200 });
  return res.status(200).json({ rejected: true });
}

// ── Record Performance ───────────────────────────────────────
async function upsertPerformance(client, { agentId, qualityScore, completionTimeMs, costUsd, success }) {
  const { data: existing } = await client
    .from('agent_performance_metrics')
    .select('*')
    .eq('agent_id', agentId)
    .eq('period', 'all_time')
    .maybeSingle();

  if (existing) {
    const newCompleted = (existing.jobs_completed || 0) + (success ? 1 : 0);
    const newFailed = (existing.jobs_failed || 0) + (success ? 0 : 1);
    const total = newCompleted + newFailed;
    const newSuccessRate = total > 0 ? (newCompleted / total) * 100 : 0;
    const prevCompleted = existing.jobs_completed || 1;
    const newAvgQuality = existing.avg_quality_score > 0
      ? (Number(existing.avg_quality_score) * prevCompleted + (qualityScore || 0)) / (prevCompleted + 1)
      : qualityScore || 0;
    const newAvgCompletion = existing.avg_completion_ms > 0
      ? Math.round((existing.avg_completion_ms * prevCompleted + (completionTimeMs || 0)) / (prevCompleted + 1))
      : completionTimeMs || 0;
    // Reputation: 60% success rate (0-60) + 40% quality (0-10 → 0-40)
    const newReputation = Math.min(100, Math.max(0, newSuccessRate * 0.6 + newAvgQuality * 4));

    await client.from('agent_performance_metrics').update({
      jobs_completed: newCompleted,
      jobs_failed: newFailed,
      success_rate: newSuccessRate,
      avg_quality_score: newAvgQuality,
      avg_completion_ms: newAvgCompletion,
      total_cost_usd: Number(existing.total_cost_usd || 0) + (costUsd || 0),
      reputation_score: newReputation,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id);
  } else {
    await client.from('agent_performance_metrics').insert({
      agent_id: agentId,
      period: 'all_time',
      period_start: new Date().toISOString(),
      jobs_completed: success ? 1 : 0,
      jobs_failed: success ? 0 : 1,
      success_rate: success ? 100 : 0,
      avg_quality_score: qualityScore || 0,
      avg_completion_ms: completionTimeMs || 0,
      total_cost_usd: costUsd || 0,
      reputation_score: 50,
    });
  }
}

async function recordPerformance(req, res, client, done) {
  const { agentId, qualityScore, completionTimeMs, costUsd, success } = parseBody(req);
  if (!agentId) {
    done({ status: 400 });
    return jsonError(res, 400, 'agentId required');
  }

  await upsertPerformance(client, { agentId, qualityScore, completionTimeMs, costUsd, success });
  done({ status: 200 });
  return res.status(200).json({ recorded: true });
}

// ── Generate Report ──────────────────────────────────────────
async function createJobReport(client, job, userId) {
  const { data: tasks } = await client
    .from('team_tasks')
    .select('title, status, description, data, agent_id, created_at, updated_at, sequence_order')
    .eq('job_pool_id', job.id)
    .order('sequence_order', { ascending: true });

  const doneTasks = (tasks || []).filter((t) => t.status === 'done');
  const totalCost = doneTasks.reduce((sum, t) => sum + (t.data?.llmCost || 0), 0);

  // Build consolidated business document from all task outputs
  const consolidatedOutput = doneTasks
    .map((t, i) => `## ${i + 1}. ${t.title}\n\n${t.data?.output || 'No output generated.'}`)
    .join('\n\n---\n\n');

  const payload = {
    jobId: job.id,
    jobDescription: job.description,
    category: job.category,
    assignedAgent: job.assigned_agent_name || null,
    assignedAgentId: job.assigned_agent_id || null,
    totalTasks: (tasks || []).length,
    completedTasks: doneTasks.length,
    costUsd: totalCost || Number(job.cost_usd || 0),
    consolidatedOutput,
    tasks: (tasks || []).map((t) => ({
      title: t.title,
      status: t.status,
      description: t.description || '',
      deliverable: t.data?.deliverable || null,
      output: t.data?.output || null,
      cost: t.data?.llmCost || 0,
      model: t.data?.llmModel || null,
      duration: t.data?.llmDurationMs || 0,
    })),
    sourceRequestId: job.source_request_id || null,
    completedAt: new Date().toISOString(),
    createdAt: job.created_at,
  };

  const { data: report, error } = await client
    .from('report_snapshots')
    .insert({
      report_type: 'job_completion',
      filters: { jobId: job.id },
      version: '1.0',
      computed_at: new Date().toISOString(),
      ttl_seconds: 0,
      payload,
      ...(userId ? { user_id: userId } : {}),
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[pipeline] Report creation failed:', error.message);
    return null;
  }
  return report.id;
}

async function generateReport(req, res, client, user, done) {
  const { jobId } = parseBody(req);
  if (!jobId) {
    done({ status: 400 });
    return jsonError(res, 400, 'jobId required');
  }

  const { data: job } = await client
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) {
    done({ status: 404 });
    return jsonError(res, 404, 'Job not found');
  }

  const reportId = await createJobReport(client, job);
  if (reportId) {
    await client.from('jobs').update({ report_id: reportId }).eq('id', jobId);
  }

  done({ status: 200 });
  return res.status(200).json({ reportId: reportId || null });
}
