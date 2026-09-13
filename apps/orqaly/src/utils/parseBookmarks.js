/**
 * Parse exported browser bookmarks into a flat list of { url, title, collection }.
 *
 * Supports:
 *  - Netscape Bookmark HTML (Chrome, Edge, Firefox "Export bookmarks to HTML"):
 *    nested <DL> lists where each <DT><H3> is a folder and each <DT><A HREF> is a link.
 *    The nearest enclosing folder name becomes the `collection`.
 *  - Firefox JSON backup: a tree of nodes typed 'text/x-moz-place' (link) /
 *    'text/x-moz-place-container' (folder).
 *
 * Collections map to a KB tag so links can be grouped for later reuse by agents.
 */

const MAX_COLLECTION_LEN = 60;

function cleanCollection(name) {
  const n = (name || '').trim();
  if (!n) return '';
  // Skip the browser's top-level container folders — they aren't useful tags.
  const generic = ['bookmarks', 'bookmarks bar', 'bookmarks menu', 'bookmarks toolbar', 'other bookmarks', 'mobile bookmarks', 'favorites bar'];
  if (generic.includes(n.toLowerCase())) return '';
  return n.slice(0, MAX_COLLECTION_LEN);
}

function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

/** Parse the Netscape Bookmark HTML format using DOMParser. */
export function parseBookmarksHtml(html) {
  const out = [];
  if (typeof html !== 'string' || !html.trim()) return out;
  if (typeof DOMParser === 'undefined') return out;

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Walk every <A>; its collection is the text of the <H3> that heads the
  // <DL> the link lives in. In the Netscape format the <H3> is the previous
  // sibling of the <DL>, both wrapped in <DT> elements.
  const anchors = doc.querySelectorAll('a[href]');
  anchors.forEach((a) => {
    const url = a.getAttribute('href') || '';
    if (!isHttpUrl(url)) return;
    const title = (a.textContent || '').trim() || url;

    let collection = '';
    // Climb ancestors to find the enclosing <DL>, then its heading <H3>.
    let node = a;
    while (node && node !== doc.body) {
      const dl = node.closest ? node.closest('dl') : null;
      if (!dl) break;
      // The folder heading precedes this DL (usually inside a sibling <DT>).
      let prev = dl.previousElementSibling;
      while (prev && !collection) {
        const h3 = prev.tagName === 'H3' ? prev : prev.querySelector?.('h3');
        if (h3) collection = cleanCollection(h3.textContent);
        prev = prev.previousElementSibling;
      }
      if (collection) break;
      node = dl.parentElement;
    }

    out.push({ url: url.trim(), title, collection });
  });

  return out;
}

/** Parse a Firefox JSON bookmark backup (recursively). */
export function parseBookmarksJson(text) {
  const out = [];
  let root;
  try {
    root = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    return out;
  }

  const walk = (node, collection) => {
    if (!node || typeof node !== 'object') return;
    const type = node.type || '';
    if (type === 'text/x-moz-place' && isHttpUrl(node.uri)) {
      out.push({
        url: node.uri.trim(),
        title: (node.title || '').trim() || node.uri.trim(),
        collection,
      });
      return;
    }
    // Container/folder: its title becomes the collection for its children.
    const nextCollection =
      type === 'text/x-moz-place-container' ? cleanCollection(node.title) || collection : collection;
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => walk(child, nextCollection));
    }
  };

  walk(root, '');
  return out;
}

/**
 * Detect the format from file name/content and parse. Returns deduped
 * (by URL) list of { url, title, collection }.
 */
export function parseBookmarksFile(text, fileName = '') {
  const trimmed = (text || '').trimStart();
  const looksJson = /\.json$/i.test(fileName) || trimmed.startsWith('{');
  const parsed = looksJson ? parseBookmarksJson(text) : parseBookmarksHtml(text);

  const seen = new Set();
  const deduped = [];
  for (const bm of parsed) {
    const key = bm.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(bm);
  }
  return deduped;
}
