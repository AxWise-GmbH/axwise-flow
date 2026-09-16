/**
 * Temporary email client using mail.tm API (free, no API key).
 * Creates disposable email addresses for account verification flows.
 */
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('temp-email');
const BASE_URL = 'https://api.mail.tm';
const TIMEOUT_MS = 8000;

/**
 * Create a new disposable email account.
 * 1. Fetches available domains
 * 2. Creates account with random address
 * 3. Authenticates to get JWT
 *
 * @returns {Promise<{ address: string, password: string, token: string }>}
 */
export async function createEmail() {
  // Step 1: Get available domain
  const domainRes = await fetchWithRetry(`${BASE_URL}/domains`, { method: 'GET' }, { timeoutMs: TIMEOUT_MS, retries: 1 });
  const domainBody = await domainRes.json();
  const domains = domainBody?.['hydra:member'] || domainBody?.member || domainBody;
  if (!Array.isArray(domains) || domains.length === 0) {
    throw new Error('No email domains available from mail.tm');
  }
  const domain = domains[0].domain;

  // Step 2: Generate random address
  const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const address = `orch-${rand}@${domain}`;
  const password = `OrchPass${Date.now().toString(36)}!${Math.random().toString(36).slice(2, 8)}`;

  // Step 3: Create account
  const createRes = await fetchWithRetry(
    `${BASE_URL}/accounts`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, password }),
    },
    { timeoutMs: TIMEOUT_MS, retries: 0 },
  );

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => '');
    throw new Error(`Failed to create email account: ${createRes.status} ${errText.slice(0, 200)}`);
  }

  // Step 4: Authenticate to get JWT
  const tokenRes = await fetchWithRetry(
    `${BASE_URL}/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, password }),
    },
    { timeoutMs: TIMEOUT_MS, retries: 0 },
  );

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    throw new Error(`Failed to authenticate email: ${tokenRes.status} ${errText.slice(0, 200)}`);
  }

  const tokenBody = await tokenRes.json();
  const token = tokenBody.token;
  if (!token) throw new Error('No token returned from mail.tm');

  log.info(null, 'email.created', { address });
  return { address, password, token };
}

/**
 * Check inbox for new messages.
 *
 * @param {string} token - JWT from createEmail
 * @returns {Promise<Array<{ id: string, from: string, subject: string, intro: string }>>}
 */
export async function checkInbox(token) {
  if (!token) throw new Error('Missing email token');

  const res = await fetchWithRetry(
    `${BASE_URL}/messages`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    },
    { timeoutMs: TIMEOUT_MS, retries: 1 },
  );

  if (!res.ok) return [];
  const body = await res.json();
  const messages = body?.['hydra:member'] || body?.member || body;

  return (Array.isArray(messages) ? messages : []).map((m) => ({
    id: m.id || m['@id']?.split('/').pop(),
    from: m.from?.address || m.from?.name || '',
    subject: m.subject || '',
    intro: m.intro || '',
  }));
}

/**
 * Read a specific email message body.
 *
 * @param {string} token - JWT from createEmail
 * @param {string} messageId - Message ID from checkInbox
 * @returns {Promise<{ subject: string, text: string, html: string }>}
 */
export async function readMessage(token, messageId) {
  if (!token || !messageId) throw new Error('Missing token or messageId');

  const res = await fetchWithRetry(
    `${BASE_URL}/messages/${messageId}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    },
    { timeoutMs: TIMEOUT_MS, retries: 0 },
  );

  if (!res.ok) {
    throw new Error(`Failed to read message ${messageId}: ${res.status}`);
  }

  const msg = await res.json();
  return {
    subject: msg.subject || '',
    text: msg.text || '',
    html: msg.html?.join?.('') || (typeof msg.html === 'string' ? msg.html : ''),
  };
}

/**
 * Extract verification link from email HTML/text body.
 * Looks for URLs near keywords: verify, confirm, activate, click here.
 *
 * @param {string} body - Email body (HTML or plain text)
 * @returns {string|null} - Verification URL or null
 */
export function extractVerificationLink(body) {
  if (!body) return null;

  // Try to find href links near verification keywords
  const hrefPattern = /href=["']?(https?:\/\/[^"'\s>]+)["']?/gi;
  const keywords = /verify|confirm|activate|validat|click.here|complete.registration/i;

  // Scan all links, score by proximity to keywords
  const links = [];
  let match;
  while ((match = hrefPattern.exec(body)) !== null) {
    const url = match[1];
    // Check 200 chars around the link for keywords
    const start = Math.max(0, match.index - 100);
    const end = Math.min(body.length, match.index + url.length + 100);
    const context = body.slice(start, end);
    if (keywords.test(context)) {
      links.push(url);
    }
  }

  if (links.length > 0) return links[0];

  // Fallback: look for URLs in plain text near keywords
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  while ((match = urlPattern.exec(body)) !== null) {
    const start = Math.max(0, match.index - 100);
    const end = Math.min(body.length, match.index + match[0].length + 100);
    const context = body.slice(start, end);
    if (keywords.test(context)) {
      return match[0];
    }
  }

  return null;
}
