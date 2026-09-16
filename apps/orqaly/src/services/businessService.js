/**
 * Business service — Phase 6.
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
  const res = await fetch(`${getBase()}/api/app?path=businesses&${qs}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Businesses ${op} failed`);
  return data;
}

export function listBusinesses() {
  return request('list', 'GET', {});
}
export function getBusiness(id) {
  return request('get', 'GET', { id });
}
export function createBusiness(body) {
  return request('create', 'POST', {}, body);
}
export function updateBusiness(id, body) {
  return request('update', 'POST', { id }, body);
}
export function killBusiness(id, reason = '') {
  return request('kill', 'POST', { id }, { reason });
}
export function unkillBusiness(id) {
  return request('unkill', 'POST', { id }, {});
}
export function archiveBusiness(id) {
  return request('archive', 'POST', { id });
}
