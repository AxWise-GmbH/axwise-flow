/** Browser client for the server-side encrypted tool credential boundary. */
import { supabase, hasSupabase } from '../lib/supabase';

async function authenticatedHeaders() {
  if (!hasSupabase()) throw new Error('Encrypted credential storage requires sign-in.');
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in before saving a credential.');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
}

function baseUrl() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export async function saveEncryptedToolCredential(toolId, credential) {
  if (!toolId) throw new Error('Tool id is required.');
  const apiKey = typeof credential?.apiKey === 'string' ? credential.apiKey.trim() : '';
  const webhookSecret =
    typeof credential?.webhookSecret === 'string' ? credential.webhookSecret.trim() : '';
  if (!apiKey && !webhookSecret) return null;
  if (apiKey && webhookSecret) {
    throw new Error('Save one credential type at a time.');
  }

  const res = await fetch(`${baseUrl()}/api/app?path=tool-setup`, {
    method: 'POST',
    headers: await authenticatedHeaders(),
    body: JSON.stringify({
      toolId,
      apiKey: apiKey || undefined,
      webhookSecret: webhookSecret || undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(data.error || data.message || 'Failed to save encrypted credential.');
  return data;
}

export async function fetchEncryptedToolStatuses() {
  const res = await fetch(`${baseUrl()}/api/app?path=tool-setup`, {
    headers: await authenticatedHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load encrypted credential status.');
  return Array.isArray(data.tools) ? data.tools : [];
}
