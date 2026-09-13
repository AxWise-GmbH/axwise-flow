import { SITE_SEARCH_INDEX } from '../data/siteSearchIndex';

function normalize(str) {
  return str.toLowerCase().trim();
}

function tokenize(query) {
  return normalize(query).split(/\s+/).filter(Boolean);
}

function entryHaystack(entry) {
  return normalize(`${entry.title} ${entry.text}`);
}

function scoreEntry(entry, tokens) {
  const title = normalize(entry.title);
  const body = normalize(entry.text);
  let score = 0;
  for (const token of tokens) {
    if (!body.includes(token)) return -1;
    if (title.includes(token)) score += 5;
    const bodyCount = (
      body.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []
    ).length;
    score += bodyCount;
  }
  if (tokens.some((t) => title.includes(t))) score += 10;
  return score;
}

/**
 * Build a short snippet with highlighted token segments for UI.
 * @returns {{ parts: Array<{ text: string, highlight: boolean }>, plain: string }}
 */
export function buildSnippet(text, query, maxLen = 140) {
  const tokens = tokenize(query);
  if (!tokens.length) {
    const plain = text.slice(0, maxLen) + (text.length > maxLen ? '…' : '');
    return { parts: [{ text: plain, highlight: false }], plain };
  }

  const lower = text.toLowerCase();
  let startIdx = -1;
  for (const token of tokens) {
    const idx = lower.indexOf(token);
    if (idx === -1) continue;
    if (startIdx === -1 || idx < startIdx) startIdx = idx;
  }
  if (startIdx === -1) {
    const plain = text.slice(0, maxLen) + (text.length > maxLen ? '…' : '');
    return { parts: [{ text: plain, highlight: false }], plain };
  }

  const pad = 40;
  let sliceStart = Math.max(0, startIdx - pad);
  let sliceEnd = Math.min(text.length, sliceStart + maxLen);
  if (sliceEnd - sliceStart < maxLen && sliceEnd < text.length) {
    sliceEnd = Math.min(text.length, sliceStart + maxLen);
  }
  let excerpt = text.slice(sliceStart, sliceEnd);
  if (sliceStart > 0) excerpt = `…${excerpt}`;
  if (sliceEnd < text.length) excerpt = `${excerpt}…`;

  const parts = [];
  const re = new RegExp(
    `(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi'
  );
  let last = 0;
  let match;
  const regex = new RegExp(re.source, re.flags);
  while ((match = regex.exec(excerpt)) !== null) {
    if (match.index > last) {
      parts.push({ text: excerpt.slice(last, match.index), highlight: false });
    }
    parts.push({ text: match[0], highlight: true });
    last = match.index + match[0].length;
  }
  if (last < excerpt.length) {
    parts.push({ text: excerpt.slice(last), highlight: false });
  }
  if (!parts.length) {
    parts.push({ text: excerpt, highlight: false });
  }

  return { parts, plain: excerpt };
}

/**
 * @param {string} query
 * @param {{ limit?: number, index?: typeof SITE_SEARCH_INDEX }} [opts]
 */
export function searchSite(query, opts = {}) {
  const { limit = 50, index = SITE_SEARCH_INDEX } = opts;
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const scored = index
    .map((entry) => {
      const score = scoreEntry(entry, tokens);
      if (score < 0) return null;
      const snippet = buildSnippet(entry.text, query);
      return { entry, score, snippet };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}
