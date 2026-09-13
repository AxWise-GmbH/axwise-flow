/**
 * What a deliverable is, for the purpose of showing it.
 *
 * The registry already groups deliverables by where they came from - a PDF from
 * a presentation task, a CSV from a data task. This is the other question: given
 * one, what does looking at it involve? A markdown brief and a JSON export are
 * both text and both scroll; a PDF needs an embed; a repo needs a browser tab.
 * Keeping that apart from the groups means a new group gets a viewer for free by
 * naming a format, rather than by growing its own preview.
 */

/** Formats the viewer can render, and how. */
export const VIEW_FORMAT = {
  markdown: 'markdown',
  text: 'text',
  code: 'code',
  json: 'json',
  csv: 'csv',
  tsv: 'tsv',
  pdf: 'pdf',
  image: 'image',
  site: 'site',
};

/** Formats whose body is text, whether it arrives inline or over the wire. */
export const TEXTUAL_FORMATS = new Set([
  VIEW_FORMAT.markdown,
  VIEW_FORMAT.text,
  VIEW_FORMAT.code,
  VIEW_FORMAT.json,
  VIEW_FORMAT.csv,
  VIEW_FORMAT.tsv,
]);

/** Formats rendered as a grid of cells rather than as a run of text. */
export const TABULAR_FORMATS = new Set([VIEW_FORMAT.csv, VIEW_FORMAT.tsv]);

/** A short human label for the format, shown beside the title. */
export const FORMAT_LABEL = {
  markdown: 'Markdown',
  text: 'Text',
  code: 'Code',
  json: 'JSON',
  csv: 'CSV',
  tsv: 'TSV',
  pdf: 'PDF',
  image: 'Image',
  site: 'Web page',
};

/**
 * Guess a format from a filename or URL.
 *
 * Only ever a fallback: a group that knows what it produced should say so. A
 * wrong guess here shows the wrong viewer, so anything unrecognised returns
 * null and the viewer offers the file rather than pretending to render it.
 */
export function formatFromName(name) {
  const ext = String(name || '')
    .split(/[?#]/)[0]
    .split('.')
    .pop()
    .toLowerCase();
  if (['md', 'markdown', 'mdx'].includes(ext)) return VIEW_FORMAT.markdown;
  if (['txt', 'log'].includes(ext)) return VIEW_FORMAT.text;
  if (ext === 'json') return VIEW_FORMAT.json;
  if (ext === 'csv') return VIEW_FORMAT.csv;
  if (ext === 'tsv') return VIEW_FORMAT.tsv;
  if (ext === 'pdf') return VIEW_FORMAT.pdf;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return VIEW_FORMAT.image;
  if (['js', 'jsx', 'ts', 'tsx', 'css', 'html', 'py', 'sh', 'yml', 'yaml', 'sql'].includes(ext))
    return VIEW_FORMAT.code;
  return null;
}

/**
 * Split one delimited row, honouring quotes.
 *
 * A plain `split(',')` tears any cell that contains a comma - which in a
 * financial plan is most of them - and silently shifts every column after it,
 * so the table looks fine and is wrong. Doubled quotes inside a quoted cell are
 * the escape, per RFC 4180.
 */
export function splitDelimitedRow(line, delimiter = ',') {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

/**
 * Parse delimited text into rows of cells.
 *
 * Rows are split on newlines outside quotes, so a cell holding a line break
 * stays one cell. Returns [] for empty input rather than [['']], so the viewer
 * can tell "no rows" from "one blank row".
 */
export function parseDelimited(text, delimiter = ',') {
  const src = String(text || '').replace(/\r\n?/g, '\n');
  if (!src.trim()) return [];
  const lines = [];
  let line = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (char === '"') {
      // A doubled quote inside a quoted cell is an escape, not a toggle.
      if (quoted && src[i + 1] === '"') {
        line += '""';
        i += 1;
        continue;
      }
      quoted = !quoted;
      line += char;
      continue;
    }
    if (char === '\n' && !quoted) {
      lines.push(line);
      line = '';
      continue;
    }
    line += char;
  }
  if (line) lines.push(line);
  return lines.filter((row) => row.trim() !== '').map((row) => splitDelimitedRow(row, delimiter));
}
