/**
 * Partner backend: Supabase when configured, else localStorage.
 * Provides load/save interface for partnerService.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import partnersData from '../mocks/partnersData';

const STORAGE_KEY = 'orch_partners_data_v1';
const clone = (v) => JSON.parse(JSON.stringify(v));

async function loadFromLocalStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(partnersData);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : clone(partnersData);
  } catch {
    return clone(partnersData);
  }
}

function saveToLocalStorage(partners) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(partners));
  } catch {}
}

async function getAuthUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const DEFAULT_PAGE_SIZE = 100;
let partnersHasUserId = null;

async function hasPartnersUserIdColumn() {
  if (partnersHasUserId !== null) return partnersHasUserId;
  try {
    const { error } = await supabase.from('partners').select('user_id').limit(1);
    partnersHasUserId = !error;
  } catch {
    partnersHasUserId = false;
  }
  return partnersHasUserId;
}

async function loadFromSupabase({ limit = DEFAULT_PAGE_SIZE, offset = 0 } = {}) {
  const hasUserId = await hasPartnersUserIdColumn();
  const selectCols = hasUserId
    ? 'id, data, created_at, updated_at, user_id'
    : 'id, data, created_at, updated_at';
  let q = supabase
    .from('partners')
    .select(selectCols, { count: 'exact' })
    .order('created_at', { ascending: false });
  if (hasUserId) {
    const userId = await getAuthUserId();
    if (!userId) throw new Error('User required: must be authenticated to load partners');
    q = q.eq('user_id', userId);
  }
  q = q.range(offset, offset + limit - 1);
  const { data, error, count } = await q;
  if (error) throw error;
  return {
    items: (data || []).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      createdBy: r.user_id ?? null,
      ...(r.data || {}),
    })),
    total: count ?? data?.length ?? 0,
  };
}

async function saveToSupabase(partners) {
  const hasUserId = await hasPartnersUserIdColumn();
  const userId = await getAuthUserId();
  if (hasUserId && !userId)
    throw new Error('User required: must be authenticated to save partners');
  for (const p of partners) {
    const { id, ...rest } = p;
    const payload = hasUserId
      ? { id, user_id: userId, data: rest, updated_at: new Date().toISOString() }
      : { id, data: rest, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('partners').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
  }
}

async function getNextIdFromSupabase() {
  const { data } = await supabase
    .from('partners')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);
  const last = data?.[0]?.id;
  if (!last) return 'P-001';
  const match = last.match(/^P-(\d+)$/);
  const num = match ? parseInt(match[1], 10) + 1 : 1;
  return `P-${String(num).padStart(3, '0')}`;
}

/** Load partners. With Supabase, supports limit/offset; returns array for backward compat. */
export async function loadPartners(opts = {}) {
  if (hasSupabase()) {
    const result = await loadFromSupabase(opts);
    return result.items;
  }
  const list = await loadFromLocalStorage();
  const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
  const offset = opts.offset ?? 0;
  return list.slice(offset, offset + limit);
}

/** Load partners with total count (for pagination UI). */
export async function loadPartnersWithTotal(opts = {}) {
  if (hasSupabase()) return loadFromSupabase(opts);
  const list = await loadFromLocalStorage();
  const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
  const offset = opts.offset ?? 0;
  return { items: list.slice(offset, offset + limit), total: list.length };
}

export async function savePartners(partners) {
  if (hasSupabase()) return saveToSupabase(partners);
  saveToLocalStorage(partners);
}

export async function getNextPartnerId(existingCount) {
  if (hasSupabase()) return getNextIdFromSupabase();
  return `P-${String(existingCount + 1).padStart(3, '0')}`;
}
