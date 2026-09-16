const VALID_WORKER_SCOPES = new Set(['production', 'preview', 'local']);
export const WORKER_DEPLOYMENT_PAYLOAD_KEY = '_workerDeployment';
// A running lease is considered abandoned only after the same five-minute
// window in both the durable worker sweep and browser-open Preview recovery.
// Keeping this boundary shared prevents the UI/API path from stealing a lease
// that the normal worker still owns.
export const STALE_RUNNING_JOB_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Identify the queue partition owned by this runtime.
 *
 * Vercel exposes VERCEL_ENV for every deployment. Local workers intentionally
 * get their own partition because they can share the production Supabase
 * project while using localhost-only credentials and service URLs.
 */
export function resolveWorkerScope(env = process.env) {
  const vercelEnv = String(env.VERCEL_ENV || '').toLowerCase();
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview';
  if (vercelEnv === 'development') return 'local';

  // A Vercel runtime without VERCEL_ENV must never fall into the production
  // queue. Preview is the safer fail-closed partition.
  if (env.VERCEL) return 'preview';

  // Unit tests exercise the legacy unscoped fixtures, which are backfilled to
  // production by migration 196. Actual local development has NODE_ENV unset
  // or set to development.
  if (env.NODE_ENV === 'test') return 'production';
  return 'local';
}

export function isWorkerScope(value) {
  return VALID_WORKER_SCOPES.has(value);
}

/**
 * Resolve the immutable identity of the current Preview deployment. The broad
 * `preview` queue partition is shared by every Preview deployment, so it is
 * insufficient for browser-initiated pickup recovery.
 */
export function resolveWorkerDeploymentIdentity(env = process.env) {
  if (resolveWorkerScope(env) !== 'preview') return null;

  const deploymentId = String(env.VERCEL_DEPLOYMENT_ID || '').trim();
  if (deploymentId) return `vercel-deployment:${deploymentId}`;

  const deploymentHost = String(env.VERCEL_URL || '').trim();
  if (!deploymentHost) return null;
  try {
    const url = new URL(
      deploymentHost.includes('://') ? deploymentHost : `https://${deploymentHost}`
    );
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.pathname && url.pathname !== '/') ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return `vercel-url:${url.host.toLowerCase()}`;
  } catch {
    return null;
  }
}

/** Stamp a trusted deployment binding and discard any caller-supplied value. */
export function bindJobPayloadToWorkerDeployment(payload, env = process.env) {
  const boundPayload = { ...(payload || {}) };
  delete boundPayload[WORKER_DEPLOYMENT_PAYLOAD_KEY];
  const deploymentIdentity = resolveWorkerDeploymentIdentity(env);
  if (deploymentIdentity) {
    boundPayload[WORKER_DEPLOYMENT_PAYLOAD_KEY] = deploymentIdentity;
  }
  return boundPayload;
}

/**
 * Bind an entire queue row to the trusted runtime that created it.
 *
 * Preview claims intentionally fail closed when Vercel does not expose a safe
 * immutable deployment identity: the row remains in the broad Preview
 * partition without `_workerDeployment`, so no Preview deployment may claim
 * it. Production and local rows do not carry a deployment payload marker.
 */
export function bindAgentJobToWorkerDeployment(job, env = process.env) {
  return {
    ...(job || {}),
    worker_scope: resolveWorkerScope(env),
    payload: bindJobPayloadToWorkerDeployment(job?.payload, env),
  };
}

/** Bind a batch of queue rows without sharing payload object references. */
export function bindAgentJobsToWorkerDeployment(jobs, env = process.env) {
  return (Array.isArray(jobs) ? jobs : []).map((job) => bindAgentJobToWorkerDeployment(job, env));
}
