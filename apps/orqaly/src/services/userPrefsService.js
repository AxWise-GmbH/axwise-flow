/**
 * Frontend client for /api/app?path=user-prefs.
 * Persists the /setup page short-answer extras and the setup-completed flag.
 */
import { supabase, hasSupabase } from '../lib/supabase';

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

function getBase() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export async function getUserPrefs() {
  const res = await fetch(`${getBase()}/api/app?path=user-prefs`, { headers: await getHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load prefs');
  return data;
}

export async function updateUserPrefs(patch) {
  const res = await fetch(`${getBase()}/api/app?path=user-prefs`, {
    method: 'PUT',
    headers: await getHeaders(),
    body: JSON.stringify(patch || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to save prefs');
  return data;
}

export async function markSetupCompleted() {
  return updateUserPrefs({ setupCompleted: true });
}

export async function setUiMode(mode) {
  return updateUserPrefs({ uiMode: mode });
}

export async function setHiddenPagesPref(paths) {
  return updateUserPrefs({ hiddenPages: paths });
}

/** Per-user AxWise kill switch (persisted). false = backend skips AxWise for this user. */
export async function setAxwiseEnabledPref(enabled) {
  return updateUserPrefs({ axwiseEnabled: Boolean(enabled) });
}
