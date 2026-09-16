/**
 * Security headers applied to every API response.
 *
 * Applied once at dispatcher level (api/app.js, api/ops.js, api/agent.js)
 * so all handlers are covered without per-handler boilerplate.
 *
 * Header rationale:
 *   X-Content-Type-Options    — prevents MIME-type sniffing (all responses are JSON)
 *   X-Frame-Options           — prevents clickjacking (API, never framed)
 *   X-XSS-Protection          — legacy XSS filter for older browsers
 *   Strict-Transport-Security — enforce HTTPS for 1 year; Vercel serves HTTPS only
 *   Content-Security-Policy   — defence-in-depth; API responses are not HTML but
 *                               CSP blocks any browser that tries to render them
 *   Referrer-Policy           — limit referrer leakage on cross-origin requests
 */

const SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
});

/**
 * Set all security headers on the response object.
 * Call this at the very start of each Vercel serverless handler,
 * before any other logic, so the headers are present on every response
 * including 4xx and 5xx error responses.
 *
 * @param {import('http').ServerResponse} res
 */
export function applySecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
}
