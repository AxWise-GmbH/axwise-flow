/**
 * PDF extractor — scans task outputs for ASSET_URL: markers pointing
 * at .pdf files, bare .pdf URLs, and Supabase Storage .pdf paths.
 * Returns an array of { url, filename, taskTitle } deduped by URL.
 */
import { isPlaceholder, trimTrailingPunct, getTaskTitle, findArtifactByUrl } from '../shared.js';

const ASSET_URL_PDF_RE = /ASSET_URL:\s*(https?:\/\/[^\s)>\]"']+\.pdf[^\s)>\]"']*)/gi;
const BARE_PDF_RE = /https?:\/\/[\w.-]+[^\s)>\]"']*\.pdf(?:\?[^\s)>\]"']*)?/gi;

function extractFromText(text) {
  const results = new Set();
  if (!text) return results;

  for (const match of text.matchAll(ASSET_URL_PDF_RE)) {
    const url = trimTrailingPunct(match[1]);
    if (url && !isPlaceholder(url)) results.add(url);
  }
  for (const match of text.matchAll(BARE_PDF_RE)) {
    const url = trimTrailingPunct(match[0]);
    if (url && !isPlaceholder(url)) results.add(url);
  }
  return results;
}

export function extractPdfs(tasks, _allTasks, ctx = {}) {
  const artifacts = Array.isArray(ctx.artifacts) ? ctx.artifacts : [];
  const results = new Map();
  for (const task of tasks) {
    const output = String(task.data?.output || '');
    const title = getTaskTitle(task);
    const urls = extractFromText(output);
    for (const url of urls) {
      if (results.has(url)) continue;
      const filename = decodeURIComponent(url.split('/').pop() || 'document.pdf').split('?')[0];
      const matched = findArtifactByUrl(artifacts, url, ['pdf', 'deck']);
      results.set(url, {
        url,
        filename,
        taskTitle: title,
        parentKind: matched ? 'goal_artifact' : undefined,
        parentId: matched ? matched.id : undefined,
        artifactKind: matched ? matched.kind : undefined,
      });
    }
  }
  return Array.from(results.values());
}
