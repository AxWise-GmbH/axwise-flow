/**
 * Agent Rating Service — CRUD for agent_ratings table
 */
import { supabase, hasSupabase } from '../lib/supabase';

export async function getAgentRatings(agentId) {
  if (!hasSupabase()) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('agent_ratings')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getAgentRatings:', error.message);
    return [];
  }
  return data || [];
}

export async function getAllUserRatings() {
  if (!hasSupabase()) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('agent_ratings')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getAllUserRatings:', error.message);
    return [];
  }
  return data || [];
}

export async function getAgentAverageRating(agentId) {
  const ratings = await getAgentRatings(agentId);
  if (ratings.length === 0) return { average: 0, count: 0 };
  const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
  return { average: Math.round((sum / ratings.length) * 10) / 10, count: ratings.length };
}

export async function submitRating({
  agentId,
  rating,
  comment,
  ratingType = 'individual',
  teamId = null,
  requestId = null,
}) {
  if (!hasSupabase()) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('agent_ratings')
    .insert({
      user_id: user.id,
      agent_id: agentId,
      rating,
      comment: comment || null,
      rating_type: ratingType,
      team_id: teamId,
      request_id: requestId,
    })
    .select()
    .single();
  if (error) {
    console.error('submitRating:', error.message);
    return null;
  }
  return data;
}

export async function updateRating(ratingId, { rating, comment }) {
  if (!hasSupabase()) return null;
  const { data, error } = await supabase
    .from('agent_ratings')
    .update({ rating, comment: comment || null, updated_at: new Date().toISOString() })
    .eq('id', ratingId)
    .select()
    .single();
  if (error) {
    console.error('updateRating:', error.message);
    return null;
  }
  return data;
}

export async function deleteRating(ratingId) {
  if (!hasSupabase()) return false;
  const { error } = await supabase.from('agent_ratings').delete().eq('id', ratingId);
  if (error) {
    console.error('deleteRating:', error.message);
    return false;
  }
  return true;
}

// ── Rating activity log (agent_rating_events) ──────────────────────────────
// Append-only log fed by DB triggers from BOTH the Consilium (board
// overall_score, 0-10) and platform users (1-5 stars). See migration 164.

/**
 * Recent rating events for an agent, newest first, from both sources.
 * @param {string} agentId
 * @param {number} [limit=20]
 */
export async function getRatingEvents(agentId, limit = 20) {
  if (!hasSupabase() || !agentId) return [];
  const { data, error } = await supabase
    .from('agent_rating_events')
    .select('id, source, rating_value, rating_scale, comment, board_id, approved, created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('getRatingEvents:', error.message);
    return [];
  }
  return data || [];
}

/**
 * The Consilium's rating of an agent: average board overall_score (0-10) and
 * the number of board evaluations. `normalizedStars` rescales to 0-5 for
 * display next to the user's star rating.
 * @param {string} agentId
 */
export async function getConsiliumRating(agentId) {
  const empty = { average: 0, count: 0, normalizedStars: 0 };
  if (!hasSupabase() || !agentId) return empty;
  const { data, error } = await supabase
    .from('agent_rating_events')
    .select('rating_value')
    .eq('agent_id', agentId)
    .eq('source', 'consilium');
  if (error) {
    console.error('getConsiliumRating:', error.message);
    return empty;
  }
  const rows = data || [];
  if (rows.length === 0) return empty;
  const avg = rows.reduce((s, r) => s + (Number(r.rating_value) || 0), 0) / rows.length;
  const average = Math.round(avg * 10) / 10;
  return { average, count: rows.length, normalizedStars: Math.round((average / 2) * 10) / 10 };
}
