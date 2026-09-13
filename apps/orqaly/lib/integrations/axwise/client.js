/**
 * AxWise Flow Engine HTTP client.
 *
 * The ONLY module that speaks the AxWise wire protocol. Modeled on
 * lib/integrations/virustotal.js: lazy env credentials, fetchWithRetry from
 * api/_lib/fetch.js, throw on non-ok. Machine-to-machine auth via the shared
 * `x-axwise-key` header (NOT an end-user JWT).
 *
 * POST <AXWISE_API_URL>/conditions/evaluate
 */
import { fetchWithRetry } from '../../../api/_lib/fetch.js';
import { normalizeAxwiseApiUrl } from './url-policy.js';

/** Per-integration-point timeout budgets (ms). Copilot is on the chat hot path. */
const TIMEOUT_MS = {
  'consilium.create': 10_000,
  'agent.generate': 8_000,
  'copilot.chat': 3_500,
  'copilot.ground': 8_000,
};

/**
 * AxWise requires both tenant identifiers. Orqaly's personal-workspace chat
 * routes legitimately have no organization row, so the authenticated user is
 * the stable tenant boundary for both fields in that case. This normalization
 * lives at the wire boundary so every current and future caller gets the same
 * contract, while telemetry can keep its real database organization_id null.
 */
export function normalizeAxwiseTenant(tenant) {
  const userId = String(tenant?.userId || '').trim();
  if (!userId) throw new Error('evaluateConditions: tenant.userId is required');
  const orgId = String(tenant?.orgId || '').trim() || userId;
  return { ...(tenant || {}), userId, orgId };
}

/**
 * Call the AxWise conditions gateway.
 *
 * @param {import('./types.js').EvaluationContext} context
 * @param {object} [opts]
 * @param {string} [opts.apiUrl]    - defaults to process.env.AXWISE_API_URL
 * @param {string} [opts.apiKey]    - defaults to process.env.AXWISE_API_KEY
 * @param {number} [opts.timeoutMs] - overrides the per-point default
 * @returns {Promise<import('./types.js').ConditionsEvaluationResponse>}
 * @throws {Error} on missing config or non-2xx response
 */
export async function evaluateConditions(context, opts = {}) {
  const { integrationPoint, requestId, tenant, payload, hints } = context || {};
  if (!integrationPoint) throw new Error('evaluateConditions: integrationPoint is required');
  const normalizedTenant = normalizeAxwiseTenant(tenant);

  const apiUrl = opts.apiUrl || process.env.AXWISE_API_URL;
  const apiKey = opts.apiKey || process.env.AXWISE_API_KEY;
  if (!apiUrl) throw new Error('AXWISE_API_URL not configured');
  if (!apiKey) throw new Error('AXWISE_API_KEY not configured');

  const timeoutMs = opts.timeoutMs || TIMEOUT_MS[integrationPoint] || 8_000;
  const base = normalizeAxwiseApiUrl(apiUrl);

  const res = await fetchWithRetry(
    `${base}/conditions/evaluate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-axwise-key': apiKey,
      },
      body: JSON.stringify({
        integrationPoint,
        requestId,
        tenant: normalizedTenant,
        payload,
        hints,
      }),
    },
    { timeoutMs, retries: 1 }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`AxWise API error: HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}
