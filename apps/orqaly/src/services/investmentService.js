/**
 * Investment service — CRUD for deals, investors, pools, commitments.
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
  return import.meta.env.VITE_API_BASE_URL || '';
}

async function api(path, op, method = 'GET', body = null, params = {}) {
  const qs = new URLSearchParams({ path, op, ...params });
  const opts = { method, headers: await getHeaders() };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(`${getBase()}/api/invest?${qs}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Investment ${path}/${op} failed`);
  return data;
}

// Investors
export const listInvestors = () => api('investors', 'list');
export const getInvestor = (id) => api('investors', 'get', 'GET', null, { id });
export const createInvestor = (data) => api('investors', 'create', 'POST', data);
export const updateInvestor = (id, data) => api('investors', 'update', 'POST', { id, ...data });
export const deleteInvestor = (id) => api('investors', 'delete', 'POST', { id });

// Deals
export const listDeals = (status) => api('deals', 'list', 'GET', null, status ? { status } : {});
export const getDeal = (id) => api('deals', 'get', 'GET', null, { id });
export const createDeal = (data) => api('deals', 'create', 'POST', data);
export const updateDeal = (id, data) => api('deals', 'update', 'POST', { id, ...data });
export const transitionDeal = (id, new_status) =>
  api('deals', 'transition', 'POST', { id, new_status });
export const deleteDeal = (id) => api('deals', 'delete', 'POST', { id });

// Commitments
export const listCommitments = (params = {}) => api('commitments', 'list', 'GET', null, params);
export const commitToDeal = (deal_id, investor_id, amount, pool_id) =>
  api('commitments', 'commit', 'POST', { deal_id, investor_id, amount, pool_id });
export const withdrawCommitment = (id) => api('commitments', 'withdraw', 'POST', { id });

// Pools
export const listPools = () => api('pools', 'list');
export const getPool = (id) => api('pools', 'get', 'GET', null, { id });
export const createPool = (data) => api('pools', 'create', 'POST', data);
export const joinPool = (pool_id, investor_id, amount) =>
  api('pools', 'join', 'POST', { pool_id, investor_id, amount });
export const leavePool = (pool_id, investor_id) =>
  api('pools', 'leave', 'POST', { pool_id, investor_id });

// Documents
export const listDocuments = (deal_id) => api('documents', 'list', 'GET', null, { deal_id });
export const getUploadUrl = (deal_id, filename, category, mime_type, file_size) =>
  api('documents', 'get-upload-url', 'POST', { deal_id, filename, category, mime_type, file_size });
export const getDownloadUrl = (id) => api('documents', 'get-download-url', 'GET', null, { id });
export const deleteDocument = (id) => api('documents', 'delete', 'POST', { id });

// Council
export const startCouncil = (team_id) => api('deals', 'council-start', 'POST', { team_id });
export const getCouncilStatus = (job_id) => api('deals', 'council-status', 'GET', null, { job_id });

// Public investor profile (no auth — uses separate public endpoint)
export async function getPublicInvestor(id) {
  const res = await fetch(`${getBase()}/api/invest-public?id=${encodeURIComponent(id)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Investor not found');
  return data;
}
