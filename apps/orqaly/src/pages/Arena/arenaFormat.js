/**
 * Formatting for Arena's business numbers.
 *
 * One rule runs through all of it: a missing value renders as a dash, never as
 * zero. No rate means no money, not free work, and the page must not blur the
 * two.
 */

export const DASH = '—';

/** Money, or a dash when nothing could be resolved. */
export function money(value, currency = 'EUR') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return DASH;
  const n = Number(value);
  const symbol = { EUR: '€', USD: '$', GBP: '£' }[currency] || `${currency} `;
  if (Math.abs(n) >= 1000) return `${symbol}${Math.round(n).toLocaleString()}`;
  if (Math.abs(n) >= 1) return `${symbol}${n.toFixed(2)}`;
  return `${symbol}${n.toFixed(2)}`;
}

/** Minutes as the shortest thing a human reads at a glance. */
export function duration(minutes) {
  if (minutes === null || minutes === undefined || !Number.isFinite(Number(minutes))) return DASH;
  const m = Math.max(0, Math.round(Number(minutes)));
  if (m < 60) return `${m}m`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  if (hours < 24) return rest ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** Hours, for the capacity figure. */
export function hours(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return DASH;
  return `${Math.round(Number(value)).toLocaleString()} h`;
}

export function percent(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return DASH;
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export function stars(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return DASH;
  return Number(value).toFixed(1);
}

export function count(value) {
  if (value === null || value === undefined) return DASH;
  return Number(value).toLocaleString();
}

/** Compact date, e.g. "20 Aug 16:40". */
export function when(iso, { withTime = true } = {}) {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (!withTime) return date;
  return `${date} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

export const RECOMMENDATION_LABEL = {
  hand_over: 'Hand over',
  assist: 'Assist',
  keep_human: 'Keep human',
  not_enough_yet: 'Not enough yet',
};

/**
 * Palette key per recommendation. Handing work over is the good outcome, so it
 * reads as success; keep-human is a warning rather than an error, because it is
 * a finding, not a fault.
 */
export const RECOMMENDATION_TONE = {
  hand_over: 'success',
  assist: 'info',
  keep_human: 'warning',
  not_enough_yet: 'default',
};

export const CONFIDENCE_LABEL = {
  good: 'confidence good',
  low: 'confidence low',
  none: 'not enough evidence',
};

export const OUTCOME_LABEL = {
  accepted: 'accepted',
  rework: 'sent back',
  rejected: 'rejected',
};

export const MODE_LABEL = {
  mirror: 'mirrored task',
  roadmap: 'own roadmap',
};
