/**
 * URL validation for tool executors — prevents SSRF attacks.
 * Blocks private IPs, cloud metadata endpoints, and non-HTTPS URLs.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  '[::1]',
  'metadata.google.internal',
]);

/**
 * Check if an IP address is private/internal.
 */
function isPrivateIp(hostname) {
  // IPv4 private ranges
  if (/^10\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^127\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true; // link-local + AWS metadata
  if (/^0\./.test(hostname)) return true;
  return false;
}

/**
 * Validate a tool URL for SSRF safety.
 * @param {string} url — URL to validate
 * @throws {Error} if URL is blocked
 */
export function validateToolUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Tool URL is required');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Tool URL is not a valid URL');
  }

  // Require HTTPS
  if (parsed.protocol !== 'https:') {
    throw new Error('Tool URL must use HTTPS');
  }

  // Block known dangerous hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error('Tool URL points to a blocked host');
  }

  // Block private/internal IP addresses
  if (isPrivateIp(hostname)) {
    throw new Error('Tool URL points to a private/internal IP address');
  }
}
