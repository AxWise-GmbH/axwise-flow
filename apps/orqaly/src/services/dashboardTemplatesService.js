/**
 * Dashboard layout templates service — frontend client for
 * /api/app?path=dashboard-templates. Saves/reads the user's named block-layout
 * snapshots. DB column `block_order` is exposed to the app as `order`.
 */
import { supabase, hasSupabase } from '../lib/supabase';

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

function getBase() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

async function request(op, method = 'GET', params = {}, body = null) {
  const qs = new URLSearchParams({ op, ...params });
  for (const [k, v] of qs.entries()) if (!v) qs.delete(k);
  const opts = { method, headers: await getHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${getBase()}/api/app?path=dashboard-templates&${qs}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Dashboard templates ${op} failed`);
  return data;
}

/** Normalize a DB row to the client template shape. */
function toClient(row) {
  return {
    id: row.id,
    name: row.name,
    surface: row.surface,
    builtin: false,
    hidden: Array.isArray(row.hidden) ? row.hidden : [],
    order: Array.isArray(row.block_order) ? row.block_order : [],
    widths: Array.isArray(row.widths) ? row.widths : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTemplates({ surface = 'home' } = {}) {
  const rows = await request('list', 'GET', { surface });
  return Array.isArray(rows) ? rows.map(toClient) : [];
}

export async function createTemplate({
  name,
  surface = 'home',
  hidden = [],
  order = [],
  widths = [],
}) {
  const row = await request(
    'create',
    'POST',
    {},
    { name, surface, hidden, block_order: order, widths }
  );
  return toClient(row);
}

export async function updateTemplate(id, patch = {}) {
  const body = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.hidden !== undefined) body.hidden = patch.hidden;
  if (patch.order !== undefined) body.block_order = patch.order;
  if (patch.widths !== undefined) body.widths = patch.widths;
  const row = await request('update', 'POST', { id }, body);
  return toClient(row);
}

export function deleteTemplate(id) {
  return request('delete', 'POST', { id });
}
