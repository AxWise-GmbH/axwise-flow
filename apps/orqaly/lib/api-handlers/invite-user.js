/**
 * Invite-user handler (consolidated under api/app for Vercel free plan).
 * POST /api/invite-user, GET ?op=list-users, DELETE ?op=delete-user&userId=, POST ?op=purge-users
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { inviteUserBodySchema } from '../../api/_lib/validate.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';

function isMissingTableError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache');
}

const ROLES_MIGRATION_HINT =
  'Run the Roles & Permissions migration in Supabase SQL Editor (see src/services/rolesPermissionsService.js ROLES_MIGRATION_SQL, or supabase/migrations/013_roles_permissions.sql).';

function getInviteRedirectTo() {
  const prod = 'https://orchestratori.vercel.app/auth/callback?flow=invite';
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (isProd) return prod;
  const explicit =
    process.env.INVITE_REDIRECT_TO ||
    process.env.AUTH_REDIRECT_TO ||
    process.env.PUBLIC_APP_REDIRECT_TO ||
    '';
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/auth/callback`;
  return process.env.VITE_DEV_APP_URL
    ? `${String(process.env.VITE_DEV_APP_URL).replace(/\/$/, '')}/auth/callback`
    : prod;
}

function getQueryValue(req, key) {
  const fromQuery = req?.query?.[key];
  if (typeof fromQuery === 'string') return fromQuery;
  const url = String(req?.url || '');
  if (!url.includes('?')) return null;
  try {
    const qs = url.split('?')[1] || '';
    const params = new URLSearchParams(qs);
    return params.get(key);
  } catch {
    return null;
  }
}

async function ensureSuperAdmin({ admin, userId, res }) {
  let callerRoleId = null;
  try {
    const { data: roleRow, error: roleErr } = await admin
      .from('user_roles')
      .select('role_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (roleErr && isMissingTableError(roleErr)) {
      return {
        ok: false,
        response: jsonError(
          res,
          500,
          'Roles & permissions tables are not initialized',
          ROLES_MIGRATION_HINT
        ),
      };
    }
    if (roleErr)
      return { ok: false, response: jsonError(res, 500, 'Failed to verify inviter role') };
    callerRoleId = roleRow?.role_id || null;
  } catch (e) {
    if (isMissingTableError(e)) {
      return {
        ok: false,
        response: jsonError(
          res,
          500,
          'Roles & permissions tables are not initialized',
          ROLES_MIGRATION_HINT
        ),
      };
    }
    return { ok: false, response: jsonError(res, 500, 'Failed to verify inviter role') };
  }

  let superCount = 0;
  try {
    const { count, error } = await admin
      .from('user_roles')
      .select('user_id', { count: 'exact', head: true })
      .eq('role_id', 'role-super-admin');
    if (error && isMissingTableError(error)) {
      return {
        ok: false,
        response: jsonError(
          res,
          500,
          'Roles & permissions tables are not initialized',
          ROLES_MIGRATION_HINT
        ),
      };
    }
    if (error)
      return {
        ok: false,
        response: jsonError(res, 500, 'Failed to verify bootstrap authorization state'),
      };
    superCount = count || 0;
  } catch (e) {
    if (isMissingTableError(e)) {
      return {
        ok: false,
        response: jsonError(
          res,
          500,
          'Roles & permissions tables are not initialized',
          ROLES_MIGRATION_HINT
        ),
      };
    }
    return {
      ok: false,
      response: jsonError(res, 500, 'Failed to verify bootstrap authorization state'),
    };
  }

  if (superCount === 0 && callerRoleId !== 'role-super-admin') {
    const { error: upErr } = await admin
      .from('user_roles')
      .upsert(
        { user_id: userId, role_id: 'role-super-admin', assigned_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    if (upErr)
      return { ok: false, response: jsonError(res, 500, 'Failed to bootstrap Super Admin role') };
    callerRoleId = 'role-super-admin';
  }

  if (callerRoleId !== 'role-super-admin') {
    return {
      ok: false,
      response: jsonError(res, 403, 'Only Super Admin can perform this action.'),
    };
  }
  return { ok: true };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'DELETE') {
    return jsonError(res, 405, 'Method not allowed');
  }

  try {
    const token = getBearerToken(req);
    const user = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

    if (req.method === 'POST') {
      const op = getQueryValue(req, 'op') || getQueryValue(req, 'operation') || '';
      if (op === 'purge-users') {
        const rl = checkRateLimit({
          key: `purge-users:${getRateLimitIdentifier(req, user.id)}`,
          limit: Number(process.env.PURGE_USERS_RATE_LIMIT_PER_MIN || 4),
          windowMs: 60_000,
        });
        applyRateLimitHeaders(res, rl);
        if (!rl.allowed)
          return jsonError(
            res,
            429,
            'Rate limit exceeded for purge operation. Please retry shortly.'
          );

        const admin = buildSupabaseAdminClient();
        if (!admin)
          return jsonError(
            res,
            500,
            'SUPABASE_SERVICE_ROLE_KEY is required for purging users',
            'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.'
          );
        const authz = await ensureSuperAdmin({ admin, userId: user.id, res });
        if (!authz.ok) return authz.response;

        let body = req.body;
        if (typeof body === 'string') {
          try {
            body = JSON.parse(body);
          } catch {
            return jsonError(res, 400, 'Invalid JSON body');
          }
        }
        body = body || {};
        const keepEmailsRaw = Array.isArray(body.keepEmails) ? body.keepEmails : [];
        const keepEmails = keepEmailsRaw
          .map((e) =>
            String(e || '')
              .trim()
              .toLowerCase()
          )
          .filter(Boolean);
        if (user.email) {
          const me = String(user.email).trim().toLowerCase();
          if (me && !keepEmails.includes(me)) keepEmails.push(me);
        }
        const confirm = String(body.confirm || '');
        if (confirm !== 'DELETE_EVERYONE_ELSE') {
          return jsonError(
            res,
            400,
            'Missing confirmation. Provide confirm: "DELETE_EVERYONE_ELSE" to proceed.'
          );
        }
        if (keepEmails.length < 1)
          return jsonError(res, 400, 'keepEmails must be a non-empty array');
        const alsoDeleteTables = !!body.alsoDeleteTables;

        const allUsers = [];
        let page = 1;
        const perPage = 1000;
        while (page < 100) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
          if (error) return jsonError(res, 500, error.message || 'Failed to list users');
          const batch = data?.users || [];
          allUsers.push(...batch);
          if (batch.length < perPage) break;
          page += 1;
        }
        const keepSet = new Set(keepEmails);
        const toDelete = allUsers.filter((u) => {
          if (!u?.id) return false;
          if (u.id === user.id) return false;
          const email = String(u.email || '')
            .trim()
            .toLowerCase();
          return !keepSet.has(email);
        });
        const toDeleteIds = toDelete.map((u) => u.id);

        const tableDeletes = [];
        if (alsoDeleteTables && toDeleteIds.length > 0) {
          const tables = [
            { table: 'user_roles', column: 'user_id' },
            { table: 'email_notification_preferences', column: 'user_id' },
            { table: 'profile_notes', column: 'user_id' },
            { table: 'profile_todos', column: 'user_id' },
            { table: 'meetings', column: 'user_id' },
            { table: 'workflows', column: 'user_id' },
            { table: 'projects', column: 'user_id' },
            { table: 'notifications', column: 'user_id' },
            { table: 'action_options', column: 'user_id' },
            { table: 'notification_interactions', column: 'user_id' },
            { table: 'action_executions', column: 'user_id' },
          ];
          for (const t of tables) {
            let hadError = null;
            for (let i = 0; i < toDeleteIds.length; i += 100) {
              const chunk = toDeleteIds.slice(i, i + 100);
              try {
                const { error } = await admin.from(t.table).delete().in(t.column, chunk);
                if (error && !isMissingTableError(error)) {
                  hadError = error.message || 'delete failed';
                  break;
                }
              } catch (e) {
                if (!isMissingTableError(e)) {
                  hadError = String(e?.message || e);
                  break;
                }
              }
            }
            tableDeletes.push({ table: t.table, ok: !hadError, error: hadError });
          }
        }

        const deleted = [];
        const failed = [];
        for (const u of toDelete) {
          try {
            const { error } = await admin.auth.admin.deleteUser(u.id);
            if (error)
              failed.push({
                id: u.id,
                email: u.email || null,
                error: error.message || 'delete failed',
              });
            else deleted.push({ id: u.id, email: u.email || null });
          } catch (e) {
            failed.push({ id: u.id, email: u.email || null, error: String(e?.message || e) });
          }
        }
        return res.status(200).json({
          success: true,
          keepEmails,
          totalUsers: allUsers.length,
          deletedCount: deleted.length,
          failedCount: failed.length,
          deleted,
          failed,
          ...(alsoDeleteTables ? { tableDeletes } : {}),
        });
      }
    }

    if (req.method === 'GET') {
      const op = getQueryValue(req, 'op') || getQueryValue(req, 'operation') || '';
      if (op !== 'list-users')
        return jsonError(res, 400, 'Missing or invalid op. Use ?op=list-users');
      const rl = checkRateLimit({
        key: `list-users:${getRateLimitIdentifier(req, user.id)}`,
        limit: Number(process.env.LIST_USERS_RATE_LIMIT_PER_MIN || 30),
        windowMs: 60_000,
      });
      applyRateLimitHeaders(res, rl);
      if (!rl.allowed)
        return jsonError(res, 429, 'Rate limit exceeded for user listing. Please retry shortly.');
      const admin = buildSupabaseAdminClient();
      if (!admin)
        return jsonError(
          res,
          500,
          'SUPABASE_SERVICE_ROLE_KEY is required for listing users',
          'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.'
        );
      const authz = await ensureSuperAdmin({ admin, userId: user.id, res });
      if (!authz.ok) return authz.response;
      const perPageRaw = getQueryValue(req, 'perPage');
      const pageRaw = getQueryValue(req, 'page');
      const perPage = Math.max(1, Math.min(1000, Number(perPageRaw || 1000) || 1000));
      const page = Math.max(1, Number(pageRaw || 1) || 1);
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) return jsonError(res, 500, error.message || 'Failed to list users');
      return res.status(200).json({ success: true, users: data?.users || [], page, perPage });
    }

    if (req.method === 'DELETE') {
      const op = getQueryValue(req, 'op') || getQueryValue(req, 'operation') || '';
      if (op !== 'delete-user')
        return jsonError(res, 400, 'Missing or invalid op. Use ?op=delete-user&userId=<uuid>');
      const targetUserId = getQueryValue(req, 'userId') || getQueryValue(req, 'id');
      if (!targetUserId) return jsonError(res, 400, 'Missing userId');
      if (targetUserId === user.id)
        return jsonError(res, 400, 'You cannot delete your own account from within the app.');
      const rl = checkRateLimit({
        key: `delete-user:${getRateLimitIdentifier(req, user.id)}`,
        limit: Number(process.env.DELETE_USER_RATE_LIMIT_PER_MIN || 20),
        windowMs: 60_000,
      });
      applyRateLimitHeaders(res, rl);
      if (!rl.allowed)
        return jsonError(res, 429, 'Rate limit exceeded for user deletion. Please retry shortly.');
      const admin = buildSupabaseAdminClient();
      if (!admin)
        return jsonError(
          res,
          500,
          'SUPABASE_SERVICE_ROLE_KEY is required for deleting users',
          'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.'
        );
      const authz = await ensureSuperAdmin({ admin, userId: user.id, res });
      if (!authz.ok) return authz.response;
      const { error } = await admin.auth.admin.deleteUser(targetUserId);
      if (error) return jsonError(res, 400, error.message || 'Failed to delete user');
      try {
        await admin.from('user_roles').delete().eq('user_id', targetUserId);
      } catch {
        /* ignore */
      }
      return res.status(200).json({ success: true, userId: targetUserId });
    }

    const rl = checkRateLimit({
      key: `invite-user:${getRateLimitIdentifier(req, user.id)}`,
      limit: Number(process.env.INVITE_USER_RATE_LIMIT_PER_MIN || 10),
      windowMs: 60_000,
    });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed)
      return jsonError(res, 429, 'Rate limit exceeded for user invitations. Please retry shortly.');
    const admin = buildSupabaseAdminClient();
    if (!admin)
      return jsonError(
        res,
        500,
        'SUPABASE_SERVICE_ROLE_KEY is required for inviting users',
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.'
      );

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return jsonError(res, 400, 'Invalid JSON body');
      }
    }
    body = body || {};
    const parsed = inviteUserBodySchema.safeParse(body);
    if (!parsed.success) {
      const msg =
        parsed.error.issues?.[0]?.message ||
        parsed.error.errors?.[0]?.message ||
        'Invalid request body';
      return jsonError(res, 400, msg);
    }
    const { email, name, roleId, linkedPartnerId, password } = parsed.data;
    const authz = await ensureSuperAdmin({ admin, userId: user.id, res });
    if (!authz.ok) return authz.response;

    const displayName = (name || '').trim() || email.split('@')[0];

    let invitedUserId = null;
    let createdWithPassword = false;
    if (password) {
      // Admin-supplied password: create the user directly with email already
      // confirmed so they can sign in immediately — no invite email round-trip.
      const { data: createData, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName, admin_invite: 'true' },
      });
      if (createErr) return jsonError(res, 400, createErr.message || 'Failed to create user.');
      invitedUserId = createData?.user?.id || null;
      createdWithPassword = true;
    } else {
      // No password supplied: fall back to the invite-email flow (user sets
      // their own password via the magic link).
      const redirectTo = getInviteRedirectTo();
      const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo,
          data: { display_name: displayName, admin_invite: 'true' },
        }
      );
      if (inviteErr) return jsonError(res, 400, inviteErr.message || 'Failed to send invitation.');
      invitedUserId = inviteData?.user?.id || null;
    }
    if (!invitedUserId)
      return jsonError(res, 500, 'User created but user id was not returned by Supabase');

    if (roleId) {
      const { error: roleUpsertErr } = await admin.from('user_roles').upsert(
        {
          user_id: invitedUserId,
          role_id: roleId,
          assigned_at: new Date().toISOString(),
          linked_partner_id: roleId === 'role-partner' && linkedPartnerId ? linkedPartnerId : null,
        },
        { onConflict: 'user_id' }
      );
      if (roleUpsertErr) return jsonError(res, 500, 'Invitation sent, but failed to assign role');
    }
    return res
      .status(200)
      .json({ success: true, userId: invitedUserId, email, createdWithPassword });
  } catch (err) {
    return handleApiError(res, err, 'invite-user');
  }
}
