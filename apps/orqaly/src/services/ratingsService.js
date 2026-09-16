/**
 * Ratings service — stars + optional comment for agents and skills.
 */
import { supabase, hasSupabase } from '../lib/supabase';

async function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
  }
  return h;
}

function base() {
  return typeof globalThis.window !== 'undefined' ? globalThis.window.location.origin : '';
}

async function apiGet(op, params = {}) {
  const qs = new URLSearchParams({ op, ...params });
  const res = await fetch(`${base()}/api/app?path=ratings&${qs}`, { headers: await headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ratings ${op} failed`);
  return data;
}

async function apiPost(op, body = {}) {
  const res = await fetch(`${base()}/api/app?path=ratings&op=${op}`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ratings ${op} failed`);
  return data;
}

export function submitRating({ target_type, target_id, stars, comment }) {
  return apiPost('submit', { target_type, target_id, stars, comment });
}

export function getMyRating(target_type, target_id) {
  return apiGet('mine', { target_type, target_id });
}

export function getAggregate(target_type, target_id) {
  return apiGet('aggregate', { target_type, target_id });
}

export function getAggregateBulk(target_type, ids) {
  if (!Array.isArray(ids) || !ids.length) return Promise.resolve({});
  return apiGet('aggregate-bulk', { target_type, ids: ids.join(',') });
}
