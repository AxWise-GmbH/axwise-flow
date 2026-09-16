/**
 * Knowledge base service — CRUD, search, tags, multi-owner.
 * Talks to /api/knowledge-base endpoint.
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

async function post(op, body) {
  const res = await fetch(`${getBase()}/api/knowledge-base?op=${op}`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `KB ${op} failed`);
  return data;
}

async function get(op, params = {}) {
  const qs = new URLSearchParams({ op, ...params });
  const res = await fetch(`${getBase()}/api/knowledge-base?${qs}`, {
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `KB ${op} failed`);
  return data;
}

// ── CRUD ────────────────────────────────────────────────

/** Add a document (note, file, link, or template). */
export function addDocument(doc) {
  return post('add', doc);
}

/** Update a document by ID. Pass only the fields to change. */
export function updateDocument(id, patch) {
  return post('update', { id, ...patch });
}

/** Delete a document by ID. */
export function deleteDocument(id) {
  return post('delete', { id });
}

/**
 * Register agent personas in the Knowledge Base (one embedded, deduped doc per
 * agent) so activated agents are recall-able and show in the "agents in KB" view.
 * @param {Array<{role: string, content: string, title?: string}>} items
 */
export function registerAgentsInKb(items) {
  return post('register-agent', { items });
}

/** Get a single document by ID (includes full content). */
export function getDocument(id) {
  return get('get', { id });
}

/** List version snapshots for a document (newest first). Returns { versions: [...] }. */
export function listDocumentVersions(id) {
  return get('versions', { id });
}

// ── Search & List ───────────────────────────────────────

/** Semantic search. */
export function searchKnowledge(query, opts = {}) {
  return post('search', { query, ...opts });
}

/**
 * List documents with optional filters.
 * @param {object} [opts] - { category, owner_type, owner_id, content_type, is_pinned, organization_id, concilium_id, limit }
 */
export function listDocuments(opts = {}) {
  const params = {};
  for (const [k, v] of Object.entries(opts)) {
    if (v !== undefined && v !== null && v !== '') params[k] = String(v);
  }
  return get('list', params);
}

/** Agent-scoped semantic search (filters by owner_type + owner_id). */
export function searchAgentMemory(query, ownerType, ownerId, opts = {}) {
  return post('search', { query, owner_type: ownerType, owner_id: ownerId, ...opts });
}

/**
 * List combined agent memory: direct agent-scoped records (all categories) +
 * goal-scoped records from goals this agent participated in.
 * Returns docs tagged with source_tag: 'direct' | 'goal-linked' and optional goal_title.
 */
export function listAgentMemory(agentId, opts = {}) {
  return get('list-agent-memory', { agent_id: agentId, ...opts });
}

/** List all distinct tags for the current user. */
export function listTags() {
  return get('tags');
}

// ── Bookmarks (link docs, category 'bookmark') ──────────

/**
 * Save a bookmark: a link-type KB doc under category 'bookmark'.
 * `collection` becomes a tag (alongside 'bookmark') so links can be grouped
 * for later reuse by agents. The backend auto-scrapes the title/description
 * from the URL when no title is supplied.
 * @param {object} bm - { url, title?, collection?, note?, organization_id?, owner_type?, owner_id? }
 */
export function addBookmark({ url, title, collection, note, organization_id, owner_type, owner_id } = {}) {
  const tags = ['bookmark'];
  if (collection) tags.push(collection);
  return addDocument({
    content_type: 'link',
    category: 'bookmark',
    url,
    title: title || '',
    content: note || '',
    tags,
    organization_id: organization_id || null,
    owner_type: owner_type || 'user',
    owner_id: owner_id || null,
  });
}

/**
 * List bookmarks (link docs under category 'bookmark'). Filter by `collection`
 * (a tag) is applied client-side since the list endpoint does not filter tags.
 * @param {object} [opts] - { collection, organization_id, limit }
 */
export async function listBookmarks({ collection, organization_id, limit } = {}) {
  const res = await listDocuments({
    category: 'bookmark',
    content_type: 'link',
    organization_id,
    limit,
  });
  const docs = Array.isArray(res) ? res : res?.data || res || [];
  if (!collection) return docs;
  return docs.filter((d) => Array.isArray(d.tags) && d.tags.includes(collection));
}

/** List distinct agent names that have documents in the KB. */
export function listKBAgents() {
  return get('agents_in_kb');
}
