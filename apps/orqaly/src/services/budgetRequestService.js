/**
 * Budget Request service — agents request operational funds during goal execution.
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
  for (const [k, v] of qs.entries()) {
    if (!v) qs.delete(k);
  }
  const opts = { method, headers: await getHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${getBase()}/api/app?path=budget-requests&${qs}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Budget request ${op} failed`);
  return data;
}

export async function listBudgetRequests(goalId, status) {
  return request('list', 'GET', { goal_id: goalId || '', status: status || '' });
}

export async function reviewBudgetRequest(id, action, notes = '') {
  return request('review', 'POST', {}, { id, action, notes });
}

export async function createBudgetRequest(data) {
  return request('create', 'POST', {}, data);
}
