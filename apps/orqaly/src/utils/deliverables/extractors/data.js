/**
 * Data export extractor — scans task outputs for downloadable data
 * files and structured data sources:
 *   - Supabase Storage .csv / .json URLs
 *   - Bare .csv / .json / .xlsx / .tsv URLs anywhere on the web
 *   - Google Sheets URLs (docs.google.com/spreadsheets/d/...)
 *   - Airtable base URLs (airtable.com/app...)
 *
 * Returns { url, kind, filename, taskTitle } where kind is one of
 * 'csv' | 'json' | 'xlsx' | 'tsv' | 'sheets' | 'airtable'.
 */
import { isPlaceholder, trimTrailingPunct, getTaskTitle, findArtifactByUrl } from '../shared.js';

const FILE_EXT_RE = /https?:\/\/[\w.-]+[^\s)>\]"']*\.(csv|json|xlsx|tsv)(?:\?[^\s)>\]"']*)?/gi;
const SHEETS_RE = /https?:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+(?:\/[\w?=&#]*)?/gi;
const AIRTABLE_RE = /https?:\/\/airtable\.com\/(?:embed\/)?app[\w/]+/gi;

function extractFromText(text) {
  const results = new Map(); // url → { kind }
  if (!text) return results;

  // Files by extension
  for (const match of text.matchAll(FILE_EXT_RE)) {
    const url = trimTrailingPunct(match[0]);
    if (url && !isPlaceholder(url)) {
      results.set(url, { kind: match[1].toLowerCase() });
    }
  }

  // Google Sheets
  for (const match of text.matchAll(SHEETS_RE)) {
    const url = trimTrailingPunct(match[0]);
    if (url && !isPlaceholder(url) && !results.has(url)) {
      results.set(url, { kind: 'sheets' });
    }
  }

  // Airtable
  for (const match of text.matchAll(AIRTABLE_RE)) {
    const url = trimTrailingPunct(match[0]);
    if (url && !isPlaceholder(url) && !results.has(url)) {
      results.set(url, { kind: 'airtable' });
    }
  }

  return results;
}

function filenameFromUrl(url, kind) {
  if (kind === 'sheets') return 'Google Sheet';
  if (kind === 'airtable') return 'Airtable base';
  const raw = url.split('/').pop() || `data.${kind}`;
  return decodeURIComponent(raw.split('?')[0]);
}

export function extractDataExports(tasks, _allTasks, ctx = {}) {
  const artifacts = Array.isArray(ctx.artifacts) ? ctx.artifacts : [];
  const results = new Map();
  for (const task of tasks) {
    const output = String(task.data?.output || '');
    const title = getTaskTitle(task);
    const urls = extractFromText(output);
    for (const [url, { kind }] of urls) {
      if (results.has(url)) continue;
      const matched = findArtifactByUrl(artifacts, url, ['data']);
      results.set(url, {
        url,
        kind,
        filename: filenameFromUrl(url, kind),
        taskTitle: title,
        parentKind: matched ? 'goal_artifact' : undefined,
        parentId: matched ? matched.id : undefined,
        artifactKind: matched ? matched.kind : undefined,
      });
    }
  }
  return Array.from(results.values());
}
