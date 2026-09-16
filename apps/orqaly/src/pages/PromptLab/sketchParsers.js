/**
 * Pure parsers for the Sketch import dialog.
 *
 * Every function returns one of:
 *   { ok: true, prompts: [{ name, description, content, sourceMeta }] }
 *   { ok: false, error: string }
 *
 * Keeping these pure means the dialog can stay thin and we can unit-test
 * the parsing rules without touching the DOM, Supabase, or FileReader.
 */

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

export function stripExt(filename) {
  if (!filename) return 'Untitled';
  const base = String(filename).split('/').pop();
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Parse a minimal subset of YAML frontmatter: `key: value` lines at the top
 * of a markdown file. Returns { meta, body }. No dep on a real YAML parser -
 * we only need title/description/tags.
 */
export function parseFrontmatter(text) {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const rawLine of m[1].split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }
    if (key) meta[key] = value;
  }
  return { meta, body: text.slice(m[0].length) };
}

function pickName(meta, fallback) {
  return (
    (typeof meta.title === 'string' && meta.title.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    fallback
  );
}

function pickDescription(meta) {
  const d = meta.description || meta.summary || null;
  return typeof d === 'string' && d.trim() ? d.trim() : null;
}

function pickTags(meta) {
  if (Array.isArray(meta.tags)) return meta.tags.filter((t) => typeof t === 'string');
  return [];
}

/** Parse a .md file - frontmatter optional. */
export function parseMarkdown(filename, text) {
  const { meta, body } = parseFrontmatter(text);
  const content = body.trim();
  if (!content) return { ok: false, error: 'Markdown file is empty after frontmatter.' };
  return {
    ok: true,
    prompts: [
      {
        name: pickName(meta, stripExt(filename)),
        description: pickDescription(meta),
        content,
        sourceMeta: { filename, mime: 'text/markdown', frontmatter: meta, tags: pickTags(meta) },
      },
    ],
  };
}

/** Parse a .txt file - no frontmatter handling. */
export function parsePlainText(filename, text) {
  const content = String(text || '').trim();
  if (!content) return { ok: false, error: 'Text file is empty.' };
  return {
    ok: true,
    prompts: [
      {
        name: stripExt(filename),
        description: null,
        content,
        sourceMeta: { filename, mime: 'text/plain' },
      },
    ],
  };
}

/**
 * Parse a .json file - accepts a single object or an array of objects.
 * Required per record: `content` (or `prompt` / `body` alias).
 * Optional: `name`, `description`, `tags`.
 */
export function parseJson(filename, text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err.message}` };
  }
  const records = Array.isArray(parsed) ? parsed : [parsed];
  if (!records.length) return { ok: false, error: 'JSON array is empty.' };

  const prompts = [];
  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i] || {};
    const content = rec.content ?? rec.prompt ?? rec.body;
    if (typeof content !== 'string' || !content.trim()) {
      return { ok: false, error: `Record ${i + 1} is missing a "content" (or "prompt") string.` };
    }
    const name =
      typeof rec.name === 'string' && rec.name.trim()
        ? rec.name.trim()
        : stripExt(filename) + (records.length > 1 ? ` #${i + 1}` : '');
    const description =
      typeof rec.description === 'string' && rec.description.trim() ? rec.description.trim() : null;
    const tags = Array.isArray(rec.tags) ? rec.tags.filter((t) => typeof t === 'string') : [];
    prompts.push({
      name,
      description,
      content: content.trim(),
      sourceMeta: { filename, mime: 'application/json', index: i, tags },
    });
  }
  return { ok: true, prompts };
}

/**
 * Dispatch by extension. Returns the same shape as the specific parsers.
 * Callers should feed this the decoded text of a user-chosen file.
 */
export function parseSketchFile(filename, text) {
  const name = (filename || '').toLowerCase();
  if (name.endsWith('.md') || name.endsWith('.markdown')) return parseMarkdown(filename, text);
  if (name.endsWith('.json')) return parseJson(filename, text);
  if (name.endsWith('.txt') || name.endsWith('.text') || name === '')
    return parsePlainText(filename, text);
  return { ok: false, error: `Unsupported file type: ${filename}. Use .md, .json, or .txt.` };
}

export const SUPPORTED_EXTENSIONS = ['.md', '.markdown', '.txt', '.text', '.json'];
export const MAX_FILE_BYTES = 1_000_000; // 1 MB guard against accidental huge pastes
