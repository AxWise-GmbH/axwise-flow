/**
 * Demo write-guard — makes the read-only demo account truly read-only at the API,
 * not just in the UI. Wired into every serverless dispatcher immediately before it
 * invokes the resolved handler.
 *
 * Design:
 *  - Safe-by-default ALLOWLIST: for a demo user, GET/HEAD/OPTIONS are always allowed;
 *    every write method (POST/PUT/PATCH/DELETE) is blocked UNLESS its `path[:op]` is a
 *    known read-that-happens-over-POST (see READ_POST_OPS). A newly-added write handler
 *    is therefore blocked automatically (fail closed).
 *  - "Demo user" = id listed in DEMO_USER_IDS (comma-separated env), OR — when
 *    DEMO_GUARD_BLOCK_ALL_VIEWERS === 'true' — any user whose role is 'role-viewer'.
 *  - Endpoints with no bearer token (cron jobs, OAuth callbacks, webhook receivers)
 *    are untouched: the guard returns false and lets the handler run as before.
 *
 * Returns `true` when it has already sent a 403 (the dispatcher must then `return`),
 * otherwise `false`.
 */
import { getBearerToken, verifySupabaseToken } from './auth.js';
import { buildSupabaseAdminClient } from './supabase-server.js';
import { jsonError } from './errors.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Reads that are issued over a write HTTP method. Key form: `path` or `path:op`.
 * `op` is matched against req.query.op and req.query.sub. Keep this list minimal and
 * verified — anything not listed is blocked for the demo user.
 */
const READ_POST_OPS = new Set([
  'knowledge-base:search',
  'contacts:find-matches',
]);

const ROLE_CACHE_TTL_MS = 60_000;
/** userId -> { roleId, expires } */
const roleCache = new Map();

function parseDemoUserIds() {
  return new Set(
    (process.env.DEMO_USER_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

async function lookupRoleId(userId) {
  const cached = roleCache.get(userId);
  const now = Date.now();
  if (cached && cached.expires > now) return cached.roleId;
  const admin = buildSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId)
    .maybeSingle();
  const roleId = data?.role_id || null;
  roleCache.set(userId, { roleId, expires: now + ROLE_CACHE_TTL_MS });
  return roleId;
}

/** Test seam: clear the in-memory role cache between cases. */
export function _resetDemoGuardCache() {
  roleCache.clear();
}

export async function enforceDemoWriteGuard(req, res) {
  const method = (req.method || 'GET').toUpperCase();
  // Reads are always safe. Only write verbs can mutate here (GET is never a mutation).
  if (!WRITE_METHODS.has(method)) return false;

  const token = getBearerToken(req);
  if (!token) return false; // cron / webhook / oauth-callback — no session to gate

  const user = await verifySupabaseToken(token);
  if (!user?.id) return false; // let the handler produce its own 401

  const demoIds = parseDemoUserIds();
  let isDemo = demoIds.has(user.id);
  if (!isDemo && process.env.DEMO_GUARD_BLOCK_ALL_VIEWERS === 'true') {
    isDemo = (await lookupRoleId(user.id)) === 'role-viewer';
  }
  if (!isDemo) return false;

  // Demo user issuing a write verb: allow only known reads-over-POST.
  const path = (req.query?.path || '').trim().toLowerCase();
  const op = (req.query?.op || req.query?.sub || '').trim().toLowerCase();
  if (READ_POST_OPS.has(path) || (op && READ_POST_OPS.has(`${path}:${op}`))) {
    return false;
  }

  jsonError(res, 403, 'This is a read-only demo account. Changes are disabled.');
  return true;
}
