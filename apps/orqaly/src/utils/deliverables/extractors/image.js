/**
 * Image extractor — scans task outputs for ASSET_URL: markers
 * pointing at image files, bare PNG/JPG/WebP/GIF/SVG URLs, and
 * Supabase Storage image paths. Returns { url, taskTitle, slot }.
 *
 * Slot is a human-friendly label like "Generate Banners 1/5" used
 * as the caption overlay in the thumbnail grid.
 */
import { isPlaceholder, trimTrailingPunct, getTaskTitle, findArtifactByUrl } from '../shared.js';

const ASSET_URL_IMG_RE =
  /ASSET_URL:\s*(https?:\/\/[^\s)>\]"']+\.(?:png|jpe?g|webp|gif|svg)[^\s)>\]"']*)/gi;
const BARE_IMG_RE =
  /https?:\/\/[\w.-]+[^\s)>\]"']*\.(?:png|jpe?g|webp|gif|svg)(?:\?[^\s)>\]"']*)?/gi;
const PDF_RE = /\.pdf(?:\?|$)/i; // guard against PDFs bleeding into the image list

function extractFromText(text) {
  const results = new Set();
  if (!text) return results;

  for (const match of text.matchAll(ASSET_URL_IMG_RE)) {
    const url = trimTrailingPunct(match[1]);
    if (url && !isPlaceholder(url) && !PDF_RE.test(url)) results.add(url);
  }
  for (const match of text.matchAll(BARE_IMG_RE)) {
    const url = trimTrailingPunct(match[0]);
    if (url && !isPlaceholder(url) && !PDF_RE.test(url)) results.add(url);
  }
  return results;
}

export function extractImages(tasks, _allTasks, ctx = {}) {
  const artifacts = Array.isArray(ctx.artifacts) ? ctx.artifacts : [];
  const results = new Map();
  for (const task of tasks) {
    const output = String(task.data?.output || '');
    const title = getTaskTitle(task);
    const urls = extractFromText(output);
    let slot = 0;
    for (const url of urls) {
      if (results.has(url)) continue;
      slot += 1;
      const matched = findArtifactByUrl(artifacts, url, ['image', 'banner']);
      results.set(url, {
        url,
        taskTitle: title,
        slot: `${title} ${slot}`,
        parentKind: matched ? 'goal_artifact' : undefined,
        parentId: matched ? matched.id : undefined,
        artifactKind: matched ? matched.kind : undefined,
      });
    }
  }
  return Array.from(results.values());
}
