import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (roleRow?.role_id !== 'role-super-admin') {
    return jsonError(res, 403, 'Only Super Admin can preview table data.');
  }

  const table = (req.query?.table || '').trim().toLowerCase();
  if (!table) return jsonError(res, 400, 'Missing table parameter');

  // Security: only allow alphanumeric + underscore table names (prevent SQL injection)
  if (!/^[a-z][a-z0-9_]*$/.test(table)) {
    return jsonError(res, 400, 'Invalid table name');
  }

  const limit = Math.min(parseInt(req.query?.limit || '20', 10) || 20, 50);

  try {
    const { data: rows, error, count } = await admin
      .from(table)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      if (String(error.message).includes('relation')) {
        return jsonError(res, 404, `Table "${table}" not found`);
      }
      return jsonError(res, 500, error.message);
    }

    const columns = rows?.length > 0
      ? Object.keys(rows[0]).map((key) => ({
          name: key,
          type: typeof rows[0][key] === 'object' ? 'jsonb' : typeof rows[0][key],
        }))
      : [];

    return res.status(200).json({
      table,
      totalRows: count,
      returnedRows: rows?.length || 0,
      columns,
      rows: rows || [],
    });
  } catch (err) {
    return jsonError(res, 500, err.message);
  }
}
