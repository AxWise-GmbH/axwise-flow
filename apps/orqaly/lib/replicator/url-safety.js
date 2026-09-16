/**
 * URL safety guard for SSRF prevention on user-supplied URLs (OpenAPI URL, docs URL).
 *
 * v1 rules (see plan Phase 8 for hardening roadmap):
 *   - only https:// (http:// rejected unless allowLocalhost = true for dev)
 *   - reject hosts that resolve to private / loopback / link-local IPv4 ranges
 *     unless allowLocalhost = true
 *   - reject exotic schemes (file:, ftp:, data:, etc.)
 *
 * Hostname-based check only in v1 — we do NOT perform DNS resolution ourselves
 * because it adds latency and a separate network call; the fetch itself fails
 * fast for internal hostnames on Vercel's edge runtime. Adequate for Phase 5.
 */

const PRIVATE_HOSTNAME_RE = /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0$|::1$|fc00:|fe80:)/i;

export function validateExternalUrl(rawUrl, { allowLocalhost = false } = {}) {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return { ok: false, reason: 'URL is required.' };
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'Not a valid URL.' };
  }
  if (parsed.protocol !== 'https:' && !(allowLocalhost && parsed.protocol === 'http:')) {
    return { ok: false, reason: 'Only https:// URLs are accepted.' };
  }
  const host = parsed.hostname;
  if (!allowLocalhost && PRIVATE_HOSTNAME_RE.test(host)) {
    return { ok: false, reason: 'Private / loopback hosts are not allowed.' };
  }
  return { ok: true, url: parsed.toString() };
}

const ALLOWED_CONTENT_TYPES = [
  'application/json',
  'application/vnd.oai.openapi+json',
  'text/json',
];

export function isAllowedContentType(contentType) {
  if (!contentType) return false;
  const base = String(contentType).toLowerCase().split(';')[0].trim();
  return ALLOWED_CONTENT_TYPES.includes(base);
}

export const MAX_OPENAPI_BYTES = 2 * 1024 * 1024; // 2MB
