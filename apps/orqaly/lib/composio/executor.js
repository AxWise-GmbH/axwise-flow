/**
 * Composio tool executor — executes Composio actions for the ReAct loop.
 *
 * Wraps Composio's action execution API and returns results in the same
 * shape as existing platform tool results: { success, result, error, durationMs }
 */
import { createLogger } from '../../api/_lib/logger.js';
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { composioHeaders, composioBaseUrl } from './client.js';
import { isJobLeaseLostError } from '../agent-handlers/job-lease-runtime.js';

const log = createLogger('composio-executor');
const COMPOSIO_TIMEOUT_MS = 8000;

/**
 * Execute a Composio action.
 *
 * @param {string} actionName - Composio action ID (e.g. 'GITHUB_CREATE_ISSUE')
 * @param {object} args - Action parameters
 * @param {string} entityId - Composio entity ID (maps to user)
 * @returns {{ success: boolean, result: any, error?: string, durationMs: number }}
 */
export async function executeComposioAction(actionName, args, entityId) {
  const start = Date.now();

  try {
    const url = `${composioBaseUrl()}/actions/${actionName}/execute`;

    const res = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: composioHeaders(),
        body: JSON.stringify({
          entityId: entityId || 'default',
          input: args || {},
        }),
      },
      { timeoutMs: COMPOSIO_TIMEOUT_MS, retries: 0 }
    );

    const bodyText = await res.text();
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = bodyText;
    }

    if (!res.ok) {
      const errMsg =
        typeof body === 'object' ? body.message || body.error || JSON.stringify(body) : bodyText;
      log.warn('composio.execute.failed', {
        actionName,
        status: res.status,
        error: errMsg.slice(0, 200),
      });
      return {
        success: false,
        result: null,
        error: `Composio ${res.status}: ${errMsg.slice(0, 200)}`,
        durationMs: Date.now() - start,
      };
    }

    // Trim large responses to avoid bloating LLM context
    const trimmed =
      typeof body === 'string' ? body.slice(0, 3000) : JSON.stringify(body).slice(0, 3000);

    log.info('composio.execute.ok', { actionName, durationMs: Date.now() - start });

    return {
      success: true,
      result: trimmed,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    if (isJobLeaseLostError(err)) throw err;
    log.error('composio.execute.error', { actionName, error: err.message });
    return {
      success: false,
      result: null,
      error: err.message,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Get available actions for a Composio app.
 *
 * @param {string} appName - Composio app name (e.g. 'github')
 * @returns {Promise<Array>} - Array of action objects with name, description, parameters
 */
export async function getComposioActions(appName) {
  try {
    const url = `${composioBaseUrl()}/actions?appNames=${encodeURIComponent(appName)}&limit=20`;

    const res = await fetchWithRetry(
      url,
      { method: 'GET', headers: composioHeaders() },
      { timeoutMs: 6000, retries: 0 }
    );

    if (!res.ok) return [];

    const data = await res.json();
    return data.items || data.actions || data || [];
  } catch (err) {
    if (isJobLeaseLostError(err)) throw err;
    log.warn('composio.actions.failed', { appName, error: err.message });
    return [];
  }
}

/**
 * Initiate a Composio connection (OAuth flow) for an app.
 *
 * @param {string} appName - Composio app name
 * @param {string} entityId - Entity ID (user identifier)
 * @param {string} [redirectUrl] - OAuth redirect URL
 * @returns {Promise<{ redirectUrl?: string, connectionId?: string, status?: string, error?: string }>}
 */
export async function initiateComposioConnection(appName, entityId, redirectUrl) {
  try {
    const url = `${composioBaseUrl()}/connectedAccounts`;

    const res = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: composioHeaders(),
        body: JSON.stringify({
          integrationId: appName,
          entityId: entityId || 'default',
          redirectUri: redirectUrl || undefined,
        }),
      },
      { timeoutMs: 6000, retries: 0 }
    );

    const data = await res.json();
    if (!res.ok) {
      return { error: data.message || data.error || 'Connection failed' };
    }

    return {
      redirectUrl: data.redirectUrl || data.connectionUrl,
      connectionId: data.connectedAccountId || data.id,
      status: data.status || 'initiated',
    };
  } catch (err) {
    if (isJobLeaseLostError(err)) throw err;
    return { error: err.message };
  }
}

/**
 * List connected accounts for an entity.
 *
 * @param {string} entityId - Entity ID (user identifier)
 * @returns {Promise<Array>}
 */
export async function listComposioConnections(entityId) {
  try {
    const url = `${composioBaseUrl()}/connectedAccounts?entityId=${encodeURIComponent(entityId || 'default')}`;

    const res = await fetchWithRetry(
      url,
      { method: 'GET', headers: composioHeaders() },
      { timeoutMs: 6000, retries: 0 }
    );

    if (!res.ok) return [];

    const data = await res.json();
    return data.items || data.connectedAccounts || data || [];
  } catch (err) {
    if (isJobLeaseLostError(err)) throw err;
    log.warn('composio.connections.failed', { entityId, error: err.message });
    return [];
  }
}
