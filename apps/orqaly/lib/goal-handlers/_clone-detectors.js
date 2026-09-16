/**
 * Shared detectors for URL-clone landing-page goals.
 *
 * Two flavors:
 *   - Single-page clone: "take this URL and make a landing page in the same
 *     style but with new brand colors". One source URL, one output page.
 *   - Multi-source aggregate: "review this site / these pages and create one
 *     affiliate landing page". Multiple source URLs (or a sitemap-style
 *     intent), one output page.
 *
 * Both branches produce a SINGLE landing page deliverable via the existing
 * tool_landing_pages__publish flow. There is no multi-file deploy here.
 *
 * Reused by:
 *   - lib/goal-handlers/stages/pm-planning.js (route to 2-phase clone template)
 *   - lib/goal-handlers/stages/brand-seed.js (chain into clone-reference stage)
 *   - lib/goal-handlers/stages/clone-reference.js (server-side URL prefetch)
 *   - lib/goal-handlers/team-assigner.js (skip Browser Automation Lead when
 *     clone_reference is already populated)
 */

// URL regex shared across the goal pipeline. Matches explicit http(s) URLs and
// bare domains in common TLDs. Mirrors URL_OR_BRAND_RE in team-assigner.js so
// detection is consistent end-to-end. Global flag so we can iterate matches.
export const URL_PATTERN =
  /\b(https?:\/\/\S+|[a-z0-9][\w-]{1,}\.(?:com|net|io|org|co|app|gg|bet|casino|xyz|ai|dev))\b/gi;

// Landing-page surface keywords. A bare "funnel" is intentionally excluded:
// conversion/sales/marketing funnels are commonly strategy documents, not web
// surfaces. Explicit affiliate/pre-lander/landing-page language still takes
// the website path.
export const LANDING_PAGE_PATTERN =
  /\b(landing page|landing-page|website|web site|web app|web-app|marketing site|homepage|home page|microsite|one[-\s]?pager|splash page|affiliate|pre-?lander|sales page)\b/i;

// Phrases that signal "use the source as a style/structure reference, but
// swap the brand". Conservative — false positives just trigger a cheap server
// fetch, false negatives miss the clone path and fall back to the normal
// landing-page flow.
const RESTYLE_PATTERN =
  /\b(clone|copy|recreate|rebuild|remake|restyle|same style|like (?:this|that)|similar to|in the style of|based on|inspired by|with new brand|new brand|rebrand|brand it|(?:with |in )?(?:my|our|the|new) brand|with brand|with color|with palette|swap (?:colors|brand|palette)|different (?:color|brand|palette)|brand (?:colors?|palette|identity|kit|fonts?))\b/i;

// Multi-page intent. When the user says "the whole site", "all pages", or
// gives more than one URL, treat as aggregate-from-many-sources.
const MULTI_PAGE_PATTERN =
  /\b(whole site|entire site|all pages|every page|multi-?page|multiple pages|the site|review (?:the )?site|across (?:the )?(?:site|pages)|aggregate|combine (?:from|the) pages)\b/i;

// Hex color override hint — "#7C3AED" or "color #1E40AF". Strong signal that
// the user is providing a new brand color, which by itself implies restyle
// intent even without an explicit "restyle"/"clone" word.
const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b/;

// Raw goal-type detection is a legacy fallback. Treat an explicit instruction
// not to perform an action as stronger than the keyword that names it. Keep
// the negation window inside the current clause so a later, positive request
// ("do not clone X; instead rebuild Y") still works.
const NEGATED_INTENT_PREFIX_PATTERN =
  /\b(?:do\s+not|don['’]?t|never|must\s+not|should\s+not|cannot|can['’]?t|avoid|without)\b(?:\s+[\w'’/-]+){0,8}\s*$/i;
const DIRECT_RESTYLE_ACTION_PATTERN =
  /\b(clone|copy|recreate|rebuild|remake|restyle|rebrand|brand it|swap (?:colors|brand|palette))\b/i;

function intentPrefix(text, matchIndex) {
  const rawPrefix = text.slice(Math.max(0, matchIndex - 180), matchIndex);
  const clauseBoundary = Math.max(
    rawPrefix.lastIndexOf('.'),
    rawPrefix.lastIndexOf(';'),
    rawPrefix.lastIndexOf('!'),
    rawPrefix.lastIndexOf('?'),
    rawPrefix.lastIndexOf('\n')
  );
  const clausePrefix = rawPrefix.slice(clauseBoundary + 1);
  const contrast = /\b(?:but|instead|rather)\b/gi;
  let contrastMatch = null;
  for (const match of clausePrefix.matchAll(contrast)) contrastMatch = match;
  return contrastMatch
    ? clausePrefix.slice((contrastMatch.index || 0) + contrastMatch[0].length)
    : clausePrefix;
}

function keywordMatches(text, pattern) {
  const flags = `${pattern.flags.replace(/g/g, '')}g`;
  return [...String(text || '').matchAll(new RegExp(pattern.source, flags))];
}

/**
 * True when at least one keyword match is not governed by a nearby explicit
 * negation. Exported so other legacy planning heuristics use the same rule.
 */
export function hasUnnegatedKeywordMatch(text, pattern) {
  return keywordMatches(text, pattern).some(
    (match) => !NEGATED_INTENT_PREFIX_PATTERN.test(intentPrefix(String(text), match.index || 0))
  );
}

function hasNegatedKeywordMatch(text, pattern) {
  return keywordMatches(text, pattern).some((match) =>
    NEGATED_INTENT_PREFIX_PATTERN.test(intentPrefix(String(text), match.index || 0))
  );
}

/**
 * Extract every distinct URL from the goal text. Returns absolute https URLs
 * where possible; bare domains are prefixed with https://. Deduped, max 25.
 */
export function extractUrls(text) {
  if (!text) return [];
  const found = String(text).match(URL_PATTERN) || [];
  const normalized = found
    .map((u) => u.replace(/[.,;:)]+$/, ''))
    .map((u) => (u.startsWith('http') ? u : `https://${u}`))
    .filter(Boolean);
  return [...new Set(normalized)].slice(0, 25);
}

/**
 * Does this goal want a URL-clone landing page (single OR multi source)?
 * True when: at least one URL is present AND a landing-page keyword applies
 * AND either restyle intent or an explicit hex color override is present.
 */
export function isCloneRestyleGoal(goalLike) {
  const text = goalTextOf(goalLike);
  if (!text) return false;
  const urls = extractUrls(text);
  if (urls.length === 0) return false;
  if (!LANDING_PAGE_PATTERN.test(text)) return false;
  // A direct "do not clone/copy/rebuild" instruction defeats incidental
  // brand/color language unless the user also gives a distinct positive
  // restyle instruction in another clause.
  if (
    hasNegatedKeywordMatch(text, DIRECT_RESTYLE_ACTION_PATTERN) &&
    !hasUnnegatedKeywordMatch(text, DIRECT_RESTYLE_ACTION_PATTERN)
  ) {
    return false;
  }
  return hasUnnegatedKeywordMatch(text, RESTYLE_PATTERN) || HEX_COLOR_PATTERN.test(text);
}

/**
 * Is this a MULTI-source clone (e.g. "review the whole site and make one
 * affiliate page", or "combine these pages")? Always implies isCloneRestyleGoal
 * is also true.
 */
export function isMultiSourceCloneGoal(goalLike) {
  if (!isCloneRestyleGoal(goalLike)) return false;
  const text = goalTextOf(goalLike);
  if (MULTI_PAGE_PATTERN.test(text)) return true;
  // Two or more URLs in the goal text → multi by definition
  return extractUrls(text).length >= 2;
}

/**
 * Compose goalText from various input shapes:
 *   - string → use directly
 *   - goal row → join title + description
 */
export function goalTextOf(goalLike) {
  if (!goalLike) return '';
  if (typeof goalLike === 'string') return goalLike;
  const title = goalLike.title || '';
  const description = goalLike.description || '';
  return `${title} ${description}`.trim();
}
