/**
 * Dashboard service — frontend client for /api/app?path=dashboards.
 * Mirrors the businesses/goals service shape.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { maybeNotify } from './emailNotificationDispatcher';

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
  const res = await fetch(`${getBase()}/api/app?path=dashboards&${qs}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Dashboards ${op} failed`);
  return data;
}

// Dashboards
export function listDashboards(params = {}) {
  return request('list', 'GET', params);
}
export function getDashboard(id) {
  return request('get', 'GET', { id });
}
export function createDashboard(body) {
  return request('create', 'POST', {}, body).then((res) => {
    maybeNotify('dashboard_created', { name: body?.name || body?.title || '' });
    return res;
  });
}
export function updateDashboard(id, body) {
  return request('update', 'POST', { id }, body).then((res) => {
    maybeNotify('dashboard_updated', { name: body?.name || body?.title || '', id });
    return res;
  });
}
export function deleteDashboard(id) {
  return request('delete', 'POST', { id }).then((res) => {
    maybeNotify('dashboard_deleted', { id });
    return res;
  });
}
export function duplicateDashboard(id) {
  return request('duplicate', 'POST', { id });
}

// Templates (read-only seeded dashboards)
export function listTemplates() {
  return request('templates', 'GET', {});
}
export function forkTemplate(id) {
  return request('fork', 'POST', { id });
}

// Groups
export function listShareGroups() {
  return request('groups', 'GET', {});
}
export function createShareGroup(body) {
  return request('group-create', 'POST', {}, body);
}
export function updateShareGroup(id, body) {
  return request('group-update', 'POST', { id }, body);
}
export function deleteShareGroup(id) {
  return request('group-delete', 'POST', { id });
}
export function addGroupMember(id, body) {
  return request('group-add-member', 'POST', { id }, body);
}
export function removeGroupMember(id, body) {
  return request('group-remove-member', 'POST', { id }, body);
}

// Sharing
export function listDashboardShares(id) {
  return request('shares', 'GET', { id });
}
export function shareDashboard(id, group_id, can_edit = false) {
  return request('share', 'POST', { id }, { group_id, can_edit });
}
export function unshareDashboard(id, group_id) {
  return request('unshare', 'POST', { id }, { group_id });
}

// Schedules
export function listSchedules(dashboardId) {
  return request('schedules', 'GET', { id: dashboardId });
}
export function createSchedule(dashboardId, body) {
  return request('schedule-create', 'POST', { id: dashboardId }, body);
}
export function updateSchedule(scheduleId, body) {
  return request('schedule-update', 'POST', { id: scheduleId }, body);
}
export function deleteSchedule(scheduleId) {
  return request('schedule-delete', 'POST', { id: scheduleId });
}

/**
 * Auto-build a dashboard from a natural-language prompt.
 * @param {{prompt: string, current_config?: object, refinement?: string}} payload
 * @returns {Promise<{config: object, rationale: string, model: string, durationMs: number, retried: boolean}>}
 */
export async function autoBuildDashboard(payload) {
  const headers = await getHeaders();
  const res = await fetch(`${getBase()}/api/app?path=dashboard-auto`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'auto-build failed');
  return data;
}

/**
 * Batched data fetch for all blocks on a dashboard.
 * @param {{blocks: Array, global_filters: object}} payload
 * @returns {Promise<{ results: Record<string, { rows?: Array, total?: number, error?: string }> }>}
 */
export async function queryDashboardData(payload) {
  const headers = await getHeaders();
  const res = await fetch(`${getBase()}/api/app?path=dashboard-query`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'dashboard-query failed');
  return data;
}
