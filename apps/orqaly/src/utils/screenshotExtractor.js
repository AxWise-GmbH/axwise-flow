/**
 * Extract text from screenshot images (OCR) and structure it for partner form fields.
 * Uses Tesseract.js for client-side OCR.
 */

import {
  TRAFFIC_SOURCES,
  AGREEMENT_TYPES,
  GROUP_TYPES,
  FUNNEL_STATUSES,
  COUNTRY_FLAGS,
} from './constants';

const COUNTRY_CODES = Object.keys(COUNTRY_FLAGS || {});

// ─── OCR ───────────────────────────────────────────────────────────────────

/**
 * Run OCR on an image file. Returns raw text.
 * @param {File} file - Image file (PNG, JPG, etc.)
 * @returns {Promise<string>}
 */
export async function extractTextFromImage(file) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: () => {},
  });
  try {
    const { data } = await worker.recognize(file);
    return (data?.text || '').trim();
  } finally {
    await worker.terminate();
  }
}

/**
 * Run OCR on multiple image files and concatenate text.
 * @param {File[]} files
 * @param {((progress: number) => void)} [onProgress]
 * @returns {Promise<string>}
 */
export async function extractTextFromImages(files, onProgress) {
  if (!files?.length) return '';
  let fullText = '';
  const total = files.length;
  for (let i = 0; i < total; i++) {
    const text = await extractTextFromImage(files[i]);
    if (text) fullText += (fullText ? '\n\n' : '') + text;
    onProgress?.(Math.round(((i + 1) / total) * 100));
  }
  return fullText;
}

// ─── Text normalization (OCR cleanup) ───────────────────────────────────────

function normalizeText(text) {
  if (!text || !text.trim()) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\s+\n/g, '\n')
    .trim();
}

/** Split into lines and clean; merge lines that are likely continuations (no sentence end). */
function getLines(fullText) {
  const normalized = normalizeText(fullText);
  let lines = normalized
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  // Merge very short lines that are likely broken words (e.g. "part-" + "ner")
  const merged = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length <= 2 && merged.length > 0) {
      merged[merged.length - 1] += line;
    } else if (line.match(/^[a-z]-$/i) && merged.length > 0) {
      merged[merged.length - 1] += line.replace(/^-$/, '');
    } else {
      merged.push(line);
    }
  }
  return merged;
}

/** Key–value pattern: "Label: value" or "Label - value" */
function matchKeyValue(line, keys) {
  const lower = line.toLowerCase();
  for (const key of keys) {
    const keyLower = key.toLowerCase();
    const colon = new RegExp(`^${escapeRegex(keyLower)}\\s*[:\\-]\\s*(.+)$`, 'i');
    const dash = new RegExp(`^${escapeRegex(keyLower)}\\s+[-–]\\s+(.+)$`, 'i');
    let m = line.match(colon) || line.match(dash);
    if (m) return { key: keyLower, value: m[1].trim() };
  }
  return null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── UI-style parsing (ALL CAPS labels with inline values) ───────────────────
// Handles lines like: "TEAM GROUP AGREEMENT Beta Force Partner Hybrid FUNNEL STATUS CONTACT (NICK) Working @ahmed_social ..."

const UI_LABELS = [
  'TEAM',
  'GROUP',
  'AGREEMENT',
  'FUNNEL STATUS',
  'CONTACT \\(NICK\\)',
  'CONTACT \\(GROUP\\)',
  'GEO',
  'TRAFFIC SOURCES',
];
const UI_LABELS_REGEX = new RegExp(`\\b(${UI_LABELS.join('|')})\\b`, 'gi');

/**
 * Parse a dense line with UI-style labels and fill structured + categorized arrays.
 * E.g. "TEAM GROUP AGREEMENT Beta Force Partner Hybrid ... CONTACT (NICK) @ahmed_social ... GEO TRAFFIC SOURCES = EG FB"
 */
function parseUIStyleLine(
  line,
  structured,
  profileLines,
  groupTrafficLines,
  contactLines,
  reviewLines
) {
  const t = line;
  const lower = t.toLowerCase();

  // CONTACT (NICK) ... @username
  const nickMatch =
    t.match(/\bCONTACT\s*\(\s*NICK\s*\)\s*[^\w@]*(@[\w]+)/i) ||
    t.match(/CONTACT\s*\(NICK\)\s*(@[\w]+)/i);
  if (nickMatch && nickMatch[1] && !structured.telegramNick) {
    structured.telegramNick = nickMatch[1];
    contactLines.push(line);
  }

  // CONTACT (GROUP) ... t.me/... or https://t.me/...
  const groupMatch =
    t.match(/\bCONTACT\s*\(\s*GROUP\s*\)\s*[^\w]*(https?:\/\/[^\s]+|t\.me\/[\w-]+)/i) ||
    t.match(/(https?:\/\/t\.me\/[\w-]+|t\.me\/[\w-]+)/i);
  if (groupMatch) {
    const url = groupMatch[1];
    structured.telegramGroup = url.startsWith('http') ? url : `https://${url}`;
    contactLines.push(line);
  }

  // @username and t.me standalone
  if (!structured.telegramNick && /@[\w]+/.test(t)) {
    structured.telegramNick = t.match(/@[\w]+/)?.[0] || '';
  }
  if (!structured.telegramGroup && /t\.me\/[\w-]+/i.test(t)) {
    const u = t.match(/(https?:\/\/t\.me\/[\w-]+|t\.me\/[\w-]+)/i)?.[0];
    structured.telegramGroup = u && !u.startsWith('http') ? `https://${u}` : u || '';
  }

  // GEO ... = EG or GEO TRAFFIC SOURCES = EG FB (capture 2-letter codes; only country codes, not FB)
  const geoMatch = t.match(/\bGEO\b[\s\S]*?(?:=\s*)?\s*([A-Z]{2}(?:\s+[A-Z]{2})*)/i);
  if (geoMatch && geoMatch[1]) {
    const tokens = geoMatch[1].trim().split(/\s+/);
    tokens.forEach((c) => {
      const u = c.toUpperCase();
      if (c.length === 2 && COUNTRY_CODES.includes(u) && !structured.geos.includes(u)) {
        structured.geos.push(u);
      }
    });
    if (structured.geos.length) groupTrafficLines.push(line);
  }

  // TRAFFIC SOURCES = EG FB or TRAFFIC SOURCES ... FB Google (capture tokens after = or after label)
  const trafficMatch = t.match(
    /\bTRAFFIC\s+SOURCES\b[\s\S]*?(?:=\s*)?([A-Za-z]+(?:\s+[A-Za-z]+)*)/i
  );
  if (trafficMatch && trafficMatch[1]) {
    const tokens = trafficMatch[1]
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    TRAFFIC_SOURCES.forEach((src) => {
      if (
        tokens.some((tok) => tok.toUpperCase() === src.toUpperCase()) &&
        !structured.trafficSources.includes(src)
      ) {
        structured.trafficSources.push(src);
      }
    });
    if (structured.trafficSources.length) groupTrafficLines.push(line);
  }

  // FUNNEL STATUS ... Working (or other status)
  for (const f of FUNNEL_STATUSES) {
    if (
      new RegExp(`\\bFUNNEL\\s+STATUS\\b[^A-Z]*\\b${escapeRegex(f)}\\b`, 'i').test(t) ||
      new RegExp(`\\b${escapeRegex(f)}\\b`, 'i').test(t)
    ) {
      structured.funnelStatus = f;
      contactLines.push(line);
      break;
    }
  }

  // AGREEMENT: find Hybrid, Revshare, CPL in line
  for (const a of AGREEMENT_TYPES) {
    if (new RegExp(`\\b${escapeRegex(a)}\\b`, 'i').test(t)) {
      structured.agreement = a;
      contactLines.push(line);
      break;
    }
  }

  // GROUP: Partner or Webmaster
  for (const g of GROUP_TYPES) {
    if (new RegExp(`\\b${escapeRegex(g)}\\b`, 'i').test(t)) {
      structured.group = g;
      groupTrafficLines.push(line);
      break;
    }
  }

  // TEAM + GROUP + AGREEMENT block: "TEAM GROUP AGREEMENT Beta Force Partner Hybrid" -> team = "Beta Force", group = Partner, agreement = Hybrid
  const teamGroupAgreementBlock = t.match(
    /\bTEAM\s+GROUP\s+AGREEMENT\s+([\w\s]+?)(?=\s+FUNNEL|\s+CONTACT|\s+GEO|\s+TRAFFIC|$)/i
  );
  if (teamGroupAgreementBlock && teamGroupAgreementBlock[1]) {
    const block = teamGroupAgreementBlock[1].trim();
    const words = block.split(/\s+/).filter(Boolean);
    const taken = new Set();
    for (const g of GROUP_TYPES) {
      if (words.some((w) => w === g)) {
        structured.group = g;
        words.forEach((w) => {
          if (w === g) taken.add(w);
        });
        break;
      }
    }
    for (const a of AGREEMENT_TYPES) {
      if (words.some((w) => w === a)) {
        structured.agreement = a;
        words.forEach((w) => {
          if (w === a) taken.add(w);
        });
        break;
      }
    }
    const teamWords = words.filter((w) => !taken.has(w));
    if (teamWords.length && !structured.team) {
      structured.team = teamWords.join(' ').trim();
      if (!structured.name) structured.name = structured.team; // use team as partner name when it looks like "Beta Force"
    }
    groupTrafficLines.push(line);
  }

  // Standalone "TEAM ..." value before other labels (e.g. "TEAM Beta Force GROUP Partner")
  const teamOnlyMatch = t.match(/\bTEAM\s+([A-Za-z][\w\s]*?)(?=\s+GROUP\s|\s+AGREEMENT\s|$)/i);
  if (teamOnlyMatch && teamOnlyMatch[1] && !structured.team) {
    structured.team = teamOnlyMatch[1].trim();
    if (structured.team.length < 80 && !structured.name) structured.name = structured.team;
    groupTrafficLines.push(line);
  }

  // GEO and TRAFFIC from rest of line (country codes and source names anywhere)
  if (!structured.geos.length) {
    COUNTRY_CODES.forEach((c) => {
      if (new RegExp(`\\b${escapeRegex(c)}\\b`, 'i').test(t)) structured.geos.push(c);
    });
  }
  if (!structured.trafficSources.length) {
    TRAFFIC_SOURCES.forEach((src) => {
      if (new RegExp(`\\b${escapeRegex(src)}\\b`, 'i').test(t)) structured.trafficSources.push(src);
    });
  }

  return structured;
}

// ─── Structured extraction (map text → form fields) ─────────────────────────

const NAME_KEYS = ['partner', 'name', 'company', 'contact name', 'partner name', 'account'];
const TEAM_KEYS = ['team', 'unit', 'group', 'team name', 'group name', 'division'];
const GROUP_KEYS = ['group type', 'type', 'category'];
const TRAFFIC_KEYS = ['traffic', 'traffic source', 'sources', 'source', 'channel'];
const GEO_KEYS = ['geo', 'geos', 'country', 'countries', 'region', 'regions', 'target'];
const TELEGRAM_KEYS = ['telegram', 'tg', 'contact', 'username', 'nick', 'telegram nick'];
const AGREEMENT_KEYS = ['agreement', 'deal', 'deal type', 'model', 'payout'];
const FUNNEL_KEYS = ['status', 'funnel', 'funnel status', 'stage', 'stage status'];
const NOTES_KEYS = ['notes', 'note', 'comments', 'comment', 'description', 'summary', 'review'];

/**
 * Extract structured partner data from raw OCR text.
 * Uses key–value patterns, known constants, and context to fill form fields.
 * @param {string} fullText - Raw text from OCR
 * @returns {{ structured: object, categorized: { profileInfo: string, groupTraffic: string, contactsAndAgreements: string, review: string } }}
 */
export function structureExtractedText(fullText) {
  const categorized = {
    profileInfo: '',
    groupTraffic: '',
    contactsAndAgreements: '',
    review: '',
  };

  const structured = {
    name: '',
    notes: '',
    team: '',
    group: '',
    trafficSources: [],
    geos: [],
    telegramNick: '',
    telegramGroup: '',
    agreement: '',
    funnelStatus: '',
  };

  if (!fullText || !fullText.trim()) {
    return { structured, categorized };
  }

  const lines = getLines(fullText);
  const fullLower = fullText.toLowerCase();
  const profileLines = [];
  const groupTrafficLines = [];
  const contactLines = [];
  const reviewLines = [];

  // First pass: UI-style lines (ALL CAPS labels like TEAM, GROUP, AGREEMENT, CONTACT (NICK), GEO, TRAFFIC SOURCES)
  const fullLine = lines.join(' ');
  parseUIStyleLine(
    fullLine,
    structured,
    profileLines,
    groupTrafficLines,
    contactLines,
    reviewLines
  );
  for (const line of lines) {
    if (line.length > 20)
      parseUIStyleLine(
        line,
        structured,
        profileLines,
        groupTrafficLines,
        contactLines,
        reviewLines
      );
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();

    // ─── Key–value extraction ─────────────────────────────────────────────
    const kvName = matchKeyValue(line, NAME_KEYS);
    if (kvName && kvName.value.length < 120 && !structured.name) {
      structured.name = kvName.value;
      profileLines.push(line);
      continue;
    }

    const kvTeam = matchKeyValue(line, TEAM_KEYS);
    if (kvTeam && kvTeam.value.length < 100) {
      structured.team = kvTeam.value;
      groupTrafficLines.push(line);
      continue;
    }

    const kvGroup = matchKeyValue(line, GROUP_KEYS);
    if (kvGroup) {
      const v = kvGroup.value;
      for (const g of GROUP_TYPES) {
        if (new RegExp(`\\b${escapeRegex(g)}\\b`, 'i').test(v)) {
          structured.group = g;
          break;
        }
      }
      if (!structured.group && /webmaster|personal\s*traffic/i.test(v))
        structured.group = 'Webmaster';
      if (!structured.group && /partner|our\s*db/i.test(v)) structured.group = 'Partner';
      groupTrafficLines.push(line);
      continue;
    }

    const kvTraffic = matchKeyValue(line, TRAFFIC_KEYS);
    if (kvTraffic) {
      const found = TRAFFIC_SOURCES.filter((t) =>
        new RegExp(`\\b${escapeRegex(t)}\\b`, 'i').test(kvTraffic.value)
      );
      if (found.length)
        structured.trafficSources = [...new Set([...structured.trafficSources, ...found])];
      groupTrafficLines.push(line);
      continue;
    }

    const kvGeo = matchKeyValue(line, GEO_KEYS);
    if (kvGeo) {
      const codes = COUNTRY_CODES.filter((c) =>
        new RegExp(`\\b${escapeRegex(c)}\\b`, 'i').test(kvGeo.value)
      );
      if (codes.length) structured.geos = [...new Set([...structured.geos, ...codes])];
      groupTrafficLines.push(line);
      continue;
    }

    const kvTg = matchKeyValue(line, TELEGRAM_KEYS);
    if (kvTg) {
      const nick =
        kvTg.value.match(/@[\w]+/)?.[0] ||
        (kvTg.value.startsWith('@') ? kvTg.value : `@${kvTg.value.trim()}`);
      if (nick) structured.telegramNick = nick;
      const groupUrl = kvTg.value.match(/t\.me\/[\w-]+/i)?.[0];
      if (groupUrl)
        structured.telegramGroup = groupUrl.startsWith('http') ? groupUrl : `https://${groupUrl}`;
      contactLines.push(line);
      continue;
    }

    const kvAgreement = matchKeyValue(line, AGREEMENT_KEYS);
    if (kvAgreement) {
      for (const a of AGREEMENT_TYPES) {
        if (new RegExp(`\\b${escapeRegex(a)}\\b`, 'i').test(kvAgreement.value)) {
          structured.agreement = a;
          break;
        }
      }
      contactLines.push(line);
      continue;
    }

    const kvFunnel = matchKeyValue(line, FUNNEL_KEYS);
    if (kvFunnel) {
      for (const f of FUNNEL_STATUSES) {
        if (new RegExp(escapeRegex(f).replace(/\\s\+/g, '\\s+'), 'i').test(kvFunnel.value)) {
          structured.funnelStatus = f;
          break;
        }
      }
      contactLines.push(line);
      continue;
    }

    const kvNotes = matchKeyValue(line, NOTES_KEYS);
    if (kvNotes) {
      if (kvNotes.value.length > 2)
        structured.notes = (structured.notes ? structured.notes + '\n' : '') + kvNotes.value;
      reviewLines.push(line);
      continue;
    }

    // ─── Inline patterns (no label) ────────────────────────────────────────
    if (/@[\w]+/.test(line) && !structured.telegramNick) {
      structured.telegramNick = line.match(/@[\w]+/)?.[0] || '';
      contactLines.push(line);
      continue;
    }
    if (/t\.me\/[\w-]+/i.test(line) && !structured.telegramGroup) {
      const u = line.match(/t\.me\/[\w-]+/i)?.[0];
      structured.telegramGroup = u && !u.startsWith('http') ? `https://${u}` : u || '';
      contactLines.push(line);
      continue;
    }
    for (const a of AGREEMENT_TYPES) {
      if (new RegExp(`\\b${escapeRegex(a)}\\b`, 'i').test(line)) {
        if (!structured.agreement) structured.agreement = a;
        contactLines.push(line);
        break;
      }
    }
    for (const f of FUNNEL_STATUSES) {
      if (new RegExp(escapeRegex(f).replace(/\s+/g, '\\s+'), 'i').test(line)) {
        if (!structured.funnelStatus) structured.funnelStatus = f;
        contactLines.push(line);
        break;
      }
    }
    for (const g of GROUP_TYPES) {
      if (new RegExp(`\\b${escapeRegex(g)}\\b`, 'i').test(line)) {
        if (!structured.group) structured.group = g;
        groupTrafficLines.push(line);
        break;
      }
    }
    const trafficInLine = TRAFFIC_SOURCES.filter((t) =>
      new RegExp(`\\b${escapeRegex(t)}\\b`, 'i').test(line)
    );
    if (trafficInLine.length) {
      structured.trafficSources = [...new Set([...structured.trafficSources, ...trafficInLine])];
      groupTrafficLines.push(line);
      continue;
    }
    const geosInLine = COUNTRY_CODES.filter((c) =>
      new RegExp(`\\b${escapeRegex(c)}\\b`, 'i').test(line)
    );
    if (geosInLine.length) {
      structured.geos = [...new Set([...structured.geos, ...geosInLine])];
      groupTrafficLines.push(line);
      continue;
    }

    // ─── Categorize by keywords if no key–value matched ─────────────────────
    if (
      /\b(team|traffic|geo|country|source|webmaster|partner)\b/i.test(line) &&
      line.length < 150
    ) {
      groupTrafficLines.push(line);
    } else if (
      /\b(telegram|@|t\.me|agreement|revshare|cpl|hybrid|contact|funnel|status)\b/i.test(line)
    ) {
      contactLines.push(line);
    } else if (/\b(review|rating|score|feedback|note|comment)\b/i.test(lineLower)) {
      reviewLines.push(line);
    } else if (line.length > 2 && !/^\d+[.)]\s*$/.test(line)) {
      profileLines.push(line);
    }
  }

  // ─── Fallbacks: first line as name, collect notes ─────────────────────────
  if (!structured.name && profileLines.length) {
    const first = profileLines[0];
    if (first.length < 120 && !first.match(/^\d+$/)) structured.name = first;
  }
  if (!structured.notes && profileLines.length) {
    structured.notes = profileLines.join('\n');
  }
  if (structured.trafficSources.length === 0) {
    TRAFFIC_SOURCES.forEach((t) => {
      if (new RegExp(`\\b${escapeRegex(t)}\\b`, 'i').test(fullLower))
        structured.trafficSources.push(t);
    });
  }
  if (structured.geos.length === 0) {
    COUNTRY_CODES.forEach((c) => {
      if (new RegExp(`\\b${escapeRegex(c)}\\b`, 'i').test(fullLower)) structured.geos.push(c);
    });
  }

  // Build categorized display from structured data so each box shows parsed values, not raw dump
  const profileParts = [];
  if (structured.name) profileParts.push(`Partner: ${structured.name}`);
  if (structured.notes) profileParts.push(structured.notes);
  if (!profileParts.length) profileParts.push(...[...new Set(profileLines)].filter(Boolean));

  const groupTrafficParts = [];
  if (structured.team) groupTrafficParts.push(`Team: ${structured.team}`);
  if (structured.group) groupTrafficParts.push(`Group: ${structured.group}`);
  if (structured.trafficSources.length)
    groupTrafficParts.push(`Traffic: ${structured.trafficSources.join(', ')}`);
  if (structured.geos.length) groupTrafficParts.push(`Geo: ${structured.geos.join(', ')}`);
  if (!groupTrafficParts.length)
    groupTrafficParts.push(...[...new Set(groupTrafficLines)].filter(Boolean));

  const contactParts = [];
  if (structured.telegramNick) contactParts.push(`Contact (nick): ${structured.telegramNick}`);
  if (structured.telegramGroup) contactParts.push(`Contact (group): ${structured.telegramGroup}`);
  if (structured.agreement) contactParts.push(`Agreement: ${structured.agreement}`);
  if (structured.funnelStatus) contactParts.push(`Funnel status: ${structured.funnelStatus}`);
  if (!contactParts.length) contactParts.push(...[...new Set(contactLines)].filter(Boolean));

  categorized.profileInfo = profileParts.join('\n').trim();
  categorized.groupTraffic = groupTrafficParts.join('\n').trim();
  categorized.contactsAndAgreements = contactParts.join('\n').trim();
  categorized.review = [...new Set(reviewLines)].join('\n').trim();

  return { structured, categorized };
}

/**
 * Legacy: categorize only (no structured object). Uses structureExtractedText under the hood.
 * @param {string} fullText
 * @returns {{ profileInfo: string, groupTraffic: string, contactsAndAgreements: string, review: string }}
 */
export function categorizeExtractedText(fullText) {
  const { categorized } = structureExtractedText(fullText);
  return categorized;
}

/**
 * Suggest form payload from structured + categorized data.
 * Prefer structured fields; fill only non-empty so we don't overwrite with blanks.
 * @param {{ structured: object, categorized: object }} result - From structureExtractedText
 * @returns {Partial<{ name: string, notes: string, team: string, group: string, trafficSources: string[], geos: string[], telegramNick: string, telegramGroup: string, agreement: string, funnelStatus: string }>}
 */
export function suggestFormFromExtracted(result) {
  const { structured, categorized } =
    result && result.structured != null ? result : { structured: {}, categorized: result || {} };
  const out = {};

  if (structured.name?.trim()) out.name = structured.name.trim();
  if (structured.notes?.trim()) out.notes = structured.notes.trim();
  if (structured.team?.trim()) out.team = structured.team.trim();
  if (structured.group) out.group = structured.group;
  if (structured.trafficSources?.length) out.trafficSources = structured.trafficSources;
  if (structured.geos?.length) out.geos = structured.geos;
  if (structured.telegramNick?.trim()) out.telegramNick = structured.telegramNick.trim();
  if (structured.telegramGroup?.trim()) out.telegramGroup = structured.telegramGroup.trim();
  if (structured.agreement) out.agreement = structured.agreement;
  if (structured.funnelStatus) out.funnelStatus = structured.funnelStatus;

  // Fallbacks from categorized text when structured is missing
  if (!out.name && categorized.profileInfo) {
    const first = categorized.profileInfo.split(/\n/)[0]?.trim();
    if (first && first.length < 120) out.name = first;
  }
  if (!out.notes && categorized.profileInfo) out.notes = categorized.profileInfo;
  if (!out.team && categorized.groupTraffic) {
    const m = categorized.groupTraffic.match(/\b(?:team|group)\s*[:\-]?\s*([^\n]+)/i);
    if (m?.[1]) out.team = m[1].trim();
  }
  if (!out.telegramNick && categorized.contactsAndAgreements) {
    const nick = categorized.contactsAndAgreements.match(/@[\w]+/)?.[0];
    if (nick) out.telegramNick = nick;
  }
  if (!out.telegramGroup && categorized.contactsAndAgreements) {
    const u = categorized.contactsAndAgreements.match(/t\.me\/[\w-]+/i)?.[0];
    if (u) out.telegramGroup = u.startsWith('http') ? u : `https://${u}`;
  }
  if (!out.agreement && categorized.contactsAndAgreements) {
    for (const a of AGREEMENT_TYPES) {
      if (new RegExp(`\\b${escapeRegex(a)}\\b`, 'i').test(categorized.contactsAndAgreements)) {
        out.agreement = a;
        break;
      }
    }
  }
  if (!out.funnelStatus && categorized.contactsAndAgreements) {
    for (const f of FUNNEL_STATUSES) {
      if (
        new RegExp(escapeRegex(f).replace(/\s+/g, '\\s+'), 'i').test(
          categorized.contactsAndAgreements
        )
      ) {
        out.funnelStatus = f;
        break;
      }
    }
  }
  if (!out.trafficSources?.length && categorized.groupTraffic) {
    const found = TRAFFIC_SOURCES.filter((t) =>
      new RegExp(`\\b${escapeRegex(t)}\\b`, 'i').test(categorized.groupTraffic)
    );
    if (found.length) out.trafficSources = found;
  }
  if (!out.geos?.length && categorized.groupTraffic) {
    const found = COUNTRY_CODES.filter((c) =>
      new RegExp(`\\b${escapeRegex(c)}\\b`, 'i').test(categorized.groupTraffic)
    );
    if (found.length) out.geos = found;
  }

  return out;
}
