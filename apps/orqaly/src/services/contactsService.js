/**
 * Contacts service — CRM Contact management.
 * Talks to /api/contacts endpoint.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { maybeNotify } from './emailNotificationDispatcher';

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

async function post(op, body) {
  const res = await fetch(`${getBase()}/api/contacts?op=${op}`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Contacts ${op} failed`);
  return data;
}

async function get(op, params = {}) {
  const qs = new URLSearchParams({ op, ...params });
  const res = await fetch(`${getBase()}/api/contacts?${qs}`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Contacts ${op} failed`);
  return data;
}

// ── Service Endpoints ────────────────────────────────────

/**
 * List contacts with optional filters.
 * @param {object} [filters] - { search_text, limit }
 */
export function listContacts(filters = {}) {
  const params = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') params[k] = String(v);
  }
  return get('list', params);
}

/** Add a new contact */
export function addContact(contact) {
  return post('add', contact).then((r) => {
    maybeNotify('contact_added', { name: contact?.name || contact?.email || '' });
    return r;
  });
}

/** Update a contact by ID */
export function updateContact(id, patch) {
  return post('update', { id, ...patch });
}

/** Delete a contact by ID */
export function deleteContact(id) {
  return post('delete', { id }).then((r) => {
    maybeNotify('contact_removed', { id });
    return r;
  });
}

/** Bulk import contacts list */
export function importContacts(contactsList) {
  return post('import', { contacts: contactsList });
}

/** Trigger duplicates / cross-matching scan job */
export function findMatches() {
  return post('find-matches', {});
}
