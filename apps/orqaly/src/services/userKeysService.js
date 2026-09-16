/**
 * Frontend client for /api/app?path=user-api-keys{,-test,-providers}.
 * Never handles raw key material except at the exact moment the user types
 * it in the dialog and the service POSTs it — plaintext is never cached.
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

export async function listUserKeys() {
  const res = await fetch(`${getBase()}/api/app?path=user-api-keys`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load keys');
  return data.keys || [];
}

export async function listProviders() {
  const res = await fetch(`${getBase()}/api/app?path=user-api-keys-providers`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load providers');
  return data.providers || [];
}

export async function testUserKey({ provider, apiKey }) {
  const res = await fetch(`${getBase()}/api/app?path=user-api-keys-test`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ provider, apiKey }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    return { ok: false, code: data.code || 'ERROR', message: data.error || data.message };
  return data;
}

export async function saveUserKey({
  provider,
  apiKey,
  slot = 'default',
  label = null,
  skipProbe = false,
}) {
  const res = await fetch(`${getBase()}/api/app?path=user-api-keys`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ provider, apiKey, slot, label, skipProbe }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Failed to save key');
  return data;
}

export async function deleteUserKey(id) {
  const url = `${getBase()}/api/app?path=user-api-keys&id=${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: 'DELETE', headers: await getHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete key');
  return data;
}
