import fs from 'node:fs/promises';
import path from 'node:path';
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

// Whitelist of allowed directories to read from (prevent directory traversal)
const ALLOWED_PREFIXES = [
  'src/pages/',
  'src/components/',
  'src/services/',
  'src/hooks/',
  'src/context/',
  'lib/api-handlers/',
  'lib/agent-handlers/',
  'lib/ops-handlers/',
  'lib/concilium-handlers/',
  'api/',
  'supabase/migrations/',
];

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
    return jsonError(res, 403, 'Only Super Admin can read source files.');
  }

  const filePath = (req.query?.file || '').trim();
  if (!filePath) return jsonError(res, 400, 'Missing file parameter');

  // Security: prevent directory traversal
  const normalized = path.normalize(filePath).replace(/\\/g, '/');
  if (normalized.includes('..') || normalized.startsWith('/')) {
    return jsonError(res, 403, 'Invalid file path');
  }

  const allowed = ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  if (!allowed) return jsonError(res, 403, `File path not in allowed directories`);

  const root = process.cwd();
  const fullPath = path.join(root, normalized);

  try {
    const content = await fs.readFile(fullPath, 'utf8');
    const ext = path.extname(fullPath).replace('.', '') || 'txt';
    return res.status(200).json({
      file: normalized,
      language: ext === 'js' ? 'javascript' : ext === 'jsx' ? 'javascript' : ext === 'sql' ? 'sql' : ext,
      lines: content.split('\n').length,
      content,
    });
  } catch (err) {
    if (err.code === 'ENOENT') return jsonError(res, 404, 'File not found');
    return jsonError(res, 500, err.message);
  }
}
