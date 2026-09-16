/**
 * Archive helpers for Injection and Translation.
 * Uses JSZip for extract/pack in the browser.
 */
import JSZip from 'jszip';

const HTML_EXT = /\.(html?|htm)$/i;

/**
 * Extract a ZIP file to an array of { path, content }.
 * content is string for text files, Uint8Array for binary.
 * @param {File} file - ZIP file
 * @returns {Promise<Array<{ path: string, content: string | Uint8Array }>>}
 */
export async function extractArchive(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const isText = /\.(html?|htm|css|js|json|xml|txt|svg)$/i.test(path);
    const content = isText ? await entry.async('string') : await entry.async('uint8array');
    entries.push({ path, content });
  }
  return entries;
}

/**
 * Get list of paths from a ZIP (no content loaded).
 * @param {File} file - ZIP file
 * @returns {Promise<string[]>}
 */
export async function listArchivePaths(file) {
  const zip = await JSZip.loadAsync(file);
  return Object.entries(zip.files)
    .filter(([, entry]) => !entry.dir)
    .map(([path]) => path);
}

/**
 * Check if path looks like HTML.
 */
export function isHtmlPath(path) {
  return HTML_EXT.test(path);
}

/**
 * Pack entries into a new ZIP Blob.
 * @param {Array<{ path: string, content: string | Uint8Array }>} entries
 * @returns {Promise<Blob>}
 */
export async function packArchive(entries) {
  const zip = new JSZip();
  for (const { path, content } of entries) {
    if (typeof content === 'string') {
      zip.file(path, content);
    } else {
      zip.file(path, content);
    }
  }
  return zip.generateAsync({ type: 'blob' });
}

/**
 * Create a download link for a Blob.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'archive.zip';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
