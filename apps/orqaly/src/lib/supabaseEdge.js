import { supabase, hasSupabase } from './supabase.js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');

/**
 * Build the full URL for a Supabase Edge Function.
 * Pattern: {SUPABASE_URL}/functions/v1/{functionName}
 */
export function edgeFunctionUrl(functionName) {
  return `${supabaseUrl}/functions/v1/${functionName}`;
}

/**
 * Get an Authorization header with the current user's access token.
 * Returns empty object if no session is available.
 */
export async function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  }
  return headers;
}
