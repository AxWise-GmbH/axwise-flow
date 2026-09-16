/**
 * Partner history backend: Supabase when configured, else localStorage.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction } from './auditLogBackend';

const STORAGE_KEY = 'orch_partner_history_v1';
const clone = (v) => JSON.parse(JSON.stringify(v));
let partnerHistoryHasUserId = null;

async function hasPartnerHistoryUserIdColumn() {
  if (partnerHistoryHasUserId !== null) return partnerHistoryHasUserId;
  try {
    const { error } = await supabase.from('partner_history').select('user_id').limit(1);
    partnerHistoryHasUserId = !error;
  } catch {
    partnerHistoryHasUserId = false;
  }
  return partnerHistoryHasUserId;
}

function loadAllLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAllLocal(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function entryToRow(e, partnerId) {
  const meta = {
    ...(e.meta || {}),
    ...(e.body !== undefined && { body: e.body }),
    ...(e.bodyHighlight !== undefined && { bodyHighlight: e.bodyHighlight }),
    ...(e.relativeTime !== undefined && { relativeTime: e.relativeTime }),
  };
  return {
    partner_id: partnerId,
    type: e.type,
    title: e.title ?? null,
    detail: e.detail ?? null,
    meta: Object.keys(meta).length ? meta : null,
  };
}

function rowToEntry(r) {
  if (!r) return null;
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    detail: r.detail,
    meta: r.meta,
    createdAt: r.created_at,
    ...(r.meta?.body && { body: r.meta.body }),
    ...(r.meta?.bodyHighlight !== undefined && { bodyHighlight: r.meta.bodyHighlight }),
    ...(r.meta?.relativeTime && { relativeTime: r.meta.relativeTime }),
  };
}

async function getHistoryFromSupabase(partnerId, type = null) {
  const hasUserId = await hasPartnerHistoryUserIdColumn();
  let q = supabase
    .from('partner_history')
    .select('id, type, title, detail, meta, created_at')
    .eq('partner_id', partnerId);
  if (hasUserId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    if (!userId) throw new Error('User required: must be authenticated to load partner history');
    q = q.eq('user_id', userId);
  }
  if (type && type !== 'all') q = q.eq('type', type);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToEntry);
}

async function addEntryToSupabase(partnerId, entry) {
  const hasUserId = await hasPartnerHistoryUserIdColumn();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;
  if (hasUserId && !userId)
    throw new Error('User required: must be authenticated to add partner history');
  const row = entryToRow(entry, partnerId);
  const payload = hasUserId ? { ...row, user_id: userId } : row;
  const { data, error } = await supabase
    .from('partner_history')
    .insert(payload)
    .select('id, type, title, detail, meta, created_at')
    .single();
  if (error) throw error;
  await logAction({
    action: 'History entry added',
    entity: 'Partner',
    entityId: partnerId,
    details: entry.title || entry.type,
  });
  return rowToEntry(data);
}

async function seedToSupabase(partnerId, entries) {
  for (const e of entries) {
    await addEntryToSupabase(partnerId, e);
  }
}

export async function getHistory(partnerId, type = null) {
  if (hasSupabase()) return getHistoryFromSupabase(partnerId, type);
  const data = loadAllLocal();
  let list = data[partnerId] || [];
  if (type && type !== 'all') list = list.filter((e) => e.type === type);
  return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function addEntry(partnerId, entry) {
  if (hasSupabase()) return addEntryToSupabase(partnerId, entry);
  const data = loadAllLocal();
  const list = data[partnerId] || [];
  const newEntry = {
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  list.unshift(newEntry);
  data[partnerId] = list;
  saveAllLocal(data);
  return newEntry;
}

export async function seedHistoryIfEmpty(partnerId, partnerName, seedEntries) {
  if (hasSupabase()) {
    const existing = await getHistoryFromSupabase(partnerId);
    if (existing.length > 0) return;
    await seedToSupabase(partnerId, seedEntries);
    return;
  }
  const data = loadAllLocal();
  if (data[partnerId]?.length > 0) return;
  const withIds = seedEntries.map((e, i) => ({ ...e, id: `seed-${partnerId}-${i}-${Date.now()}` }));
  data[partnerId] = withIds;
  saveAllLocal(data);
}
