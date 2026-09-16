/**
 * Agent core: enqueue AI/agent and multi-API jobs; return 202. No long-running work in this function.
 * Routes: enqueue (POST), status (GET ?id=).
 */
import { jsonError } from './_lib/errors.js';
import { applySecurityHeaders } from './_lib/security-headers.js';
import { stripRouteKey } from './_lib/route-key.js';
import { enforceDemoWriteGuard } from './_lib/demo-guard.js';
import { createLogger } from './_lib/logger.js';

const log = createLogger('agent');
import enqueue from '../lib/agent-handlers/enqueue.js';
import status from '../lib/agent-handlers/status.js';
import processNext from '../lib/agent-handlers/process-next.js';
import webhookProcess from '../lib/agent-handlers/webhook-process.js';
import healGoal from '../lib/agent-handlers/heal-goal.js';
import researchGithub from '../lib/agent-handlers/research-github.js';
import copilot from '../lib/agent-handlers/copilot.js';
import { buildSupabaseAdminClient } from './_lib/supabase-server.js';
import { serviceRequestAuthError } from './_lib/service-auth.js';
import {
  handleOptimizePrompts,
  handleEvaluateVariants,
} from '../lib/agent-handlers/prompt-optimizer.js';

// Cron-triggered: enqueue + run prompt optimization inline
async function cronOptimizePrompts(req, res) {
  const authError = serviceRequestAuthError(req);
  if (authError) return jsonError(res, authError.status, authError.message);
  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Agent jobs not configured');
  const result = await handleOptimizePrompts(admin, {}, req);
  return res.status(200).json(result);
}

async function cronEvaluateVariants(req, res) {
  const authError = serviceRequestAuthError(req);
  if (authError) return jsonError(res, authError.status, authError.message);
  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Agent jobs not configured');
  const result = await handleEvaluateVariants(admin, {}, req);
  return res.status(200).json(result);
}

const HANDLERS = {
  enqueue,
  status,
  'process-next': processNext,
  'webhook-process': webhookProcess,
  'heal-goal': healGoal,
  'optimize-prompts': cronOptimizePrompts,
  'evaluate-variants': cronEvaluateVariants,
  'research-github': researchGithub,
  copilot,
};

export default async function handler(req, res) {
  applySecurityHeaders(res);
  const path = (req.query?.path || '').trim().toLowerCase();
  stripRouteKey(req);
  const fn = HANDLERS[path];
  if (!fn) {
    log.warn(req, 'route.not_found', { path });
    return jsonError(res, 404, 'Not found');
  }
  if (await enforceDemoWriteGuard(req, res)) return;
  const done = log.startTimer(req, 'request', { method: req.method, path });
  try {
    const result = await fn(req, res);
    done({ status: res.statusCode });
    return result;
  } catch (err) {
    done({ status: 500, error: err?.message });
    return jsonError(res, 500, err?.message || 'Handler error');
  }
}
