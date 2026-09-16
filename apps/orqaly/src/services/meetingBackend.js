/**
 * Meeting backend: Supabase when configured, else localStorage.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction } from './auditLogBackend';

const STORAGE_KEY = 'orch_meetings_v1';
const clone = (v) => JSON.parse(JSON.stringify(v));

function loadFromLocalStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveToLocalStorage(meetings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
  } catch {}
}

function meetingToRow(m) {
  const { id, partnerId, ...rest } = m;
  return { id, partner_id: partnerId ?? null, data: rest };
}

function rowToMeeting(r) {
  if (!r) return null;
  return { id: r.id, partnerId: r.partner_id ?? null, ...(r.data || {}) };
}

const DEFAULT_PAGE_SIZE = 100;

async function loadFromSupabase({ limit = DEFAULT_PAGE_SIZE, offset = 0 } = {}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;
  if (!userId) throw new Error('User required: must be authenticated to load meetings');
  let q = supabase
    .from('meetings')
    .select('id, partner_id, data', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  q = q.range(offset, offset + limit - 1);
  const { data, error, count } = await q;
  if (error) throw error;
  const items = (data || []).map(rowToMeeting);
  return { items, total: count ?? items.length };
}

async function saveToSupabase(meetings) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;
  if (!userId) throw new Error('User required: must be authenticated to save meetings');
  for (const m of meetings) {
    const row = meetingToRow(m);
    const { error } = await supabase.from('meetings').upsert(
      {
        id: row.id,
        partner_id: row.partner_id,
        user_id: userId,
        data: row.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) throw error;
  }
}

export async function loadMeetings(opts = {}) {
  if (hasSupabase()) {
    const result = await loadFromSupabase(opts);
    return result.items;
  }
  const list = loadFromLocalStorage();
  const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
  const offset = opts.offset ?? 0;
  return list.slice(offset, offset + limit);
}

export async function loadMeetingsWithTotal(opts = {}) {
  if (hasSupabase()) return loadFromSupabase(opts);
  const list = loadFromLocalStorage();
  const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
  const offset = opts.offset ?? 0;
  return { items: list.slice(offset, offset + limit), total: list.length };
}

export async function saveMeetings(meetings) {
  if (hasSupabase()) return saveToSupabase(meetings);
  saveToLocalStorage(meetings);
}

export async function insertMeeting(meeting) {
  if (hasSupabase()) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    if (!userId) throw new Error('User required: must be authenticated to create a meeting');
    const row = meetingToRow(meeting);
    const { error } = await supabase.from('meetings').insert({
      id: row.id,
      partner_id: row.partner_id,
      user_id: userId,
      data: row.data,
    });
    if (error) throw error;
    await logAction({
      action: 'Meeting recorded',
      entity: 'Meeting',
      entityId: meeting.id,
      details: meeting.partnerId ? `Partner: ${meeting.partnerId}` : null,
    });
    return meeting;
  }
  const list = loadFromLocalStorage();
  list.unshift(meeting);
  saveToLocalStorage(list);
  return meeting;
}

export async function updateMeeting(id, patch) {
  if (hasSupabase()) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    if (!userId) throw new Error('User required: must be authenticated to update a meeting');
    const { data: existing } = await supabase
      .from('meetings')
      .select('id, partner_id, data')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (!existing) throw new Error(`Meeting ${id} not found`);
    const merged = { ...(existing.data || {}), ...patch, updatedAt: new Date().toISOString() };
    const { error } = await supabase
      .from('meetings')
      .update({ data: merged, updated_at: merged.updatedAt })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
    await logAction({ action: 'Meeting updated', entity: 'Meeting', entityId: id, details: null });
    return { id: existing.id, partnerId: existing.partner_id ?? null, ...merged };
  }
  const list = loadFromLocalStorage();
  const idx = list.findIndex((m) => m.id === id);
  if (idx < 0) throw new Error(`Meeting ${id} not found`);
  Object.assign(list[idx], patch, { updatedAt: new Date().toISOString() });
  saveToLocalStorage(list);
  return clone(list[idx]);
}

export async function deleteMeeting(id) {
  if (hasSupabase()) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    if (!userId) throw new Error('User required: must be authenticated to delete a meeting');
    const { error } = await supabase.from('meetings').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
    await logAction({ action: 'Meeting deleted', entity: 'Meeting', entityId: id, details: null });
    return;
  }
  const list = loadFromLocalStorage().filter((m) => m.id !== id);
  saveToLocalStorage(list);
}

/** Remove all meetings for the current user (e.g. to clear dummy/demo data). */
export async function clearAllMeetings() {
  if (hasSupabase()) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;
    if (!userId) throw new Error('User required: must be authenticated to clear meetings');
    const { error } = await supabase.from('meetings').delete().eq('user_id', userId);
    if (error) throw error;
    await logAction({
      action: 'All meetings cleared',
      entity: 'Meeting',
      entityId: null,
      details: null,
    });
    return;
  }
  saveToLocalStorage([]);
}
