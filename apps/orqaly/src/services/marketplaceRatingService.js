/**
 * Marketplace rating & comment service — write-through to Supabase.
 * Reads from localStorage (instant) and syncs with Supabase in background.
 * Key: `orch_mp_ratings`
 */
import { supabase, hasSupabase } from '../lib/supabase';

const STORAGE_KEY = 'orch_mp_ratings';

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveLocal(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Sync ratings from Supabase into localStorage.
 * Call this on component mount to ensure DB data is reflected in UI.
 * @returns {Object} Map of itemId → { rating, comment, ratedAt }
 */
export async function syncRatingsFromDB() {
  if (!hasSupabase()) return loadLocal();
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return loadLocal();
    const { data, error } = await supabase
      .from('marketplace_ratings')
      .select('item_id, rating, comment, updated_at')
      .eq('user_id', user.id);
    if (error) {
      console.warn('syncRatingsFromDB:', error.message);
      return loadLocal();
    }
    const map = {};
    (data || []).forEach((r) => {
      map[r.item_id] = { rating: r.rating, comment: r.comment || '', ratedAt: r.updated_at };
    });
    saveLocal(map);
    return map;
  } catch (err) {
    console.warn('syncRatingsFromDB error:', err.message);
    return loadLocal();
  }
}

/**
 * Get all ratings from localStorage (synchronous — fast for initial render).
 */
export function getAllRatings() {
  return loadLocal();
}

/**
 * Get rating data for a specific item.
 */
export function getRating(itemId) {
  return loadLocal()[itemId] || { rating: null, comment: '', ratedAt: null };
}

/**
 * Save a rating. Writes to localStorage immediately, then syncs to Supabase.
 * @param {string} itemId
 * @param {number} rating - 1 to 5
 * @param {string} [comment='']
 * @param {string} [itemType='unknown'] - 'agent', 'skill', 'tool', 'team', 'org_template'
 */
export function saveRating(itemId, rating, comment = '', itemType = 'unknown') {
  // Write to localStorage synchronously (so UI updates immediately)
  const all = loadLocal();
  all[itemId] = {
    rating: Math.min(5, Math.max(1, rating)),
    comment: (comment || '').trim(),
    ratedAt: new Date().toISOString(),
  };
  saveLocal(all);

  // Write to Supabase in background (fire-and-forget)
  if (hasSupabase()) {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { error } = await supabase.from('marketplace_ratings').upsert(
          {
            user_id: user.id,
            item_id: itemId,
            item_type: itemType,
            rating: all[itemId].rating,
            comment: all[itemId].comment || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,item_id,item_type' }
        );
        if (error) console.warn('saveRating to DB:', error.message);
      } catch (err) {
        console.warn('saveRating DB error:', err.message);
      }
    })();
  }
}

/**
 * Remove a rating for an item.
 */
export function removeRating(itemId) {
  const all = loadLocal();
  delete all[itemId];
  saveLocal(all);

  if (hasSupabase()) {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { error } = await supabase
          .from('marketplace_ratings')
          .delete()
          .eq('user_id', user.id)
          .eq('item_id', itemId);
        if (error) console.warn('removeRating from DB:', error.message);
      } catch (err) {
        console.warn('removeRating DB error:', err.message);
      }
    })();
  }
}

/**
 * Get average rating stats across all items.
 */
export function getRatingStats() {
  const all = loadLocal();
  const entries = Object.values(all).filter((r) => r.rating != null);
  if (entries.length === 0) return { avgRating: 0, totalRated: 0 };
  const sum = entries.reduce((s, r) => s + r.rating, 0);
  return { avgRating: sum / entries.length, totalRated: entries.length };
}
