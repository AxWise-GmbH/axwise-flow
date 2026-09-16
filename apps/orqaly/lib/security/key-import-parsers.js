/**
 * Parse uploaded/pasted content into `{ name, value }` entries, then map each
 * to a known provider (or leave as "unknown" for user override).
 *
 * Supported formats:
 *  - env: dotenv (`KEY=value` per line, `export` prefix, quoted values)
 *  - json: flat or one-level-nested object of string values
 *  - csv: 1Password and Bitwarden exports (auto-detected by header)
 *  - paste: auto (env first, fall back to json)
 */
import { PROVIDER_CATALOG } from './provider-catalog.js';
import { PROVIDERS as UI_PROVIDERS } from '../../src/data/providerCatalog.js';

const MAX_ENTRIES = 200;
const MAX_VALUE_LEN = 4096;
// Reject ASCII control chars except \t \n \r
// eslint-disable-next-line no-control-regex
const BINARY_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

/** Reverse lookup: `OPENAI_API_KEY` → `llm:openai` and fuzzy label → id. */
function buildProviderMaps() {
  const envToId = {};
  for (const [id, entry] of Object.entries(PROVIDER_CATALOG)) {
    if (entry.envVar) envToId[entry.envVar.toUpperCase()] = id;
  }
  const labelToId = {};
  for (const p of UI_PROVIDERS) {
    if (p.label) labelToId[p.label.toLowerCase()] = p.id;
  }
  return { envToId, labelToId };
}

const { envToId: ENV_TO_ID, labelToId: LABEL_TO_ID } = buildProviderMaps();

export function mapNameToProvider(name) {
  if (!name) return null;
  const upper = String(name).toUpperCase().trim();
  if (ENV_TO_ID[upper]) return ENV_TO_ID[upper];
  const lower = String(name).toLowerCase().trim();
  if (LABEL_TO_ID[lower]) return LABEL_TO_ID[lower];
  // Partial label match: "OpenAI Prod Key" → llm:openai
  for (const [label, id] of Object.entries(LABEL_TO_ID)) {
    if (lower.includes(label)) return id;
  }
  return null;
}

function cleanValue(raw) {
  if (typeof raw !== 'string') return null;
  let v = raw.trim();
  if (v.length === 0) return null;
  if (v.length > MAX_VALUE_LEN) return null;
  if (BINARY_RE.test(v)) return null;
  // Strip surrounding single or double quotes
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v || null;
}

function cleanName(raw) {
  if (!raw) return null;
  const n = String(raw).trim();
  if (n.length === 0 || n.length > 128) return null;
  return n;
}

function capAndDedupe(entries) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    if (!e || !e.name || !e.value) continue;
    const key = `${e.name}:${e.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}

// ── env / dotenv ────────────────────────────────────────────────────────────
export function parseEnv(text) {
  const entries = [];
  const lines = String(text || '').split(/\r?\n/);
  const pattern = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = pattern.exec(trimmed);
    if (!m) continue;
    const name = cleanName(m[1]);
    const value = cleanValue(m[2]);
    if (name && value) entries.push({ name, value });
  }
  return capAndDedupe(entries);
}

// ── json ────────────────────────────────────────────────────────────────────
export function parseJson(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return []; }
  if (!parsed || typeof parsed !== 'object') return [];

  const entries = [];
  const push = (name, value) => {
    const n = cleanName(name);
    const v = cleanValue(value);
    if (n && v) entries.push({ name: n, value: v });
  };

  // Flat object
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === 'string') push(k, v);
    else if (v && typeof v === 'object' && typeof v.value === 'string') {
      // { OPENAI_API_KEY: { value: "sk-...", note: "..." } } (Doppler-ish)
      push(k, v.value);
    } else if (v && typeof v === 'object' && typeof v.computed === 'string') {
      push(k, v.computed);
    } else if (v && typeof v === 'object') {
      // Nested one level, e.g. { secrets: { ... } }
      for (const [k2, v2] of Object.entries(v)) {
        if (typeof v2 === 'string') push(k2, v2);
      }
    }
  }

  return capAndDedupe(entries);
}

// ── csv ─────────────────────────────────────────────────────────────────────
// Minimal CSV split that respects double-quoted cells containing commas.
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { cur += c; }
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

export function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const nameIdx =
    header.indexOf('name') >= 0 ? header.indexOf('name')
      : header.indexOf('title') >= 0 ? header.indexOf('title')
      : 0;

  // 1Password / generic: 'password' column. Bitwarden: 'login_password'.
  let valueIdx = header.indexOf('login_password');
  if (valueIdx < 0) valueIdx = header.indexOf('password');
  if (valueIdx < 0) valueIdx = header.indexOf('value');
  if (valueIdx < 0) valueIdx = header.indexOf('secret');
  if (valueIdx < 0) return [];

  const entries = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const name = cleanName(cells[nameIdx]);
    const value = cleanValue(cells[valueIdx]);
    if (name && value) entries.push({ name, value });
  }
  return capAndDedupe(entries);
}

// ── dispatcher ──────────────────────────────────────────────────────────────

/**
 * Parse + map entries.
 * @param {string} content
 * @param {'env'|'json'|'csv'|'paste'|'yaml'} format
 * @returns {Array<{name, value, provider: string|null, matched: boolean, maskedPreview: string}>}
 */
export function parseAndMap(content, format) {
  let entries = [];
  if (format === 'env') entries = parseEnv(content);
  else if (format === 'json') entries = parseJson(content);
  else if (format === 'csv') entries = parseCsv(content);
  else if (format === 'paste' || format === 'yaml') {
    entries = parseEnv(content);
    if (entries.length === 0) entries = parseJson(content);
  } else {
    entries = [];
  }

  return entries.map((e) => {
    const provider = mapNameToProvider(e.name);
    return {
      name: e.name,
      value: e.value,
      provider,
      matched: !!provider,
      maskedPreview: maskForPreview(e.value),
    };
  });
}

export function maskForPreview(v) {
  if (!v || v.length <= 11) return '•'.repeat(Math.max(4, (v || '').length));
  return `${v.slice(0, 7)}•••••${v.slice(-4)}`;
}

export function detectFormatFromFilename(filename) {
  if (!filename) return null;
  const lower = filename.toLowerCase();
  if (lower.endsWith('.env') || lower.includes('.env.')) return 'env';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  if (lower.endsWith('.txt')) return 'paste';
  return null;
}
