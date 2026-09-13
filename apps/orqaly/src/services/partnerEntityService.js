/**
 * Partner-entity service — client for the Partners ready-business data surface
 * (`/api/app?path=partner-entities`). Thin fetch wrapper mirroring
 * businessService.js.
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
  const qs = new URLSearchParams({ op });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  }
  const opts = { method, headers: await getHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${getBase()}/api/app?path=partner-entities&${qs}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `partner-entities ${op} failed`);
  return data;
}

// ── Type configs ─────────────────────────────────────────────
export function listEntityTypes() {
  return request('types-list', 'GET');
}
export function upsertEntityType(config) {
  return request('types-upsert', 'POST', {}, config);
}

// ── Entities ─────────────────────────────────────────────────
export function listEntities(typeKey, { search, filters, page, pageSize } = {}) {
  return request('list', 'GET', {
    type_key: typeKey,
    search,
    filters: filters && Object.keys(filters).length ? JSON.stringify(filters) : undefined,
    page,
    pageSize,
  });
}
export function getEntity(id) {
  return request('get', 'GET', { id });
}
export function createEntity(body) {
  return request('create', 'POST', {}, body);
}
export function updateEntity(id, body) {
  return request('update', 'POST', { id }, body);
}
export function deleteEntity(id) {
  return request('delete', 'POST', { id }, {});
}
export function transformEntity(id, targetTypeKey) {
  return request('transform', 'POST', {}, { id, target_type_key: targetTypeKey });
}
