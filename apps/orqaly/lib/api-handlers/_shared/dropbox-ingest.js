/**
 * Dropbox -> Knowledge Base ingest. Lists a folder (recursive), downloads the
 * text files, and upserts them into knowledge_documents deduped by
 * `source: dropbox:<file-id>`. Uses the Dropbox HTTP API directly (no SDK).
 *
 * @param {object} p
 * @param {object} p.admin        supabase admin client
 * @param {string} p.userId
 * @param {string} p.token        Dropbox OAuth / access token (Bearer)
 * @param {string|null} [p.connectionId]
 * @param {object} [p.scope]      { path?: string }  (root folder, '' = whole Dropbox)
 * @returns {Promise<{count:number, truncated:boolean}>}
 * @throws {Error} with `.status` on API failure
 */
import { fetchWithRetry } from '../../../api/_lib/fetch.js';
import { isTextFile, ingestItems, MAX_FILES } from './kb-ingest-common.js';

const RPC = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

async function rpc(token, path, body) {
  const res = await fetchWithRetry(
    `${RPC}${path}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { timeoutMs: 15000, retries: 1 }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`Dropbox API ${path} failed (${res.status}): ${detail.slice(0, 200)}`);
    err.status = res.status === 401 ? 401 : res.status;
    throw err;
  }
  return res.json();
}

async function download(token, fileId) {
  const res = await fetchWithRetry(
    `${CONTENT}/files/download`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path: fileId }) },
    },
    { timeoutMs: 15000, retries: 1 }
  );
  if (!res.ok) return '';
  return res.text().catch(() => '');
}

export async function syncDropboxToKb({ admin, userId, token, connectionId = null, scope = {} }) {
  const root = typeof scope?.path === 'string' ? scope.path : '';

  // Page through list_folder until we have enough files (or run out).
  let page = await rpc(token, '/files/list_folder', { path: root, recursive: true, limit: 200 });
  const files = [];
  const collect = (entries) => {
    for (const e of entries || []) {
      if (e['.tag'] === 'file' && isTextFile(e.name)) files.push(e);
    }
  };
  collect(page.entries);
  while (page.has_more && files.length < MAX_FILES + 1) {
    page = await rpc(token, '/files/list_folder/continue', { cursor: page.cursor });
    collect(page.entries);
  }

  const items = [];
  for (const f of files.slice(0, MAX_FILES)) {
    const content = await download(token, f.id);
    if (!content.trim()) continue;
    items.push({
      source: `dropbox:${f.id}`,
      title: f.name,
      content,
      url: null,
    });
  }

  return ingestItems({ admin, userId, connectionId, sourceTag: 'dropbox', items, log: console.info });
}
