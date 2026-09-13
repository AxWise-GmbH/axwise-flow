import { createClient } from '@supabase/supabase-js';
import { getSupabaseUrl } from './auth.js';
import {
  resolveWorkerDeploymentIdentity,
  resolveWorkerScope,
} from '../../lib/agent-handlers/worker-scope.js';
import { guardSupabaseClientForCurrentJobLease } from '../../lib/agent-handlers/job-lease-runtime.js';

export const WORKER_SCOPE_HEADER = 'x-orqaly-worker-scope';
export const WORKER_DEPLOYMENT_HEADER = 'x-orqaly-worker-deployment';

export function buildTrustedWorkerHeaders(env = process.env) {
  const headers = { [WORKER_SCOPE_HEADER]: resolveWorkerScope(env) };
  const deploymentIdentity = resolveWorkerDeploymentIdentity(env);
  if (deploymentIdentity) headers[WORKER_DEPLOYMENT_HEADER] = deploymentIdentity;
  return headers;
}

function getSupabaseAnonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
}

function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function buildSupabaseUserClient(accessToken) {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey || !accessToken) return null;

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

export function buildSupabaseAdminClient() {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!url || !serviceRoleKey) return null;

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Migrations 196/212 read these trusted service-role headers to partition
    // inserts and enforce both runtime scope and exact Preview deployment at
    // the queued -> running lease boundary.
    global: {
      headers: buildTrustedWorkerHeaders(),
    },
  });
  return guardSupabaseClientForCurrentJobLease(client);
}
