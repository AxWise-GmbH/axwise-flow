/**
 * Organization service — CRUD for organizations.
 */
import { supabase } from '../lib/supabase';

async function getHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

function getBase() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return import.meta.env.VITE_API_BASE_URL || '';
}

async function get(op, params = {}) {
  const qs = new URLSearchParams({ path: 'organizations', op, ...params });
  const res = await fetch(`${getBase()}/api/app?${qs}`, { headers: await getHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Organizations ${op} failed`);
  return data;
}

async function post(op, body = {}) {
  const res = await fetch(`${getBase()}/api/app?path=organizations&op=${op}`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Organizations ${op} failed`);
  return data;
}

export function listOrganizations() {
  return get('list');
}
export function getOrganization(id) {
  return get('get', { id });
}
export function createOrganization(org) {
  return post('create', org);
}
/**
 * Transactionally create a workspace and its authorized Agent Hub catalogue.
 * Use this for New Business goals so AxWise never sees a zero-agent tenant.
 */
export function createGoalOrganization(org) {
  return post('create-for-goal', org);
}
export function updateOrganization(id, updates) {
  return post('update', { id, ...updates });
}
export function deleteOrganization(id) {
  return post('delete', { id });
}

/** Get financial metrics for all orgs (or one org if org_id provided) */
export function getOrgFinances(orgId) {
  const params = {};
  if (orgId) params.org_id = orgId;
  return get('finances', params);
}

/** Get activity feed + counts for a specific org */
export function getOrgActivity(orgId, limit = 30) {
  return get('activity', { org_id: orgId, limit: String(limit) });
}
