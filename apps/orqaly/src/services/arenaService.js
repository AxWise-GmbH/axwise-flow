/**
 * Arena service — people vs agents on the same daily job.
 *
 * Thin client over /api/app?path=arena. Mirrors composioService.js: one
 * fetchJson, errors surfaced as thrown Errors carrying the server message so a
 * hook can put them straight into state.
 */
import { getAuthHeaders } from '../lib/supabaseEdge';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim();

async function fetchJson(url, opts = {}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${url}`, {
    ...opts,
    headers: { ...headers, ...opts.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

function qs(params = {}) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `&${s}` : '';
}

const post = (op, body) =>
  fetchJson(`/api/app?path=arena&op=${op}`, { method: 'POST', body: JSON.stringify(body) });

/* ── reads ────────────────────────────────────────────────────────────────── */

export const fetchArenaBoard = (params) => fetchJson(`/api/app?path=arena&op=board${qs(params)}`);
export const fetchArenaScoreboard = (params) =>
  fetchJson(`/api/app?path=arena&op=scoreboard${qs(params)}`);
export const fetchArenaDecision = (params) =>
  fetchJson(`/api/app?path=arena&op=decision${qs(params)}`);
export const fetchArenaTrend = (params) => fetchJson(`/api/app?path=arena&op=trend${qs(params)}`);
export const fetchArenaExceptions = (params) =>
  fetchJson(`/api/app?path=arena&op=exceptions${qs(params)}`);
export const fetchArenaDepartments = () => fetchJson('/api/app?path=arena&op=departments');
export const fetchArenaRates = () => fetchJson('/api/app?path=arena&op=rates');

/* ── writes ───────────────────────────────────────────────────────────────── */

export const saveArenaDepartments = (departments) => post('departments', { departments });
export const saveArenaRates = (rates) => post('rates', { rates });
export const rateArenaSide = (payload) => post('rate', payload);
export const setArenaOutcome = (payload) => post('outcome', payload);
export const recordArenaVerdict = (payload) => post('verdict', payload);
export const runArenaAgent = (payload) => post('run-agent', payload);
export const registerArenaResult = (payload) => post('register', payload);

export const deleteArenaRate = (id) =>
  fetchJson(`/api/app?path=arena&op=rates&id=${encodeURIComponent(id)}`, { method: 'DELETE' });

/**
 * Upload one registered-result file: ask for a signed URL, then PUT the bytes
 * straight to Storage so the file never travels through the serverless function.
 * @returns {Promise<{ name, storage_path, mime, size, kind }>} an asset entry
 */
export async function uploadArenaAsset(taskId, file) {
  const signed = await post('upload-url', {
    task_id: taskId,
    filename: file.name,
    mime: file.type || undefined,
    size: file.size,
  });

  const res = await fetch(signed.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed for ${file.name}`);

  return {
    name: file.name,
    storage_path: signed.path,
    mime: file.type || undefined,
    size: file.size,
    kind: 'file',
  };
}

/* ── setup guide ──────────────────────────────────────────────────────────── */

export const fetchArenaGuideProgress = () => fetchJson('/api/app?path=arena&op=guide-progress');
export const fetchArenaPeople = () => fetchJson('/api/app?path=arena&op=people');
export const saveArenaPeople = (people) => post('people', { people });
export const fetchArenaStack = () => fetchJson('/api/app?path=arena&op=stack');
export const saveArenaStack = (rows) => post('stack', { rows });
export const ensureArenaAgents = (roles) => post('ensure-agents', { roles });
export const linkArenaBriefGoal = (stackId, goalId) =>
  post('link-brief-goal', { stack_id: stackId, goal_id: goalId });
export const sendBriefToDeveloper = (stackId) => post('brief-task', { stack_id: stackId });
