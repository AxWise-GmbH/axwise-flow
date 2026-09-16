/**
 * Strategy Center backend – save snapshots and load history from database.
 */
import { supabase, hasSupabase } from '../lib/supabase';

/** Save a strategy snapshot for the current user. */
export async function saveStrategySnapshot({ userId, periodKey, periodLabel, payload }) {
  if (!hasSupabase() || !supabase || !userId) return;
  try {
    await supabase.from('strategy_center_snapshots').insert({
      user_id: userId,
      period_key: periodKey || '',
      period_label: periodLabel || '',
      payload: payload || {},
    });
  } catch {
    // Non-critical
  }
}

/** Load strategy snapshots for the current user, newest first. */
export async function loadStrategySnapshots(opts = {}) {
  if (!hasSupabase() || !supabase) return [];
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return [];
    const { data, error } = await supabase
      .from('strategy_center_snapshots')
      .select('id, period_key, period_label, payload, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}
