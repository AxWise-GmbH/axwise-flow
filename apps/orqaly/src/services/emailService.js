/**
 * Send email via the /api/send-email serverless function (Resend).
 * Requires the user to be signed in (Supabase); the session token is sent automatically.
 */

import { supabase, hasSupabase } from '../lib/supabase';

/**
 * @param {{ to: string | string[], subject: string, text?: string, html?: string }} options
 * @returns {Promise<{ success: boolean, id?: string }>}
 */
export async function sendEmail({ to, subject, text, html }) {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const headers = { 'Content-Type': 'application/json' };

  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  }

  const res = await fetch(`${base}/api/send-email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ to, subject, text, html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to send email');
  return data;
}
