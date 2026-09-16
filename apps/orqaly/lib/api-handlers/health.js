/**
 * Health check handler (consolidated under api/router for Vercel Hobby limit).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import {
  buildSupabaseAdminClient,
  buildSupabaseUserClient,
} from '../../api/_lib/supabase-server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

// ── Health check helpers ──────────────────────────────────────────────────────

const isProd = () =>
  process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

/** Return a safe error message — strip internals in production. */
function safeMsg(err, fallback = 'connection failed') {
  if (isProd()) return fallback;
  return String(err?.message || err || fallback).slice(0, 200);
}

/**
 * Env check: flag if Supabase URL is present but the service-role key is missing.
 * Returns "ok" when running in localStorage-only mode (no Supabase URL configured).
 * @returns {string} "ok" | "missing: VAR_NAME"
 */
function checkEnv() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (supabaseUrl && !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return 'missing: SUPABASE_SERVICE_ROLE_KEY';
  }
  return 'ok';
}

/**
 * Database check: probe the Supabase connection with a zero-row query.
 * Treats "table does not exist" (42P01) as reachable — the DB is up.
 * @returns {Promise<string>} "ok" | "not configured" | "error: <safe message>"
 */
async function checkDatabase() {
  const admin = buildSupabaseAdminClient();
  if (!admin) return 'not configured';
  try {
    const { error } = await admin.from('partners').select('id').limit(0);
    // 42P01 = relation does not exist — DB is reachable even if the table is absent
    if (!error || error.code === '42P01') return 'ok';
    return `error: ${safeMsg(error)}`;
  } catch (e) {
    return `error: ${safeMsg(e)}`;
  }
}

/**
 * Build and return the structured health response.
 *
 * Status logic:
 *   healthy   — env ok + (DB ok or not configured — localStorage mode is intentional)
 *   degraded  — env ok + DB configured but unreachable
 *   unhealthy — critical env var missing
 *
 * HTTP 200 for healthy, 503 for degraded/unhealthy.
 * No stack traces or connection strings are ever included in the response body.
 */
async function handleHealthCheck(res) {
  const [envCheck, dbCheck] = await Promise.all([
    Promise.resolve(checkEnv()),
    checkDatabase(),
  ]);

  const envOk = envCheck === 'ok';
  const dbOk = dbCheck === 'ok' || dbCheck === 'not configured';
  const status = !envOk ? 'unhealthy' : !dbOk ? 'degraded' : 'healthy';

  return res.status(status === 'healthy' ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    checks: {
      database: dbCheck,
      env: envCheck,
      version,
    },
  });
}

// ── Existing prefs diagnostics (Super Admin only — unchanged) ─────────────────

function looksLikeMissingTable(err, tableName) {
  const msg = String(err?.message || '').toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  const needle = String(tableName || '').toLowerCase();
  return (
    (needle &&
      msg.includes(needle) &&
      (msg.includes('does not exist') || msg.includes('relation'))) ||
    code === '42p01'
  );
}

async function handlePrefsDiagnostics(req, res) {
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');
  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 500, 'SUPABASE_SERVICE_ROLE_KEY is required for diagnostics');
  const { data: roleRow, error: roleErr } = await admin
    .from('user_roles')
    .select('role_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (roleErr && looksLikeMissingTable(roleErr, 'user_roles'))
    return jsonError(res, 500, 'Roles tables are not initialized (user_roles missing)');
  if (roleErr) return jsonError(res, 500, 'Failed to verify caller role');
  if (roleRow?.role_id !== 'role-super-admin')
    return jsonError(res, 403, 'Forbidden. Super Admin only.');
  const tableName = 'email_notification_preferences';
  let adminProbe = { ok: false };
  try {
    const { error } = await admin.from(tableName).select('user_id', { head: true, count: 'exact' });
    adminProbe = error
      ? {
          ok: false,
          missing: looksLikeMissingTable(error, tableName),
          error: { message: error.message, code: error.code },
        }
      : { ok: true };
  } catch (e) {
    adminProbe = {
      ok: false,
      missing: looksLikeMissingTable(e, tableName),
      error: { message: String(e?.message || e) },
    };
  }
  const userClient = buildSupabaseUserClient(token);
  if (!userClient)
    return jsonError(res, 500, 'Supabase user client could not be initialized for diagnostics');
  let userProbe = { ok: false };
  try {
    const { error } = await userClient
      .from(tableName)
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle();
    userProbe = error
      ? {
          ok: false,
          missing: looksLikeMissingTable(error, tableName),
          error: { message: error.message, code: error.code },
        }
      : { ok: true };
  } catch (e) {
    userProbe = {
      ok: false,
      missing: looksLikeMissingTable(e, tableName),
      error: { message: String(e?.message || e) },
    };
  }
  const status =
    adminProbe.ok && userProbe.ok
      ? 'ok'
      : adminProbe.missing || userProbe.missing
        ? 'missing_migration'
        : 'error';
  return res.status(200).json({
    ok: true,
    diagnostics: {
      status,
      table: tableName,
      adminProbe,
      userProbe,
      hint:
        status === 'missing_migration'
          ? 'Run migration supabase/migrations/009_email_notification_preferences.sql in Supabase SQL Editor.'
          : undefined,
    },
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  cors(res, req);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');
  try {
    const diag = String(req?.query?.diag || (req?.url?.includes('diag=prefs') && 'prefs') || '');
    if (diag === 'prefs') return await handlePrefsDiagnostics(req, res);
    return await handleHealthCheck(res);
  } catch (err) {
    return handleApiError(res, err, 'health');
  }
}
