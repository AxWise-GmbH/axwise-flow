/**
 * OneDrive (Microsoft Graph) -> Knowledge Base ingest. Walks the drive (bounded
 * BFS over folders), downloads text files via their pre-authenticated
 * downloadUrl, and upserts deduped by `source: onedrive:<item-id>`. No SDK.
 *
 * @param {object} p
 * @param {object} p.admin
 * @param {string} p.userId
 * @param {string} p.token        Microsoft Graph access token (Bearer)
 * @param {string|null} [p.connectionId]
 * @param {object} [p.scope]      { folderId?: string }  (defaults to drive root)
 * @returns {Promise<{count:number, truncated:boolean}>}
 * @throws {Error} with `.status`
 */
import { fetchWithRetry } from '../../../api/_lib/fetch.js';
import { isTextFile, ingestItems, MAX_FILES } from './kb-ingest-common.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const MAX_FOLDERS = 40; // BFS guard

async function graphGet(token, url) {
  const res = await fetchWithRetry(
    url.startsWith('http') ? url : `${GRAPH}${url}`,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
    { timeoutMs: 15000, retries: 1 }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`OneDrive API failed (${res.status}): ${detail.slice(0, 200)}`);
    err.status = res.status === 401 ? 401 : res.status;
    throw err;
  }
  return res.json();
}

async function childrenOf(token, folderId) {
  const path = folderId ? `/me/drive/items/${folderId}/children` : '/me/drive/root/children';
  const out = [];
  let next = `${GRAPH}${path}?$top=200`;
  while (next) {
    const page = await graphGet(token, next);
    out.push(...(page.value || []));
    next = page['@odata.nextLink'] || null;
    if (out.length > 1000) break; // hard safety
  }
  return out;
}

async function downloadFile(token, item) {
  const url = item['@microsoft.graph.downloadUrl'];
  if (url) {
    const res = await fetchWithRetry(url, { method: 'GET' }, { timeoutMs: 15000, retries: 1 });
    return res.ok ? res.text().catch(() => '') : '';
  }
  const res = await fetchWithRetry(
    `${GRAPH}/me/drive/items/${item.id}/content`,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
    { timeoutMs: 15000, retries: 1 }
  );
  return res.ok ? res.text().catch(() => '') : '';
}

export async function syncOneDriveToKb({ admin, userId, token, connectionId = null, scope = {} }) {
  const rootId = typeof scope?.folderId === 'string' && scope.folderId ? scope.folderId : null;

  const queue = [rootId];
  const files = [];
  let foldersVisited = 0;
  while (queue.length && foldersVisited < MAX_FOLDERS && files.length < MAX_FILES + 1) {
    const folderId = queue.shift();
    foldersVisited += 1;
    const entries = await childrenOf(token, folderId);
    for (const e of entries) {
      if (e.folder) queue.push(e.id);
      else if (e.file && isTextFile(e.name, e.file?.mimeType)) files.push(e);
    }
  }

  const items = [];
  for (const f of files.slice(0, MAX_FILES)) {
    const content = await downloadFile(token, f);
    if (!content.trim()) continue;
    items.push({
      source: `onedrive:${f.id}`,
      title: f.name,
      content,
      url: f.webUrl || null,
    });
  }

  return ingestItems({ admin, userId, connectionId, sourceTag: 'onedrive', items, log: console.info });
}
