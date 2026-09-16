import { cors } from '../../api/_lib/cors.js';
import { getBearerToken, verifySupabaseToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { enqueueAgentJob } from '../goal-handlers/_helpers.js';
import { checkQuotas } from '../security/user-quotas.js';

const ACTIONS = new Set(['start', 'preview', 'synthesize']);
const COST_PREFERENCES = new Set(['free_only', 'free_first', 'best_quality']);

function parseBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body && typeof req.body === 'object' ? req.body : {};
}

function applyOrganizationScope(query, organizationId) {
  return organizationId
    ? query.eq('organization_id', organizationId)
    : query.is('organization_id', null);
}

async function loadOwnedOrganization(admin, userId, organizationId) {
  if (!organizationId) return true;
  const { data, error } = await admin
    .from('organizations')
    .select('id')
    .eq('id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function authorizePayload(admin, userId, action, body) {
  const requestedOrganizationId = body.organizationId || null;

  if (action === 'start') {
    if (!(await loadOwnedOrganization(admin, userId, requestedOrganizationId))) {
      return { status: 404, error: 'Organization not found' };
    }
    return {
      payload: {
        type: 'library-calibration',
        phase: 'start',
        costPreference: COST_PREFERENCES.has(body.costPreference)
          ? body.costPreference
          : 'free_first',
        organizationId: requestedOrganizationId,
      },
    };
  }

  if (action === 'preview') {
    const sampleId = typeof body.sampleId === 'string' ? body.sampleId.trim() : '';
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
    if (!sampleId || !comment) return { status: 400, error: 'sampleId and comment are required' };

    let query = admin
      .from('knowledge_documents')
      .select('id, user_id, organization_id')
      .eq('id', sampleId)
      .eq('category', 'calibration_sample')
      .eq('user_id', userId);
    if (Object.hasOwn(body, 'organizationId')) {
      query = applyOrganizationScope(query, requestedOrganizationId);
    }
    const { data: sample, error } = await query.maybeSingle();
    if (error) throw error;
    if (!sample) return { status: 404, error: 'Calibration sample not found' };

    return {
      payload: {
        type: 'library-calibration',
        phase: 'preview',
        sampleId: sample.id,
        comment,
        iteration: Math.max(1, Math.min(100, Number(body.iteration) || 1)),
        preferredTool:
          typeof body.preferredTool === 'string' ? body.preferredTool.slice(0, 100) : null,
        organizationId: sample.organization_id || null,
      },
    };
  }

  const calibrationRunId =
    typeof body.calibrationRunId === 'string' ? body.calibrationRunId.trim() : '';
  if (!calibrationRunId) return { status: 400, error: 'calibrationRunId is required' };
  let query = admin
    .from('knowledge_documents')
    .select('id, user_id, organization_id')
    .eq('category', 'calibration_sample')
    .eq('metadata->>calibration_run_id', calibrationRunId)
    .eq('user_id', userId);
  if (Object.hasOwn(body, 'organizationId')) {
    query = applyOrganizationScope(query, requestedOrganizationId);
  }
  const { data: sample, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  if (!sample) return { status: 404, error: 'Calibration run not found' };
  return {
    payload: {
      type: 'library-calibration',
      phase: 'synthesize',
      calibrationRunId,
      organizationId: sample.organization_id || null,
    },
  };
}

export default async function handler(req, res) {
  cors(res, req);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'POST only');

  try {
    const user = await verifySupabaseToken(getBearerToken(req));
    if (!user) return jsonError(res, 401, 'Unauthorized');

    const rl = checkRateLimit({
      key: `library-calibration:${getRateLimitIdentifier(req, user.id)}`,
      limit: 15,
      windowMs: 60_000,
    });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');

    const action = String(req.query?.action || '')
      .trim()
      .toLowerCase();
    if (!ACTIONS.has(action)) return jsonError(res, 400, 'Invalid calibration action');
    const body = parseBody(req);
    if (!body) return jsonError(res, 400, 'Invalid JSON body');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Agent jobs not configured');
    const authorization = await authorizePayload(admin, user.id, action, body);
    if (!authorization.payload) {
      return jsonError(res, authorization.status, authorization.error);
    }

    const quota = await checkQuotas(admin, user.id, { jobType: 'library-calibration' });
    if (!quota.allowed) {
      return res.status(429).json({
        error: quota.message,
        code: quota.code,
        quotas: quota.quotas,
        usage: quota.usage,
      });
    }

    const payload = {
      ...authorization.payload,
      _userId: user.id,
      userId: user.id,
      user_id: user.id,
      _ts: Date.now(),
    };
    const job = await enqueueAgentJob(admin, { user_id: user.id, payload });
    return res.status(202).json({
      job_id: job.id,
      status: job.status,
      created_at: job.created_at || null,
    });
  } catch (error) {
    return handleApiError(res, error, 'library-calibration');
  }
}
