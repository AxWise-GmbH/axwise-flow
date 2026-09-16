/**
 * Composio client — singleton wrapper for the Composio SDK.
 *
 * Provides lazy-initialized client and user-scoped sessions.
 * Requires COMPOSIO_API_KEY environment variable.
 */
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('composio-client');

const COMPOSIO_API_URL = 'https://backend.composio.dev/api/v2';

let _apiKey = null;

function getApiKey() {
  if (!_apiKey) {
    _apiKey = process.env.COMPOSIO_API_KEY;
    if (!_apiKey) throw new Error('Missing COMPOSIO_API_KEY environment variable');
  }
  return _apiKey;
}

/**
 * Build headers for Composio API requests.
 */
export function composioHeaders() {
  return {
    'x-api-key': getApiKey(),
    'Content-Type': 'application/json',
  };
}

/**
 * Get the Composio API base URL.
 */
export function composioBaseUrl() {
  return COMPOSIO_API_URL;
}

/**
 * Check if Composio is configured (API key present).
 */
export function isComposioConfigured() {
  return !!process.env.COMPOSIO_API_KEY;
}
