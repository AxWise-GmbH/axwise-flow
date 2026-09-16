/**
 * Tiny shared formatters used by the goal-detail popup cards. Extracted so
 * Cards 1–4 don't each copy the same helpers (and so a fix in one place
 * fixes all of them).
 */

export function fmtDuration(seconds) {
  const sec = Number(seconds);
  if (!Number.isFinite(sec) || sec < 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

export function fmtRelative(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function fmtCriterion(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (!value || typeof value !== 'object') return '';
  for (const key of ['test', 'criterion', 'description', 'requirement', 'text', 'title', 'value']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'number' || typeof candidate === 'boolean') return String(candidate);
  }
  return Object.entries(value)
    .filter(([, candidate]) => ['string', 'number', 'boolean'].includes(typeof candidate))
    .map(([key, candidate]) => `${key.replace(/_/g, ' ')}: ${String(candidate).trim()}`)
    .filter((entry) => !entry.endsWith(':'))
    .join(' · ');
}

/**
 * The sentence complete.js writes into `summary` when the overview LLM call
 * does not come back.
 */
const OVERVIEW_FAILED = /project overview generation failed/i;

/**
 * The summary a person should read, or nothing.
 *
 * complete.js falls back to its own failure sentence when the overview LLM
 * call does not come back. That sentence names an internal tab and reads as a
 * bug report; it is never what to show someone who asked for a goal. Every
 * surface that prints the summary goes through here so the placeholder can
 * only ever be caught in one place.
 */
export function goalResultSummary(goal) {
  const text = String(goal?.data?.project_overview?.summary || '').trim();
  return text && !OVERVIEW_FAILED.test(text) ? text : null;
}
