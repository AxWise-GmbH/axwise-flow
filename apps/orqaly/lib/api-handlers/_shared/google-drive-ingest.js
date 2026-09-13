/**
 * Google Drive -> Knowledge Base ingest. Lists files (optionally under a folder),
 * exports Google-native docs/sheets to text and downloads plain-text files, then
 * upserts deduped by `source: gdrive:<file-id>`. Uses the Drive v3 HTTP API with
 * a Bearer token (OAuth or a BYOK access token). No SDK.
 *
 * This finishes the previous 501 "coming soon" stub for the google-drive source.
 *
 * @param {object} p
 * @param {object} p.admin
 * @param {string} p.userId
 * @param {string} p.token        Google OAuth / access token (Bearer)
 * @param {string|null} [p.connectionId]
 * @param {object} [p.scope]      { folderId?: string }
 * @returns {Promise<{count:number, truncated:boolean}>}
 * @throws {Error} with `.status`
 */
import { fetchWithRetry } from '../../../api/_lib/fetch.js';
import { isTextFile, ingestItems, MAX_FILES } from './kb-ingest-common.js';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const GOOGLE_DOC = 'application/vnd.google-apps.document';
const GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet';
const FOLDER = 'application/vnd.google-apps.folder';

async function driveGet(token, url) {
  const res = await fetchWithRetry(
    url.startsWith('http') ? url : `${DRIVE}${url}`,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
    { timeoutMs: 15000, retries: 1 }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`Google Drive API failed (${res.status}): ${detail.slice(0, 200)}`);
    err.status = res.status === 401 ? 401 : res.status;
    throw err;
  }
  return res;
}

async function download(token, file) {
  try {
    if (file.mimeType === GOOGLE_DOC) {
      const r = await driveGet(token, `/files/${file.id}/export?mimeType=text/plain`);
      return r.text();
    }
    if (file.mimeType === GOOGLE_SHEET) {
      const r = await driveGet(token, `/files/${file.id}/export?mimeType=text/csv`);
      return r.text();
    }
    const r = await driveGet(token, `/files/${file.id}?alt=media`);
    return r.text();
  } catch {
    return '';
  }
}

export async function syncGoogleDriveToKb({ admin, userId, token, connectionId = null, scope = {} }) {
  const parts = ['trashed = false', `mimeType != '${FOLDER}'`];
  if (scope?.folderId) parts.push(`'${String(scope.folderId).replace(/'/g, '')}' in parents`);
  const q = encodeURIComponent(parts.join(' and '));

  const files = [];
  let url = `${DRIVE}/files?q=${q}&pageSize=200&fields=nextPageToken,files(id,name,mimeType,webViewLink)`;
  while (url && files.length < MAX_FILES + 1) {
    const res = await driveGet(token, url);
    const data = await res.json();
    for (const f of data.files || []) {
      if (f.mimeType === GOOGLE_DOC || f.mimeType === GOOGLE_SHEET || isTextFile(f.name, f.mimeType)) {
        files.push(f);
      }
    }
    url = data.nextPageToken
      ? `${DRIVE}/files?q=${q}&pageSize=200&pageToken=${data.nextPageToken}&fields=nextPageToken,files(id,name,mimeType,webViewLink)`
      : null;
  }

  const items = [];
  for (const f of files.slice(0, MAX_FILES)) {
    const content = await download(token, f);
    if (!content.trim()) continue;
    items.push({
      source: `gdrive:${f.id}`,
      title: f.name,
      content,
      url: f.webViewLink || null,
    });
  }

  return ingestItems({ admin, userId, connectionId, sourceTag: 'google-drive', items, log: console.info });
}
