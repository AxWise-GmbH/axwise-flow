/**
 * Notification service — in-app bell + Web Push subscribe flow.
 * Server contract: lib/api-handlers/notifications.js (via /api/app?path=notifications)
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

async function request(op, method = 'GET', params = {}, body = null) {
  const qs = new URLSearchParams({ op, ...params });
  for (const [k, v] of qs.entries()) if (!v) qs.delete(k);
  const opts = { method, headers: await getHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${getBase()}/api/app?path=notifications&${qs}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Notifications ${op} failed`);
  return data;
}

export function listNotifications(since = null) {
  return request('list', 'GET', since ? { since } : {});
}

export function markRead(id) {
  return request('mark-read', 'POST', { id });
}

export function markAllRead() {
  return request('mark-all-read', 'POST', {});
}

export function getVapidPublicKey() {
  return request('vapid-public-key', 'GET', {});
}

export function pushSubscribe(subscription) {
  return request(
    'push-subscribe',
    'POST',
    {},
    {
      endpoint: subscription.endpoint,
      keys: subscription.toJSON ? subscription.toJSON().keys : subscription.keys,
    }
  );
}

export function pushUnsubscribe(endpoint) {
  return request('push-unsubscribe', 'POST', {}, { endpoint });
}
