import JSZip from 'jszip';
import { supabase, hasSupabase } from '../lib/supabase';
import { addDocument } from './knowledgeBaseService';

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

/** Trigger Notion background sync. */
export async function triggerNotionSync() {
  const res = await fetch(`${getBase()}/api/notion-sync`, {
    method: 'POST',
    headers: await getHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Notion sync failed');
  return data;
}

/** Parse simple Obsidian frontmatter and markdown body */
export function parseObsidianMarkdown(filename, rawText) {
  let title = filename.replace(/\.md$/i, '').split('/').pop() || 'Untitled Note';
  let content = rawText;
  let tags = ['obsidian', 'imported'];

  // Parse frontmatter
  const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
  const match = rawText.match(fmRegex);

  if (match) {
    const fmText = match[1];
    content = rawText.replace(fmRegex, '').trim();

    // Look for tags and title in frontmatter
    const lines = fmText.split('\n');
    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length < 2) continue;
      const key = parts[0].trim().toLowerCase();
      const val = parts.slice(1).join(':').trim();

      if (key === 'title') {
        title = val.replace(/['"]/g, '');
      } else if (key === 'tags') {
        // Try parsing YAML list like [tag1, tag2] or space separated
        let tagList = [];
        if (val.startsWith('[') && val.endsWith(']')) {
          tagList = val
            .slice(1, -1)
            .split(',')
            .map((t) => t.trim().replace(/['"]/g, ''));
        } else {
          tagList = val.split(/[\s,]+/).map((t) => t.trim());
        }
        tags = [...new Set([...tags, ...tagList.filter(Boolean)])];
      }
    }
  }

  // Fallback title from first h1
  if (content.startsWith('# ')) {
    const lines = content.split('\n');
    title = lines[0].slice(2).trim();
  }

  return { title, content, tags };
}

/**
 * Process a ZIP file containing an Obsidian vault and upload md files to KB.
 */
export async function processObsidianZip(zipFile, onProgress) {
  const zip = await JSZip.loadAsync(zipFile);
  const files = Object.keys(zip.files).filter(
    (path) => path.toLowerCase().endsWith('.md') && !path.startsWith('.') && !path.includes('/.')
  );

  const total = files.length;
  if (total === 0) {
    throw new Error('No Markdown (.md) files found in the vault archive.');
  }

  let importedCount = 0;
  const syncedFiles = [];

  for (let i = 0; i < total; i++) {
    const path = files[i];
    try {
      const text = await zip.files[path].async('text');
      const { title, content, tags } = parseObsidianMarkdown(path, text);

      if (!content.trim()) continue;

      const doc = {
        title,
        content,
        category: 'general',
        tags,
        owner_type: 'user',
        content_type: 'note',
        source: `obsidian:${path}`,
      };

      await addDocument(doc);
      importedCount++;
      syncedFiles.push({ path, title });

      if (onProgress) {
        onProgress({ current: i + 1, total, importedCount, currentTitle: title });
      }
    } catch (err) {
      console.error(`Failed to import Obsidian file: ${path}`, err);
    }
  }

  return { success: true, total, importedCount, files: syncedFiles };
}
