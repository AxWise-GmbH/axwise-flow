/**
 * Phase 5 — Browserless agent-login fallback.
 *
 * For providers with no OAuth (some niche EU/Latvian SaaS), this drives
 * a headless Chrome session at chrome.browserless.io to log in and
 * extract the session cookie / API key. Callers must supply credentials from
 * an encrypted, destination-scoped runtime release; plaintext credential
 * metadata in integration_credentials is rejected by migration 194.
 *
 * NEVER used for providers that have OAuth (Stripe/Google/Meta/PostHog)
 * — agent-login violates their ToS and is a maintenance liability.
 *
 * Each provider supplies a per-provider script under `scripts/<provider>.js`
 * that describes the login steps in a tiny DSL. Keeps this file generic.
 */
import { createLogger } from '../../../api/_lib/logger.js';

const log = createLogger('integrations.agent-login');

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'https://chrome.browserless.io';
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;

/**
 * Run a provider-specific login script and return the harvested
 * credential (cookie, header, or API key) for the caller to persist.
 *
 * @param {string} provider              e.g. 'niche-saas-x'
 * @param {object} creds                 { username, password, ... }
 * @returns {Promise<object|null>}       { access_token, expires_at, ... } or null
 */
export async function runAgentLogin(provider, creds) {
  if (!BROWSERLESS_TOKEN) {
    log.warn(null, 'agent-login.no-token-configured');
    return null;
  }
  let script;
  try {
    script = (await import(`./scripts/${provider}.js`)).default;
  } catch {
    log.warn(null, 'agent-login.no-script', { provider });
    return null;
  }
  if (typeof script !== 'function') return null;

  try {
    // The script returns the data Browserless should POST as a /function payload.
    const payload = script(creds);
    const url = `${BROWSERLESS_URL}/function?token=${encodeURIComponent(BROWSERLESS_TOKEN)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      // Provider/Browserless bodies may reflect submitted credentials.
      log.warn(null, 'agent-login.failed', { provider, status: res.status });
      return null;
    }
    const json = await res.json();
    return json?.data || null;
  } catch {
    log.warn(null, 'agent-login.exception', { provider });
    return null;
  }
}
