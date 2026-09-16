/**
 * Mega -> Knowledge Base ingest. Mega is end-to-end encrypted with no OAuth, so
 * this logs in with the user's email + password (resolved from the vault) via the
 * `megajs` library, walks the account (bounded BFS), downloads + decrypts text
 * files, and upserts deduped by `source: mega:<node-handle>`.
 *
 * `megajs` is imported lazily so a missing/optional dependency never breaks the
 * kb-connections handler at load time - only a Mega sync fails, cleanly.
 *
 * @param {object} p
 * @param {object} p.admin
 * @param {string} p.userId
 * @param {{email:string,password:string}} p.creds
 * @param {string|null} [p.connectionId]
 * @returns {Promise<{count:number, truncated:boolean}>}
 * @throws {Error} with `.status`
 */
import { isTextFile, ingestItems, MAX_FILES } from './kb-ingest-common.js';

const MAX_NODES = 400; // BFS guard over the account tree

function downloadBuffer(file) {
  return new Promise((resolve, reject) => {
    try {
      file.downloadBuffer((err, data) => (err ? reject(err) : resolve(data)));
    } catch (err) {
      reject(err);
    }
  });
}

export async function syncMegaToKb({ admin, userId, creds, connectionId = null }) {
  let Storage;
  try {
    ({ Storage } = await import('megajs'));
  } catch {
    const err = new Error('Mega support is not installed on the server (megajs).');
    err.status = 501;
    throw err;
  }

  let storage;
  try {
    storage = await new Storage({ email: creds.email, password: creds.password }).ready;
  } catch (e) {
    const err = new Error(`Mega login failed: ${String(e?.message || e).slice(0, 160)}`);
    err.status = 401;
    throw err;
  }

  // BFS the tree collecting text files.
  const queue = [storage.root];
  const files = [];
  let visited = 0;
  while (queue.length && visited < MAX_NODES && files.length < MAX_FILES + 1) {
    const node = queue.shift();
    visited += 1;
    const children = node?.children || [];
    for (const child of children) {
      if (child.directory) queue.push(child);
      else if (isTextFile(child.name)) files.push(child);
    }
  }

  const items = [];
  for (const f of files.slice(0, MAX_FILES)) {
    let content = '';
    try {
      const buf = await downloadBuffer(f);
      content = buf ? buf.toString('utf8') : '';
    } catch {
      content = '';
    }
    if (!content.trim()) continue;
    items.push({ source: `mega:${f.nodeId}`, title: f.name, content, url: null });
  }

  try {
    storage.close?.();
  } catch {
    /* best-effort */
  }

  return ingestItems({ admin, userId, connectionId, sourceTag: 'mega', items, log: console.info });
}
