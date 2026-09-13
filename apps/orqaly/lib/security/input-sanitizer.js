/**
 * Normalize + flag-and-strip unsafe characters from user text.
 *
 * Catches:
 *  - BOM (U+FEFF) and zero-width chars (U+200B-U+200D, U+2060)
 *  - Bidi controls (U+202A-U+202E, U+2066-U+2069) — used for RTL attacks
 *  - ASCII control chars (0x00-0x1F except \t \n \r)
 *  - Mixed-script identifiers (Cyrillic + Latin in same token) — flag only
 *  - Oversized input (length cap)
 *
 * Returns cleaned text + namespaced flag list like `unicode:zero-width-stripped`.
 * Caller decides severity via content-guard.js.
 */

const ZERO_WIDTH_CHARS = /[\u200B-\u200D\u2060\uFEFF]/g;
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/g;
// Control chars except tab (0x09), LF (0x0A), CR (0x0D)
// eslint-disable-next-line no-control-regex
const DISALLOWED_CTRL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

// Script detection via Unicode property escapes (Node 12+). We check a few
// common scripts most likely to be abused in homoglyph attacks.
function countScripts(text) {
  const counts = {
    latin:      (text.match(/\p{Script=Latin}/gu) || []).length,
    cyrillic:   (text.match(/\p{Script=Cyrillic}/gu) || []).length,
    greek:      (text.match(/\p{Script=Greek}/gu) || []).length,
    armenian:   (text.match(/\p{Script=Armenian}/gu) || []).length,
  };
  return counts;
}

function hasMixedScriptToken(text) {
  // Any single alphanumeric run containing Latin + Cyrillic (classic homoglyph attack).
  const tokens = text.split(/[^\p{L}\p{N}_]+/u);
  for (const t of tokens) {
    if (!t || t.length < 3) continue;
    const counts = countScripts(t);
    const mixed = (counts.latin > 0 && counts.cyrillic > 0)
      || (counts.latin > 0 && counts.greek > 0)
      || (counts.latin > 0 && counts.armenian > 0);
    if (mixed) return true;
  }
  return false;
}

export const DEFAULT_MAX_LENGTH = 100_000;

/**
 * @param {string} raw
 * @param {{ maxLength?: number }} [opts]
 * @returns {{ cleaned: string, flags: string[] }}
 */
export function sanitizeText(raw, { maxLength = DEFAULT_MAX_LENGTH } = {}) {
  const flags = [];
  if (typeof raw !== 'string') {
    return { cleaned: '', flags: ['unicode:non-string'] };
  }

  let text = raw;

  // Length cap FIRST to avoid doing work on pathological input
  if (text.length > maxLength) {
    flags.push('unicode:length-capped');
    text = text.slice(0, maxLength);
  }

  // Normalize to NFC (composed form) — prevents decomposed/precomposed mismatches
  try {
    const normalized = text.normalize('NFC');
    if (normalized !== text) flags.push('unicode:nfc-normalized');
    text = normalized;
  } catch {
    flags.push('unicode:nfc-failed');
  }

  // Strip BOM at start
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
    flags.push('unicode:bom-stripped');
  }

  // Strip zero-width
  if (ZERO_WIDTH_CHARS.test(text)) {
    ZERO_WIDTH_CHARS.lastIndex = 0;
    text = text.replace(ZERO_WIDTH_CHARS, '');
    flags.push('unicode:zero-width-stripped');
  }

  // Strip bidi controls
  if (BIDI_CONTROLS.test(text)) {
    BIDI_CONTROLS.lastIndex = 0;
    text = text.replace(BIDI_CONTROLS, '');
    flags.push('unicode:bidi-control-stripped');
  }

  // Strip disallowed ASCII controls
  if (DISALLOWED_CTRL.test(text)) {
    DISALLOWED_CTRL.lastIndex = 0;
    text = text.replace(DISALLOWED_CTRL, '');
    flags.push('unicode:control-stripped');
  }

  // Flag mixed-script (do not strip — some legitimate text mixes scripts)
  if (hasMixedScriptToken(text)) {
    flags.push('unicode:mixed-script');
  }

  return { cleaned: text, flags };
}

/**
 * Severity of a given flag. Used by content-guard to choose action.
 *  - 'high'   → block-worthy
 *  - 'medium' → warn
 *  - 'low'    → info / audit only
 */
export function severityOfFlag(flag) {
  if (!flag || !flag.startsWith('unicode:')) return null;
  // Bidi controls are the most concerning (used in RTL override attacks).
  if (flag === 'unicode:bidi-control-stripped') return 'medium';
  return 'low';
}
