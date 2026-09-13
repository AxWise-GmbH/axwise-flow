/**
 * Business-module service — DB-backed ready-business activation
 * (`/api/app?path=business-modules`). Thin fetch wrapper mirroring
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

async function request(op, method = 'GET', body = null) {
  const opts = { method, headers: await getHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${getBase()}/api/app?path=business-modules&op=${op}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `business-modules ${op} failed`);
  return data;
}

export function listModules() {
  return request('list', 'GET');
}
export function activateModule(moduleId) {
  return request('activate', 'POST', { module_id: moduleId });
}
export function deactivateModule(moduleId) {
  return request('deactivate', 'POST', { module_id: moduleId });
}
export function toggleModule(moduleId) {
  return request('toggle', 'POST', { module_id: moduleId });
}
