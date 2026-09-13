/**
 * Shared helpers used by every extractor.
 *
 * Kept as a separate file so all extractors use the same placeholder
 * blocklist and punctuation-trimming behavior — adding a new
 * placeholder host updates every extractor at once.
 */

// URLs that look valid but are obviously fake — agents sometimes emit
// these despite the prompt bans. Any match here causes the URL to be
// dropped from every category.
export const PLACEHOLDER_RE = /example\.com|placeholder|dummy-image|sample\.com/i;

export function isPlaceholder(url) {
  return PLACEHOLDER_RE.test(url);
}

/** Strip trailing punctuation that commonly gets glued to URLs in prose. */
export function trimTrailingPunct(url) {
  return url.replace(/[.,;:!?)\]}>'"]+$/, '');
}

/**
 * Get a normalized title from a team_task row. Strips trailing " — Goal title"
 * suffixes that get appended during task creation.
 */
export function getTaskTitle(task) {
  return (
    String(task.title || 'Deliverable')
      .replace(/\s*—\s*.*$/, '')
      .trim() || 'Deliverable'
  );
}

/**
 * Compare two URLs after normalizing trailing punctuation, trailing slashes,
 * and (optionally) query strings. Used by extractors to match scraped URLs
 * to goal_artifacts.public_url / landing_pages.deployment_url so the row
 * can be enriched with a parentId.
 */
export function urlsEqual(a, b) {
  if (!a || !b) return false;
  const normalize = (u) => {
    let s = String(u).trim();
    s = trimTrailingPunct(s);
    s = s.replace(/\/+$/, '');
    return s.toLowerCase();
  };
  return normalize(a) === normalize(b);
}

/**
 * Find a goal_artifacts row whose public_url matches the given URL and whose
 * kind is one of the allowed kinds. Returns the matched row or undefined.
 *
 * Centralised here so every extractor uses the same matching rule and we
 * can swap it out (e.g. add checksum-based matching) in one place later.
 */
export function findArtifactByUrl(artifacts, url, allowedKinds) {
  if (!Array.isArray(artifacts) || !url) return undefined;
  return artifacts.find(
    (a) => allowedKinds.includes(String(a.kind || '').toLowerCase()) && urlsEqual(a.public_url, url)
  );
}
