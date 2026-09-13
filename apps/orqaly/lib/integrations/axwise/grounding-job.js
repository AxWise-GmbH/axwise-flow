import { randomUUID } from 'node:crypto';
import { buildCopilotGroundContext } from './context.js';
import { withAxwiseTracked } from './tracked.js';
import { enqueueAgentJob } from '../../goal-handlers/_helpers.js';

function boundText(value, limit = 12_000) {
  const text = String(value || '');
  return text.length > limit ? text.slice(0, limit) : text;
}

export async function enqueueAxwiseGroundJob(
  admin,
  { userId, tenant, organizationId = null, draftAnswer, sources = [] },
  { env = process.env, triggerProcessNextImpl } = {}
) {
  if (!admin || !userId || !tenant?.userId || !tenant?.orgId || !draftAnswer) {
    return { queued: false, reason: 'invalid-grounding-payload' };
  }

  const payload = {
    type: 'axwise-ground',
    requestId: randomUUID(),
    userId,
    _userId: userId,
    user_id: userId,
    tenant: {
      userId: tenant.userId,
      _userId: tenant.userId,
      user_id: tenant.userId,
      orgId: tenant.orgId,
    },
    organizationId: organizationId || null,
    draftAnswer: boundText(draftAnswer),
    sources: Array.isArray(sources) ? sources.slice(0, 20) : [],
  };
  const job = await enqueueAgentJob(
    admin,
    { user_id: userId, payload },
    {
      env,
      ...(triggerProcessNextImpl ? { triggerProcessNextImpl } : {}),
    }
  );
  return { queued: true, requestId: payload.requestId, jobId: job.id };
}

async function requireOwnedOrganization(admin, organizationId, userId) {
  if (!organizationId || organizationId === userId) return;
  const { data, error } = await admin
    .from('organizations')
    .select('id')
    .eq('id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) {
    throw new Error(`AxWise grounding organization is not owned by agent_jobs.user_id`);
  }
}

export async function handleAxwiseGroundJob(admin, payload, job = null) {
  if (!payload?.requestId || !payload?.tenant?.userId || !payload?.tenant?.orgId) {
    throw new Error('AxWise grounding job is missing tenant or request context');
  }

  const durableUserId = typeof job?.user_id === 'string' ? job.user_id.trim() : '';
  if (!durableUserId) throw new Error('AxWise grounding job requires durable user owner');
  for (const field of ['_userId', 'userId', 'user_id']) {
    if (Object.hasOwn(payload.tenant, field) && payload.tenant[field] !== durableUserId) {
      throw new Error(`AxWise grounding tenant.${field} owner mismatch`);
    }
  }

  const tenantOrgId = String(payload.tenant.orgId || '').trim();
  const organizationId = String(payload.organizationId || '').trim() || null;
  if (organizationId && organizationId !== tenantOrgId) {
    throw new Error('AxWise grounding organization context mismatch');
  }
  await requireOwnedOrganization(admin, tenantOrgId, durableUserId);

  const result = await withAxwiseTracked(
    buildCopilotGroundContext({
      requestId: payload.requestId,
      tenant: payload.tenant,
      draftAnswer: boundText(payload.draftAnswer),
      sources: Array.isArray(payload.sources) ? payload.sources.slice(0, 20) : [],
    }),
    () => ({ processedOutputs: {} }),
    {
      posture: 'open',
      admin,
      userId: durableUserId,
      organizationId,
    }
  );

  if (result?.degraded) {
    throw new Error('AxWise grounding degraded; retrying durable job');
  }

  return {
    type: 'axwise-ground',
    status: result?.skipped ? 'skipped' : 'grounded',
    requestId: payload.requestId,
    traceId: result?.meta?.traceId || null,
  };
}
